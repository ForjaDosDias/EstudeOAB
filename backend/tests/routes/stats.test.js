jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../src/db');

const app = express();
app.use(express.json());
app.use('/api/stats', require('../../src/routes/stats'));

const JWT_SECRET = process.env.JWT_SECRET;

function token(userId = 1) {
  return jwt.sign({ userId, email: 'u@oab.com', role: 'user' }, JWT_SECRET);
}

// ── GET /api/stats/overview ───────────────────────────────────────────────────

describe('GET /api/stats/overview', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/stats/overview');
    expect(res.status).toBe(401);
  });

  it('200 com zeros para usuário sem respostas', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ questoes_respondidas: '0', acertos: '0', tempo_total_s: '0' }] })
      .mockResolvedValueOnce({ rows: [{ questoes_hoje: '0' }] })
      .mockResolvedValueOnce({ rows: [{ xp: 0, streak: 0, minutos_dia: 30 }] })
      .mockResolvedValueOnce({ rows: [{ sessoes_completas: '0', tempo_sessoes_s: '0' }] });

    const res = await request(app)
      .get('/api/stats/overview')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.acertosPct).toBe(0);
    expect(res.body.questoesRespondidas).toBe(0);
    expect(res.body.streak).toBe(0);
    expect(res.body.metaDiaria.feito).toBe(0);
  });

  it('200 com acertosPct calculado corretamente', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ questoes_respondidas: '10', acertos: '8', tempo_total_s: '300' }] })
      .mockResolvedValueOnce({ rows: [{ questoes_hoje: '5' }] })
      .mockResolvedValueOnce({ rows: [{ xp: 120, streak: 3, minutos_dia: 60 }] })
      .mockResolvedValueOnce({ rows: [{ sessoes_completas: '2', tempo_sessoes_s: '7200' }] });

    const res = await request(app)
      .get('/api/stats/overview')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.acertosPct).toBe(80);
    expect(res.body.questoesRespondidas).toBe(10);
    expect(res.body.xpTotal).toBe(120);
    expect(res.body.streak).toBe(3);
    expect(res.body.tempoEstudoH).toBe(2);
    expect(res.body.metaDiaria.feito).toBe(5);
  });
});

// ── GET /api/stats/areas ──────────────────────────────────────────────────────

describe('GET /api/stats/areas', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/stats/areas');
    expect(res.status).toBe(401);
  });

  it('200 com pct calculado por área', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { area: 'civil',  total: '100', respondidas: '40', acertos: '30' },
        { area: 'penal',  total: '80',  respondidas: '0',  acertos: '0' },
      ],
    });

    const res = await request(app)
      .get('/api/stats/areas')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].pct).toBe(75); // 30/40
    expect(res.body[1].pct).toBe(0);  // sem respostas
  });

  it('500 em erro do banco', async () => {
    pool.query.mockRejectedValueOnce(new Error('falhou'));
    const res = await request(app)
      .get('/api/stats/areas')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(500);
  });
});

// ── GET /api/stats/last-7-days ────────────────────────────────────────────────

describe('GET /api/stats/last-7-days', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/stats/last-7-days');
    expect(res.status).toBe(401);
  });

  it('200 retorna array de 7 elementos', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // sem dados → tudo zero

    const res = await request(app)
      .get('/api/stats/last-7-days')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
    expect(res.body.every(v => v === 0)).toBe(true);
  });

  it('200 preenche % correto no dia correspondente', async () => {
    const hoje = new Date();
    const diaComDados = { toISOString: () => hoje.toISOString() };

    pool.query.mockResolvedValueOnce({
      rows: [{ dia: diaComDados, total: '10', acertos: '7' }],
    });

    const res = await request(app)
      .get('/api/stats/last-7-days')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
    expect(res.body[6]).toBe(70); // hoje = índice 6
  });
});
