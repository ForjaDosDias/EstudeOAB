jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../src/services/mercadopago.service', () => ({
  createPixPayment: jest.fn(),
  createCardPayment: jest.fn(),
  getPayment: jest.fn(),
  PREMIUM_PRICE_CENTAVOS: 2990,
}));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../src/db');
const mp = require('../../src/services/mercadopago.service');

const app = express();
app.use(express.json());
app.use('/api/payments', require('../../src/routes/payments'));

const JWT_SECRET = process.env.JWT_SECRET;

function token(userId = 1) {
  return jwt.sign({ userId, email: 'u@oab.com', role: 'user' }, JWT_SECRET);
}

beforeEach(() => jest.clearAllMocks());

// ── GET /config ───────────────────────────────────────────────────────────────

describe('GET /api/payments/config', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/payments/config');
    expect(res.status).toBe(401);
  });

  it('200 retorna preço e plano', async () => {
    const res = await request(app)
      .get('/api/payments/config')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.valorCentavos).toBe(2990);
    expect(res.body.plano).toBe('premium_mensal');
    expect(res.body.dias).toBe(30);
  });
});

// ── POST /pix ─────────────────────────────────────────────────────────────────

describe('POST /api/payments/pix', () => {
  it('401 sem token', async () => {
    const res = await request(app).post('/api/payments/pix');
    expect(res.status).toBe(401);
  });

  it('201 cria pagamento Pix e retorna QR code', async () => {
    mp.createPixPayment.mockResolvedValueOnce({
      id: 123456,
      status: 'pending',
      date_of_expiration: '2026-06-11T23:59:59.000-04:00',
      point_of_interaction: {
        transaction_data: { qr_code: 'pix-copia-e-cola', qr_code_base64: 'aW1n' },
      },
    });
    pool.query.mockResolvedValueOnce({ rows: [{ id: 10 }] }); // INSERT payments

    const res = await request(app)
      .post('/api/payments/pix')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(201);
    expect(res.body.mpPaymentId).toBe('123456');
    expect(res.body.qrCode).toBe('pix-copia-e-cola');
    expect(res.body.qrCodeBase64).toBe('aW1n');
    expect(res.body.status).toBe('pending');
    expect(res.body.valorCentavos).toBe(2990);
    expect(mp.createPixPayment).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'u@oab.com', externalReference: 'user:1' })
    );
  });

  it('502 quando o Mercado Pago falha', async () => {
    mp.createPixPayment.mockRejectedValueOnce(new Error('mp down'));
    const res = await request(app)
      .post('/api/payments/pix')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(502);
  });
});

// ── POST /card ────────────────────────────────────────────────────────────────

describe('POST /api/payments/card', () => {
  it('401 sem token', async () => {
    const res = await request(app).post('/api/payments/card').send({ token: 't' });
    expect(res.status).toBe(401);
  });

  it('400 sem token de cartão', async () => {
    const res = await request(app)
      .post('/api/payments/card')
      .set('Authorization', `Bearer ${token()}`)
      .send({ paymentMethodId: 'visa' });
    expect(res.status).toBe(400);
  });

  it('201 aprova cartão e ativa premium imediatamente', async () => {
    mp.createCardPayment.mockResolvedValueOnce({
      id: 789,
      status: 'approved',
      status_detail: 'accredited',
    });
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 11 }] })                                  // INSERT payments
      .mockResolvedValueOnce({ rows: [{ user_id: 1, mp_payment_id: '789' }] })        // UPDATE payments (ativação)
      .mockResolvedValueOnce({ rows: [] })                                            // UPDATE users premium
      .mockResolvedValueOnce({ rows: [{ id: 99 }] })                                  // INSERT coin (compra)
      .mockResolvedValueOnce({ rows: [] });                                           // UPDATE users coins

    const res = await request(app)
      .post('/api/payments/card')
      .set('Authorization', `Bearer ${token()}`)
      .send({ token: 'card-token', paymentMethodId: 'master', installments: 1 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('approved');

    // ativou premium no usuário
    const updateUsers = pool.query.mock.calls.find(([sql]) => sql.includes("plan = 'premium'"));
    expect(updateUsers).toBeDefined();
    expect(updateUsers[1][0]).toBe(1);
  });

  it('201 cartão rejeitado não ativa premium', async () => {
    mp.createCardPayment.mockResolvedValueOnce({
      id: 790,
      status: 'rejected',
      status_detail: 'cc_rejected_insufficient_amount',
    });
    pool.query.mockResolvedValueOnce({ rows: [{ id: 12 }] });

    const res = await request(app)
      .post('/api/payments/card')
      .set('Authorization', `Bearer ${token()}`)
      .send({ token: 'card-token', paymentMethodId: 'master' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('rejected');
    const updateUsers = pool.query.mock.calls.find(([sql]) => sql.includes("plan = 'premium'"));
    expect(updateUsers).toBeUndefined();
  });
});

