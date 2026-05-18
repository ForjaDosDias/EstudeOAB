const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../../src/db');
const pool = require('../../src/db');

const reportsRouter = require('../../src/routes/reports');

const app = express();
app.use(express.json());
app.use('/api/reports', reportsRouter);

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

function token(role = 'user', userId = 1) {
  return jwt.sign({ userId, email: 'u@test.com', role }, JWT_SECRET);
}

function adminToken(userId = 99) {
  return jwt.sign({ userId, email: 'admin@test.com', role: 'admin' }, JWT_SECRET);
}

describe('POST /api/reports', () => {
  it('401 sem token', async () => {
    const res = await request(app).post('/api/reports').send({ question_id: 1, comentario: 'teste' });
    expect(res.status).toBe(401);
  });

  it('400 sem campos obrigatórios', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${token()}`)
      .send({ question_id: 1 });
    expect(res.status).toBe(400);
  });

  it('404 questão inexistente', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({})                  // BEGIN
      .mockResolvedValueOnce({ rows: [] })         // SELECT questions
      .mockResolvedValueOnce({});                  // ROLLBACK
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${token()}`)
      .send({ question_id: 999, comentario: 'Erro na explicação' });
    expect(res.status).toBe(404);
  });

  it('409 report duplicado retorna jaReportou=true', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({})                                      // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })                   // SELECT questions
      .mockResolvedValueOnce({ rows: [{ id: 5, status: 'pending' }] }) // SELECT reports (duplicado)
      .mockResolvedValueOnce({});                                     // ROLLBACK
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${token()}`)
      .send({ question_id: 1, comentario: 'Já reportei' });
    expect(res.status).toBe(409);
    expect(res.body.jaReportou).toBe(true);
    expect(res.body.reportId).toBe(5);
  });

  it('201 cria report com sucesso', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({})                            // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })         // SELECT questions
      .mockResolvedValueOnce({ rows: [] })                  // SELECT reports (não existe)
      .mockResolvedValueOnce({ rows: [{ id: 10 }] })        // INSERT reports
      .mockResolvedValueOnce({})                            // INSERT report_edits
      .mockResolvedValueOnce({});                           // COMMIT
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${token()}`)
      .send({ question_id: 1, comentario: 'Prazo errado na explicação' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(10);
    expect(res.body.status).toBe('pending');
  });
});

describe('PATCH /api/reports/:id', () => {
  it('401 sem token', async () => {
    const res = await request(app).patch('/api/reports/1').send({ comentario: 'novo' });
    expect(res.status).toBe(401);
  });

  it('403 usuário diferente não pode editar', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({})                                        // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 999, status: 'pending' }] }) // SELECT report
      .mockResolvedValueOnce({});                                       // ROLLBACK
    const res = await request(app)
      .patch('/api/reports/1')
      .set('Authorization', `Bearer ${token('user', 1)}`)
      .send({ comentario: 'editado' });
    expect(res.status).toBe(403);
  });

  it('200 edita com sucesso e registra histórico', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({})                                       // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, status: 'pending' }] }) // SELECT report
      .mockResolvedValueOnce({})                                       // UPDATE reports
      .mockResolvedValueOnce({})                                       // INSERT report_edits
      .mockResolvedValueOnce({});                                      // COMMIT
    const res = await request(app)
      .patch('/api/reports/1')
      .set('Authorization', `Bearer ${token('user', 1)}`)
      .send({ comentario: 'Atualizado: o prazo correto é 15 dias' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);
  });
});

describe('GET /api/reports/admin', () => {
  it('403 para usuário comum', async () => {
    const res = await request(app)
      .get('/api/reports/admin')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(403);
  });

  it('200 retorna lista com total', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [
        { id: 1, comentario: 'Erro', status: 'pending', user_nome: 'João', enunciado: 'Q1' },
        { id: 2, comentario: 'Errado', status: 'pending', user_nome: 'Maria', enunciado: 'Q2' },
      ]});
    const res = await request(app)
      .get('/api/reports/admin')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });
});

describe('GET /api/reports/admin/:id/historico', () => {
  it('200 retorna histórico de edições', async () => {
    pool.query.mockResolvedValueOnce({ rows: [
      { id: 1, comentario: 'versão 1', editado_em: '2026-01-01' },
      { id: 2, comentario: 'versão 2', editado_em: '2026-01-02' },
    ]});
    const res = await request(app)
      .get('/api/reports/admin/1/historico')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.historico).toHaveLength(2);
  });
});

describe('PATCH /api/reports/admin/:id/resolve', () => {
  it('404 report não encontrado', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({})            // BEGIN
      .mockResolvedValueOnce({ rows: [] })  // SELECT report
      .mockResolvedValueOnce({});           // ROLLBACK
    const res = await request(app)
      .patch('/api/reports/admin/999/resolve')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });

  it('409 report já resolvido', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 2, question_id: 5, status: 'resolved', external_id: 'XLI-Q001' }] })
      .mockResolvedValueOnce({});
    const res = await request(app)
      .patch('/api/reports/admin/1/resolve')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(409);
  });

  it('200 resolve e cria notificação', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({})  // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 2, question_id: 5, status: 'pending', external_id: 'XLI-Q001' }] }) // SELECT
      .mockResolvedValueOnce({})  // UPDATE reports
      .mockResolvedValueOnce({})  // INSERT notifications
      .mockResolvedValueOnce({}); // COMMIT
    const res = await request(app)
      .patch('/api/reports/admin/1/resolve')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.resolved).toBe(true);
    // Verifica que criou notificação
    const notifCall = client.query.mock.calls.find(c => c[0].includes('INSERT INTO notifications'));
    expect(notifCall).toBeDefined();
  });
});
