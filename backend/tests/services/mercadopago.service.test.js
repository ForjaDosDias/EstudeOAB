// Migração para a Orders API (/v1/orders): o service traduz as respostas para
// o shape legado que as rotas consomem. Cobre a normalização de status
// (processed→approved, failed→rejected, expired→cancelled) e o cartão
// recusado, que a Orders API devolve como erro e não como status.
process.env.MP_ACCESS_TOKEN = 'TEST-token-jest';

const mp = require('../../src/services/mercadopago.service');

function mockFetch(body, { ok = true, status = 200 } = {}) {
  global.fetch = jest.fn().mockResolvedValue({ ok, status, json: async () => body });
}

const ORDER_PIX = {
  id: 'ORDTST123',
  status: 'action_required',
  status_detail: 'waiting_transfer',
  transactions: {
    payments: [{
      id: 'PAY123',
      date_of_expiration: '2026-06-13T05:33:44.419+00:00',
      payment_method: { id: 'pix', type: 'bank_transfer', qr_code: 'pix-copia-e-cola', qr_code_base64: 'aW1n' },
    }],
  },
};

afterEach(() => jest.restoreAllMocks());

describe('createPixPayment', () => {
  it('cria order Pix e traduz para o shape legado', async () => {
    mockFetch(ORDER_PIX);

    const result = await mp.createPixPayment({ email: 'u@oab.com', externalReference: 'user:1' });

    expect(result.id).toBe('ORDTST123');
    expect(result.status).toBe('pending'); // action_required → pending
    expect(result.point_of_interaction.transaction_data.qr_code).toBe('pix-copia-e-cola');
    expect(result.point_of_interaction.transaction_data.qr_code_base64).toBe('aW1n');
    expect(result.date_of_expiration).toBe('2026-06-13T05:33:44.419+00:00');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toContain('/v1/orders');
    const body = JSON.parse(opts.body);
    expect(body.total_amount).toBe('29.90');
    expect(body.transactions.payments[0].payment_method).toEqual({ id: 'pix', type: 'bank_transfer' });
    expect(body.payer.email).toBe('u@oab.com');
    expect(body.external_reference).toBe('user:1');
  });

  it('propaga erro do Mercado Pago', async () => {
    mockFetch({ message: 'Unauthorized use of live credentials' }, { ok: false, status: 401 });
    await expect(mp.createPixPayment({ email: 'u@oab.com' })).rejects.toThrow('Unauthorized use of live credentials');
  });
});

describe('createCardPayment', () => {
  it('aprovado: order processed vira status approved', async () => {
    mockFetch({ id: 'ORDTST456', status: 'processed', status_detail: 'accredited', transactions: { payments: [{}] } });

    const result = await mp.createCardPayment({ email: 'u@oab.com', token: 'tok', paymentMethodId: 'master' });

    expect(result.status).toBe('approved');
    expect(result.status_detail).toBe('accredited');
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.transactions.payments[0].payment_method).toEqual({
      id: 'master', type: 'credit_card', token: 'tok', installments: 1,
    });
  });

  it('recusado: erro failed da Orders API vira status rejected', async () => {
    mockFetch(
      { errors: [{ code: 'failed', message: 'The following transactions failed', details: ['PAY1: rejected_by_issuer'] }] },
      { ok: false, status: 422 }
    );

    const result = await mp.createCardPayment({ email: 'u@oab.com', token: 'tok', paymentMethodId: 'master' });

    expect(result.status).toBe('rejected');
    expect(result.status_detail).toBe('PAY1: rejected_by_issuer');
  });

  it('outros erros continuam sendo lançados', async () => {
    mockFetch({ errors: [{ code: 'invalid_token', message: 'token inválido' }] }, { ok: false, status: 400 });
    await expect(mp.createCardPayment({ email: 'u@oab.com', token: 'x', paymentMethodId: 'master' })).rejects.toThrow('token inválido');
  });
});

describe('getPayment', () => {
  it.each([
    ['processed', 'approved'],
    ['action_required', 'pending'],
    ['created', 'pending'],
    ['failed', 'rejected'],
    ['expired', 'cancelled'],
    ['canceled', 'cancelled'],
  ])('order %s → status legado %s', async (orderStatus, legado) => {
    mockFetch({ id: 'ORDTST789', status: orderStatus, transactions: { payments: [{}] } });
    const result = await mp.getPayment('ORDTST789');
    expect(result.status).toBe(legado);
    expect(global.fetch.mock.calls[0][0]).toContain('/v1/orders/ORDTST789');
  });
});
