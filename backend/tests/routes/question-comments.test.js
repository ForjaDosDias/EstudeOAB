jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt     = require('jsonwebtoken');
const pool    = require('../../src/db');

const app = express();
app.use(express.json());
app.use('/api/question-comments', require('../../src/routes/question-comments'));

const JWT_SECRET = process.env.JWT_SECRET;

function adminToken() {
  return jwt.sign({ userId: 1, email: 'admin@oab.com', role: 'admin' }, JWT_SECRET);
}
function userToken() {
  return jwt.sign({ userId: 2, email: 'user@oab.com', role: 'user' }, JWT_SECRET);
}

const fakeComment = {
  id: 1,
  corpo: 'Atenção ao art. 186 do CC — prazo de 3 anos.',
  criado_em: new Date().toISOString(),
  admin_nome: 'Admin OAB',
};

// ── GET /:questionId ──────────────────────────────────────────────────────────

describe('GET /api/question-comments/:questionId', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/question-comments/1');
    expect(res.status).toBe(401);
  });

  it('200 retorna lista de comentários', async () => {
    pool.query.mockResolvedValueOnce({ rows: [fakeComment] });
    const res = await request(app)
      .get('/api/question-comments/1')
      .set('Authorization', `Bearer ${userToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.comments)).toBe(true);
    expect(res.body.comments[0].id).toBe(1);
    expect(res.body.comments[0].admin_nome).toBe('Admin OAB');
  });

  it('200 retorna array vazio quando não há comentários', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/question-comments/99')
      .set('Authorization', `Bearer ${userToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.comments).toEqual([]);
  });
});

// ── POST /:questionId ─────────────────────────────────────────────────────────

describe('POST /api/question-comments/:questionId', () => {
  it('401 sem token', async () => {
    const res = await request(app).post('/api/question-comments/1').send({ corpo: 'texto' });
    expect(res.status).toBe(401);
  });

  it('403 para usuário comum', async () => {
    const res = await request(app)
      .post('/api/question-comments/1')
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ corpo: 'texto' });
    expect(res.status).toBe(403);
  });

  it('400 sem campo corpo', async () => {
    const res = await request(app)
      .post('/api/question-comments/1')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('404 quando questão não existe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // SELECT questions
    const res = await request(app)
      .post('/api/question-comments/999')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ corpo: 'texto' });
    expect(res.status).toBe(404);
  });

  it('201 cria comentário com sucesso', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })     // SELECT questions (existe)
      .mockResolvedValueOnce({ rows: [fakeComment] });   // INSERT RETURNING
    const res = await request(app)
      .post('/api/question-comments/1')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ corpo: 'Atenção ao art. 186 do CC — prazo de 3 anos.' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
    expect(res.body.corpo).toBeDefined();
  });
});

// ── DELETE /:commentId ────────────────────────────────────────────────────────

describe('DELETE /api/question-comments/:commentId', () => {
  it('401 sem token', async () => {
    const res = await request(app).delete('/api/question-comments/1');
    expect(res.status).toBe(401);
  });

  it('403 para usuário comum', async () => {
    const res = await request(app)
      .delete('/api/question-comments/1')
      .set('Authorization', `Bearer ${userToken()}`);
    expect(res.status).toBe(403);
  });

  it('404 quando comentário não existe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/api/question-comments/999')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });

  it('200 deleta comentário com sucesso', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .delete('/api/question-comments/1')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });
});
