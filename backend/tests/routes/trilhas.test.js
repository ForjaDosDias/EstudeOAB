jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../src/db');

const app = express();
app.use(express.json());
app.use('/api/trilhas', require('../../src/routes/trilhas'));

const JWT_SECRET = process.env.JWT_SECRET;

function token(userId = 1) {
  return jwt.sign({ userId, email: 'u@oab.com', role: 'user' }, JWT_SECRET);
}

function mockPremiumCheck(plan = 'premium') {
  pool.query.mockResolvedValueOnce({
    rows: [{ role: 'user', plan, premium_until: null }],
  });
}

const fakeTrilha = {
  id: 1,
  slug: 'essencial-1a-fase',
  nome: 'Essencial 1ª Fase',
  descricao: 'As três áreas de maior incidência no exame.',
  areas: ['etica', 'civil', 'const'],
  ordem: 1,
  total_questoes: 320,
};

beforeEach(() => jest.clearAllMocks());

describe('GET /api/trilhas', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/trilhas');
    expect(res.status).toBe(401);
  });

  it('403 PREMIUM_REQUIRED para usuário free', async () => {
    mockPremiumCheck('free');
    const res = await request(app).get('/api/trilhas').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PREMIUM_REQUIRED');
  });

  it('200 lista trilhas para usuário premium', async () => {
    mockPremiumCheck();
    pool.query.mockResolvedValueOnce({ rows: [fakeTrilha] });

    const res = await request(app).get('/api/trilhas').set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.trilhas).toHaveLength(1);
    expect(res.body.trilhas[0].slug).toBe('essencial-1a-fase');
    expect(res.body.trilhas[0].total_questoes).toBe(320);
  });
});

describe('GET /api/trilhas/:slug/questoes', () => {
  it('403 para usuário free', async () => {
    mockPremiumCheck('free');
    const res = await request(app)
      .get('/api/trilhas/essencial-1a-fase/questoes')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(403);
  });

  it('404 quando trilha não existe', async () => {
    mockPremiumCheck();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/trilhas/inexistente/questoes')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });

  it('200 sorteia questões das áreas da trilha', async () => {
    mockPremiumCheck();
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, areas: ['etica', 'civil', 'const'] }] })
      .mockResolvedValueOnce({
        rows: [{ id: 7, enunciado: 'Enunciado', area_direito: 'civil' }],
      });

    const res = await request(app)
      .get('/api/trilhas/essencial-1a-fase/questoes?total=10')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.questoes).toHaveLength(1);

    const sorteio = pool.query.mock.calls[2];
    expect(sorteio[1]).toEqual([['etica', 'civil', 'const'], 10]);
  });
});
