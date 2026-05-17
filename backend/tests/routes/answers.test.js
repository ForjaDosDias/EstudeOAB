jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../src/db');

const app = express();
app.use(express.json());
app.use('/api/answers', require('../../src/routes/answers'));

const JWT_SECRET = process.env.JWT_SECRET;

function token(userId = 1) {
  return jwt.sign({ userId, email: 'u@oab.com', role: 'user' }, JWT_SECRET);
}

const fakeSession  = { user_id: 1, concluida: false };
const fakeQuestion = { gabarito: 'A', explicacao: 'A responsabilidade é subjetiva.', legislacao_ref: 'Art. 186 · CC/2002' };
const fakeAnswer = {
  id: 1, escolhida: 'A', correta: 'A', acertou: true, tempo_s: 30,
  respondida_em: new Date().toISOString(),
  question_id: 10, enunciado: 'Qual o prazo?', banca: 'FGV',
  edicao: 'XLI', area_direito: 'civil', gabarito: 'A',
};

// ── POST /api/answers ─────────────────────────────────────────────────────────

describe('POST /api/answers', () => {
  it('401 sem token', async () => {
    const res = await request(app).post('/api/answers').send({});
    expect(res.status).toBe(401);
  });

  it('400 com letra inválida', async () => {
    const res = await request(app)
      .post('/api/answers')
      .set('Authorization', `Bearer ${token()}`)
      .send({ session_id: 1, question_id: 1, escolhida: 'Z', tempo_s: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/A, B, C ou D/);
  });

  it('400 sem campos obrigatórios', async () => {
    const res = await request(app)
      .post('/api/answers')
      .set('Authorization', `Bearer ${token()}`)
      .send({ escolhida: 'A' });
    expect(res.status).toBe(400);
  });

  it('404 quando sessão não existe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/answers')
      .set('Authorization', `Bearer ${token()}`)
      .send({ session_id: 99, question_id: 1, escolhida: 'A', tempo_s: 10 });
    expect(res.status).toBe(404);
  });

  it('403 ao responder em sessão de outro usuário', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ user_id: 999, concluida: false }] });
    const res = await request(app)
      .post('/api/answers')
      .set('Authorization', `Bearer ${token(1)}`)
      .send({ session_id: 1, question_id: 1, escolhida: 'A', tempo_s: 10 });
    expect(res.status).toBe(403);
  });

  it('409 ao responder em sessão já concluída', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ user_id: 1, concluida: true }] });
    const res = await request(app)
      .post('/api/answers')
      .set('Authorization', `Bearer ${token(1)}`)
      .send({ session_id: 1, question_id: 1, escolhida: 'A', tempo_s: 10 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/concluída/);
  });

  it('201 com acertou: true, correta, explicacao e legislacao_ref', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [fakeSession] })
      .mockResolvedValueOnce({ rows: [fakeQuestion] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/answers')
      .set('Authorization', `Bearer ${token(1)}`)
      .send({ session_id: 1, question_id: 10, escolhida: 'A', tempo_s: 25 });

    expect(res.status).toBe(201);
    expect(res.body.acertou).toBe(true);
    expect(res.body.correta).toBe('A');
    expect(res.body.explicacao).toBe('A responsabilidade é subjetiva.');
    expect(res.body.legislacao_ref).toBe('Art. 186 · CC/2002');
  });

  it('201 com acertou: false quando escolhida !== gabarito', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [fakeSession] })
      .mockResolvedValueOnce({ rows: [fakeQuestion] })  // gabarito = 'A'
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/answers')
      .set('Authorization', `Bearer ${token(1)}`)
      .send({ session_id: 1, question_id: 10, escolhida: 'B', tempo_s: 15 });

    expect(res.status).toBe(201);
    expect(res.body.acertou).toBe(false);
    expect(res.body.correta).toBe('A');
  });

  it('409 ao responder a mesma questão duas vezes na mesma sessão', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [fakeSession] })
      .mockResolvedValueOnce({ rows: [fakeQuestion] })
      .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: '23505' }));

    const res = await request(app)
      .post('/api/answers')
      .set('Authorization', `Bearer ${token(1)}`)
      .send({ session_id: 1, question_id: 10, escolhida: 'A', tempo_s: 10 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/já respondida/);
  });
});

// ── GET /api/answers/history ──────────────────────────────────────────────────

describe('GET /api/answers/history', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/answers/history');
    expect(res.status).toBe(401);
  });

  it('200 com lista vazia para usuário novo', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/answers/history')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.answers).toHaveLength(0);
  });

  it('200 com histórico paginado', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [fakeAnswer] });

    const res = await request(app)
      .get('/api/answers/history')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.answers[0].enunciado).toBe('Qual o prazo?');
  });

  it('200 com filtro resultado=acertos retornando só acertos', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ ...fakeAnswer, acertou: true }] });

    const res = await request(app)
      .get('/api/answers/history?resultado=acertos')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.answers[0].acertou).toBe(true);
  });

  it('200 com filtro resultado=erros retornando só erros', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ ...fakeAnswer, acertou: false, escolhida: 'B' }] });

    const res = await request(app)
      .get('/api/answers/history?resultado=erros')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.answers[0].acertou).toBe(false);
  });

  it('200 com filtro de área', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ ...fakeAnswer, area_direito: 'penal' }] });

    const res = await request(app)
      .get('/api/answers/history?area=penal')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.answers[0].area_direito).toBe('penal');
  });
});
