jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../src/db');

const app = express();
app.use(express.json());
app.use('/api/sessions', require('../../src/routes/sessions'));

const JWT_SECRET = process.env.JWT_SECRET;

function token(userId = 1, role = 'user') {
  return jwt.sign({ userId, email: 'u@oab.com', role }, JWT_SECRET);
}

function mockClient(queries = []) {
  const client = { query: jest.fn(), release: jest.fn() };
  queries.forEach(r => client.query.mockResolvedValueOnce(r));
  return client;
}

const fakeQuestoes = [
  { id: 10, enunciado: 'Qual o prazo?', gabarito: 'A', area_direito: 'civil' },
];

// ── POST /api/sessions ────────────────────────────────────────────────────────

describe('POST /api/sessions', () => {
  it('401 sem token', async () => {
    const res = await request(app).post('/api/sessions').send({});
    expect(res.status).toBe(401);
  });

  it('400 com modo inválido', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token()}`)
      .send({ modo: 'invalido', total_questoes: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/modo/);
  });

  it('400 com total_questoes = 0', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token()}`)
      .send({ modo: 'rapida', total_questoes: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/total_questoes/);
  });

  it('400 com total_questoes > 80', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token()}`)
      .send({ modo: 'rapida', total_questoes: 81 });
    expect(res.status).toBe(400);
  });

  it('201 ao criar sessão válida', async () => {
    const client = mockClient([
      {},                                         // BEGIN
      { rows: [{ id: 42 }] },                     // INSERT session
      { rows: fakeQuestoes },                     // SELECT questoes
      {},                                         // COMMIT
    ]);
    pool.connect.mockResolvedValue(client);

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token()}`)
      .send({ modo: 'rapida', total_questoes: 5 });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(42);
    expect(res.body.questoes).toHaveLength(1);
    expect(client.release).toHaveBeenCalled();
  });

  it('201 filtrando por áreas quando fornecidas', async () => {
    const client = mockClient([
      {},
      { rows: [{ id: 7 }] },
      { rows: fakeQuestoes },
      {},
    ]);
    pool.connect.mockResolvedValue(client);

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${token()}`)
      .send({ modo: 'personalizado', areas: ['civil', 'penal'], total_questoes: 10 });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(7);
  });
});

// ── PATCH /api/sessions/:id/concluir ─────────────────────────────────────────

describe('PATCH /api/sessions/:id/concluir', () => {
  it('401 sem token', async () => {
    const res = await request(app).patch('/api/sessions/1/concluir');
    expect(res.status).toBe(401);
  });

  it('404 quando sessão não existe', async () => {
    const client = mockClient([
      {},                       // BEGIN
      { rows: [] },             // SELECT session → vazio
    ]);
    pool.connect.mockResolvedValue(client);

    const res = await request(app)
      .patch('/api/sessions/99/concluir')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });

  it('403 ao tentar concluir sessão de outro usuário', async () => {
    const client = mockClient([
      {},
      { rows: [{ id: 1, user_id: 999, concluida: false }] }, // pertence ao user 999
    ]);
    pool.connect.mockResolvedValue(client);

    const res = await request(app)
      .patch('/api/sessions/1/concluir')
      .set('Authorization', `Bearer ${token(1)}`); // usuário 1
    expect(res.status).toBe(403);
  });

  it('409 quando sessão já foi concluída', async () => {
    const client = mockClient([
      {},
      { rows: [{ id: 1, user_id: 1, concluida: true }] },
    ]);
    pool.connect.mockResolvedValue(client);

    const res = await request(app)
      .patch('/api/sessions/1/concluir')
      .set('Authorization', `Bearer ${token(1)}`);
    expect(res.status).toBe(409);
  });

  /**
   * Ordem das queries dentro da transação de concluir:
   *   BEGIN · SELECT session · agg answers · SELECT user ·
   *   COUNT respondidas hoje · UPDATE session · UPDATE user · COMMIT
   * O COUNT entrou em 07/08/2026, quando o streak passou a depender da meta.
   */
  function mockConcluir({ total = '5', acertos = '4', ultima, streak = 0, streakMax = 0, meta = 10, feitoHoje }) {
    const client = mockClient([
      {},
      { rows: [{ id: 1, user_id: 1, concluida: false }] },
      { rows: [{ total, acertos, tempo_total_s: '120' }] },
      { rows: [{ ultima_atividade: ultima, streak, streak_max: streakMax, meta_questoes_dia: meta }] },
      { rows: [{ total: feitoHoje }] },
      {}, {}, {},
    ]);
    pool.connect.mockResolvedValue(client);
    return client;
  }

  const ontem = () => new Date(Date.now() - 864e5);
  const anteontem = () => new Date(Date.now() - 2 * 864e5);

  it('200 ao concluir sessão própria com XP calculado', async () => {
    mockConcluir({ ultima: ontem(), streak: 3, feitoHoje: 10, meta: 10 });
    pool.query.mockResolvedValue({ rows: [{ xp: 60, streak: 4, streak_max: 4 }] });

    const res = await request(app)
      .patch('/api/sessions/1/concluir')
      .set('Authorization', `Bearer ${token(1)}`);

    expect(res.status).toBe(200);
    expect(res.body.acertos).toBe(4);
    expect(res.body.xp_ganho).toBe(60); // 4 * 15
  });

  it('200 com bônus de 100% de acerto', async () => {
    mockConcluir({ total: '4', acertos: '4', ultima: ontem(), feitoHoje: 10 });
    pool.query.mockResolvedValue({ rows: [{ xp: 90, streak: 1, streak_max: 1 }] });

    const res = await request(app)
      .patch('/api/sessions/1/concluir')
      .set('Authorization', `Bearer ${token(1)}`);

    expect(res.body.xp_ganho).toBe(90); // 4*15 + 30 bônus
  });

  // ── Guardrails do streak por meta (07/08/2026) ────────────────────────────

  // Antes desta data o streak acendia com UMA questão. Este teste é a regra nova.
  it('não acende o streak com a meta ainda não batida', async () => {
    mockConcluir({ ultima: ontem(), streak: 3, meta: 10, feitoHoje: 9 });
    pool.query.mockResolvedValue({ rows: [{ xp: 60, streak: 3, streak_max: 3 }] });

    const res = await request(app)
      .patch('/api/sessions/1/concluir')
      .set('Authorization', `Bearer ${token(1)}`);

    expect(res.body.streak).toBe(3); // continua 3, não virou 4
    expect(res.body.meta).toMatchObject({ alvo: 10, feito: 9, batida: false });
  });

  it('acende o streak exatamente ao atingir a meta', async () => {
    mockConcluir({ ultima: ontem(), streak: 3, meta: 10, feitoHoje: 10 });
    pool.query.mockResolvedValue({ rows: [{ xp: 60, streak: 4, streak_max: 4 }] });

    const res = await request(app)
      .patch('/api/sessions/1/concluir')
      .set('Authorization', `Bearer ${token(1)}`);

    expect(res.body.streak).toBe(4);
    expect(res.body.meta.batida).toBe(true);
  });

  it('zera o streak quando um dia foi perdido', async () => {
    mockConcluir({ ultima: anteontem(), streak: 12, meta: 10, feitoHoje: 10 });
    pool.query.mockResolvedValue({ rows: [{ xp: 60, streak: 1, streak_max: 12 }] });

    const res = await request(app)
      .patch('/api/sessions/1/concluir')
      .set('Authorization', `Bearer ${token(1)}`);

    expect(res.body.streak).toBe(1); // recomeça
  });

  // O recorde é histórico: perder a sequência não pode apagá-lo.
  it('mantém streak_max quando o streak zera', async () => {
    const client = mockConcluir({ ultima: anteontem(), streak: 12, streakMax: 12, meta: 10, feitoHoje: 10 });
    pool.query.mockResolvedValue({ rows: [{ xp: 60, streak: 1, streak_max: 12 }] });

    await request(app).patch('/api/sessions/1/concluir').set('Authorization', `Bearer ${token(1)}`);

    const updateUser = client.query.mock.calls.find((c) => /UPDATE users SET xp/.test(c[0]));
    expect(updateUser[1][1]).toBe(1);  // streak novo
    expect(updateUser[1][2]).toBe(12); // streak_max preservado
  });

  // Só o dia em que a meta foi batida conta como "último dia ativo" — é o que
  // sustenta a emenda do dia seguinte.
  it('não marca ultima_atividade em dia sem meta batida', async () => {
    const anteontemDate = anteontem();
    const client = mockConcluir({ ultima: anteontemDate, streak: 5, meta: 10, feitoHoje: 3 });
    pool.query.mockResolvedValue({ rows: [{ xp: 60, streak: 5, streak_max: 5 }] });

    await request(app).patch('/api/sessions/1/concluir').set('Authorization', `Bearer ${token(1)}`);

    const updateUser = client.query.mock.calls.find((c) => /UPDATE users SET xp/.test(c[0]));
    expect(updateUser[1][3]).toBe(anteontemDate); // inalterada
  });
});
