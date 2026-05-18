const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../../src/db');
const pool = require('../../src/db');

const notificationsRouter = require('../../src/routes/notifications');

const app = express();
app.use(express.json());
app.use('/api/notifications', notificationsRouter);

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

function token(userId = 1) {
  return jwt.sign({ userId, email: 'u@test.com', role: 'user' }, JWT_SECRET);
}

describe('GET /api/notifications', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  it('200 retorna lista e contagem de não lidas', async () => {
    pool.query.mockResolvedValueOnce({ rows: [
      { id: 1, tipo: 'report_resolved', titulo: 'Sua contribuição foi importante!', mensagem: 'Obrigado!', lida: false, created_at: new Date() },
      { id: 2, tipo: 'report_resolved', titulo: 'Sua contribuição foi importante!', mensagem: 'Obrigado!', lida: true,  created_at: new Date() },
    ]});
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(2);
    expect(res.body.nao_lidas).toBe(1);
  });

  it('200 retorna lista vazia quando não há notificações', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(0);
    expect(res.body.nao_lidas).toBe(0);
  });
});

describe('PATCH /api/notifications/read-all', () => {
  it('401 sem token', async () => {
    const res = await request(app).patch('/api/notifications/read-all');
    expect(res.status).toBe(401);
  });

  it('200 marca todas como lidas', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 2 });
    const res = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
