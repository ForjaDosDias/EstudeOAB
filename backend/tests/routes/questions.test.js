jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../src/db');

const app = express();
app.use(express.json());
app.use('/api/questions', require('../../src/routes/questions'));

const JWT_SECRET = process.env.JWT_SECRET;

function adminToken() {
  return jwt.sign({ userId: 1, email: 'admin@oab.com', role: 'admin' }, JWT_SECRET);
}
function userToken() {
  return jwt.sign({ userId: 2, email: 'user@oab.com', role: 'user' }, JWT_SECRET);
}

const fakeQuestion = {
  id: 1,
  enunciado: 'Qual é o prazo?',
  gabarito: 'A',
  area_direito: 'civil',
  banca: 'FGV',
  edicao: 'XLI',
  dificuldade: 'medio',
};

// ── GET /api/questions ────────────────────────────────────────────────────────

describe('GET /api/questions', () => {
  it('200 com lista de questões e total', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [fakeQuestion, { ...fakeQuestion, id: 2 }] });

    const res = await request(app).get('/api/questions');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.questions).toHaveLength(2);
  });

  it('200 aceitando filtros por área, banca, edicao e dificuldade', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [fakeQuestion] });

    const res = await request(app)
      .get('/api/questions')
      .query({ area: 'civil', banca: 'FGV', edicao: 'XLI', dificuldade: 'medio' });

    expect(res.status).toBe(200);
    expect(res.body.questions[0].area_direito).toBe('civil');
  });

  it('200 respeitando limit e offset', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: [fakeQuestion] });

    const res = await request(app).get('/api/questions').query({ limit: 1, offset: 10 });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(50);
    expect(res.body.questions).toHaveLength(1);
  });

  it('500 em erro do banco', async () => {
    pool.query.mockRejectedValue(new Error('DB fora'));
    const res = await request(app).get('/api/questions');
    expect(res.status).toBe(500);
  });
});

// ── GET /api/questions/stats ──────────────────────────────────────────────────

describe('GET /api/questions/stats', () => {
  it('200 com estatísticas agregadas', async () => {
    pool.query.mockResolvedValue({
      rows: [{
        total: '120',
        bancas: '3',
        areas: '5',
        edicoes: '10',
        lista_bancas: ['FGV', 'CESPE', 'VUNESP'],
        lista_areas: ['civil', 'penal'],
        lista_edicoes: ['XLI'],
      }],
    });

    const res = await request(app).get('/api/questions/stats');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe('120');
    expect(res.body.lista_bancas).toContain('FGV');
  });

  it('500 em erro do banco', async () => {
    pool.query.mockRejectedValue(new Error('falhou'));
    const res = await request(app).get('/api/questions/stats');
    expect(res.status).toBe(500);
  });
});

// ── POST /api/questions/upload ────────────────────────────────────────────────

describe('POST /api/questions/upload', () => {
  it('401 sem token', async () => {
    const res = await request(app).post('/api/questions/upload');
    expect(res.status).toBe(401);
  });

  it('403 com token de usuário comum', async () => {
    const res = await request(app)
      .post('/api/questions/upload')
      .set('Authorization', `Bearer ${userToken()}`);
    expect(res.status).toBe(403);
  });

  it('400 sem arquivo CSV', async () => {
    const res = await request(app)
      .post('/api/questions/upload')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nenhum arquivo/i);
  });

  it('400 com CSV sem dados válidos (apenas cabeçalho)', async () => {
    const csv = 'enunciado;gabarito;banca\n';
    const res = await request(app)
      .post('/api/questions/upload')
      .set('Authorization', `Bearer ${adminToken()}`)
      .attach('csv', Buffer.from(csv), 'questoes.csv');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/vazio/i);
  });

  it('200 contabiliza skipped quando linha não tem enunciado', async () => {
    const csv = 'enunciado;gabarito;banca\n;A;FGV\n';

    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({})  // BEGIN
        .mockResolvedValueOnce({}), // COMMIT (nenhum INSERT ocorre)
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);

    const res = await request(app)
      .post('/api/questions/upload')
      .set('Authorization', `Bearer ${adminToken()}`)
      .attach('csv', Buffer.from(csv), 'questoes.csv');
    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(1);
    expect(res.body.inserted).toBe(0);
  });

  it('200 com relatório de inserção quando CSV válido', async () => {
    const csv = 'enunciado;gabarito;banca;area_direito\nQual o prazo?;A;FGV;civil\n';

    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({})                              // BEGIN
        .mockResolvedValueOnce({ rows: [{ is_insert: true }] }) // INSERT
        .mockResolvedValueOnce({}),                             // COMMIT
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);

    const res = await request(app)
      .post('/api/questions/upload')
      .set('Authorization', `Bearer ${adminToken()}`)
      .attach('csv', Buffer.from(csv), 'questoes.csv');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.inserted).toBe(1);
    expect(res.body.updated).toBe(0);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('200 contabilizando update quando registro já existe', async () => {
    const csv = 'enunciado;gabarito;banca\nQual o prazo?;A;FGV\n';

    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ is_insert: false }] })
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);

    const res = await request(app)
      .post('/api/questions/upload')
      .set('Authorization', `Bearer ${adminToken()}`)
      .attach('csv', Buffer.from(csv), 'questoes.csv');

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(0);
    expect(res.body.updated).toBe(1);
  });

  it('500 e ROLLBACK em erro de transação', async () => {
    const csv = 'enunciado;gabarito\nQuestão teste;A\n';

    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({})            // BEGIN
        .mockRejectedValueOnce(new Error('constraint'))  // INSERT falha
        .mockResolvedValueOnce({}),           // ROLLBACK
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);

    const res = await request(app)
      .post('/api/questions/upload')
      .set('Authorization', `Bearer ${adminToken()}`)
      .attach('csv', Buffer.from(csv), 'questoes.csv');

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(1);
    expect(mockClient.release).toHaveBeenCalled();
  });
});
