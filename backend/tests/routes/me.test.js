jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../src/db');
const { awardStreakMilestone, proximoMarco, STREAK_MARCOS } = require('../../src/services/coins.service');

const app = express();
app.use(express.json());
app.use('/api/me', require('../../src/routes/me'));

const JWT_SECRET = process.env.JWT_SECRET;
const token = (userId = 1) => jwt.sign({ userId, email: 'u@oab.com', role: 'user' }, JWT_SECRET);

beforeEach(() => jest.clearAllMocks());

describe('GET /api/me/streak', () => {
  it('401 sem token', async () => {
    expect((await request(app).get('/api/me/streak')).status).toBe(401);
  });

  /**
   * Guardrail: /api/stats/* inteiro é requirePremium, e era de lá que saía a
   * meta diária. Uma mecânica de retenção precisa alcançar quem ainda não paga
   * — se este teste virar 403, a mecânica morreu para o público que importa.
   */
  it('200 para usuário Free — a mecânica não pode ficar atrás do paywall', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{ streak: 4, streak_max: 9, meta_questoes_dia: 10, ultima_atividade: null }],
      })
      .mockResolvedValueOnce({ rows: [{ total: 6 }] });

    const res = await request(app).get('/api/me/streak').set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ streak: 4, streak_max: 9 });
    expect(res.body.meta).toMatchObject({ alvo: 10, feito: 6, batida: false, faltam: 4 });
  });

  it('marca a meta como batida e zera o que falta', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{ streak: 7, streak_max: 7, meta_questoes_dia: 5, ultima_atividade: null }],
      })
      .mockResolvedValueOnce({ rows: [{ total: 12 }] });

    const res = await request(app).get('/api/me/streak').set('Authorization', `Bearer ${token()}`);

    expect(res.body.meta).toMatchObject({ batida: true, faltam: 0 });
  });

  it('aponta o próximo marco acima do streak atual', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{ streak: 4, streak_max: 4, meta_questoes_dia: 10, ultima_atividade: null }],
      })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const res = await request(app).get('/api/me/streak').set('Authorization', `Bearer ${token()}`);

    expect(res.body.proximo_marco).toEqual({ dias: 7, moedas: STREAK_MARCOS[7] });
  });
});

describe('marcos de streak (coins.service)', () => {
  it('não credita nada fora de um marco', async () => {
    expect(await awardStreakMilestone(1, 5)).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('credita ao atingir um marco', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 99 }] }).mockResolvedValueOnce({});
    expect(await awardStreakMilestone(1, 7)).toBe(STREAK_MARCOS[7]);
  });

  /**
   * Guardrail: a referência é `streak:<marco>`, não `streak:<data>`. Quem chega
   * a 7 dias, quebra e chega a 7 de novo NÃO recebe duas vezes — o prêmio é por
   * alcançar o marco, não por repeti-lo. Quem garante é o ON CONFLICT.
   */
  it('não credita o mesmo marco duas vezes', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // ON CONFLICT DO NOTHING
    expect(await awardStreakMilestone(1, 7)).toBe(0);
    expect(pool.query).toHaveBeenCalledTimes(1); // nem tentou somar moedas
  });

  it('o marco de 7 dias paga mais que uma semana de login diário', async () => {
    // login_diario são 5/dia = 35 na semana; o marco precisa compensar o esforço
    expect(STREAK_MARCOS[7]).toBeGreaterThan(35);
  });

  it('não aponta próximo marco depois do último', () => {
    expect(proximoMarco(999)).toBeNull();
  });
});
