jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../src/db');

const app = express();
app.use(express.json());
app.use('/api/coins', require('../../src/routes/coins'));

const JWT_SECRET = process.env.JWT_SECRET;

function token(userId = 1) {
  return jwt.sign({ userId, email: 'u@oab.com', role: 'user' }, JWT_SECRET);
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/coins', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/coins');
    expect(res.status).toBe(401);
  });

  it('200 retorna saldo, regras e transações', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ coins: 42 }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 1, tipo: 'login_diario', quantidade: 5, referencia: '2026-06-11', criado_em: new Date().toISOString() },
        ],
      });

    const res = await request(app).get('/api/coins').set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.saldo).toBe(42);
    expect(res.body.regras.login_diario).toBe(5);
    expect(res.body.transacoes).toHaveLength(1);
  });

  it('404 quando usuário não existe', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/coins').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });

  it('500 em erro do banco', async () => {
    pool.query.mockRejectedValue(new Error('falhou'));
    const res = await request(app).get('/api/coins').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(500);
  });
});