// ── GET /:id/status ───────────────────────────────────────────────────────────

describe('GET /api/payments/:id/status', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/payments/1/status');
    expect(res.status).toBe(401);
  });

  it('404 quando pagamento não existe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/payments/999/status')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });

  it('403 quando pagamento é de outro usuário', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, user_id: 2, mp_payment_id: '123', status: 'pending', ativado_em: null }],
    });
    const res = await request(app)
      .get('/api/payments/1/status')
      .set('Authorization', `Bearer ${token(1)}`);
    expect(res.status).toBe(403);
  });

  it('200 sincroniza status pendente com o MP e ativa premium quando aprovado', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 1, mp_payment_id: '123', status: 'pending', ativado_em: null }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'approved' }] })            // UPDATE payments status
      .mockResolvedValueOnce({ rows: [{ user_id: 1, mp_payment_id: '123' }] })     // UPDATE ativação
      .mockResolvedValueOnce({ rows: [] })                                         // UPDATE users premium
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })                                // INSERT coin
      .mockResolvedValueOnce({ rows: [] });                                        // UPDATE coins
    mp.getPayment.mockResolvedValueOnce({ id: 123, status: 'approved' });

    const res = await request(app)
      .get('/api/payments/1/status')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(mp.getPayment).toHaveBeenCalledWith('123');
  });
});

// ── POST /webhook ─────────────────────────────────────────────────────────────

describe('POST /api/payments/webhook', () => {
  it('200 sempre, mesmo com payload desconhecido', async () => {
    const res = await request(app).post('/api/payments/webhook').send({ foo: 'bar' });
    expect(res.status).toBe(200);
    expect(mp.getPayment).not.toHaveBeenCalled();
  });

  it('200 e sincroniza pagamento em notificação de payment', async () => {
    mp.getPayment.mockResolvedValueOnce({ id: 555, status: 'approved' });
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 3, status: 'approved' }] })            // UPDATE payments
      .mockResolvedValueOnce({ rows: [{ user_id: 7, mp_payment_id: '555' }] })     // ativação
      .mockResolvedValueOnce({ rows: [] })                                         // UPDATE users
      .mockResolvedValueOnce({ rows: [{ id: 9 }] })                                // INSERT coin
      .mockResolvedValueOnce({ rows: [] });                                        // UPDATE coins

    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ type: 'payment', data: { id: 555 } });

    expect(res.status).toBe(200);
    // resposta é enviada antes do processamento — aguarda o fluxo async
    await new Promise((r) => setTimeout(r, 20));
    expect(mp.getPayment).toHaveBeenCalledWith(555);
    const updateUsers = pool.query.mock.calls.find(([sql]) => sql.includes("plan = 'premium'"));
    expect(updateUsers).toBeDefined();
    expect(updateUsers[1][0]).toBe(7);
  });

  it('200 e sincroniza em notificação de order (Orders API)', async () => {
    mp.getPayment.mockResolvedValueOnce({ id: 'ORDTST555', status: 'approved' });
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 4, status: 'approved' }] })             // UPDATE payments
      .mockResolvedValueOnce({ rows: [{ user_id: 8, mp_payment_id: 'ORDTST555' }] })// ativação
      .mockResolvedValueOnce({ rows: [] })                                          // UPDATE users
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })                                // INSERT coin
      .mockResolvedValueOnce({ rows: [] });                                         // UPDATE coins

    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ type: 'order', data: { id: 'ORDTST555' } });

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(mp.getPayment).toHaveBeenCalledWith('ORDTST555');
  });
});
