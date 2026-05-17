jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../../src/db');

const app = express();
app.use(express.json());
app.use('/api/auth', require('../../src/routes/auth'));

const JWT_SECRET = process.env.JWT_SECRET;

const fakeUser = {
  id: 1,
  email: 'teste@oab.com',
  nome: 'Testador',
  role: 'user',
  edicao: 'XLI',
  minutos_dia: 30,
  areas: ['civil'],
  xp: 0,
  streak: 0,
  password_hash: '$hashed$',
};

// ── /register ─────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('400 quando email está ausente', async () => {
    const res = await request(app).post('/api/auth/register').send({ password: 'senha123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/obrigatórios/i);
  });

  it('400 quando senha está ausente', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  it('400 quando senha tem menos de 8 caracteres', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 caracteres/i);
  });

  it('400 quando email é inválido', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'nao-e-email', password: 'senha123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email inválido/i);
  });

  it('201 com token e usuário quando dados válidos', async () => {
    bcrypt.hash.mockResolvedValue('$hashed$');
    pool.query.mockResolvedValue({ rows: [fakeUser] });

    const res = await request(app).post('/api/auth/register').send({
      email: 'teste@oab.com',
      password: 'senha123',
      nome: 'Testador',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('teste@oab.com');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('409 quando email já existe (conflito único)', async () => {
    bcrypt.hash.mockResolvedValue('$hashed$');
    const err = Object.assign(new Error('unique'), { code: '23505' });
    pool.query.mockRejectedValue(err);

    const res = await request(app).post('/api/auth/register').send({
      email: 'existe@oab.com',
      password: 'senha123',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/já está cadastrado/i);
  });

  it('500 em erro inesperado do banco', async () => {
    bcrypt.hash.mockResolvedValue('$hashed$');
    pool.query.mockRejectedValue(new Error('DB explodiu'));

    const res = await request(app).post('/api/auth/register').send({
      email: 'novo@oab.com',
      password: 'senha123',
    });
    expect(res.status).toBe(500);
  });
});

// ── /login ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('400 quando email está ausente', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'senha123' });
    expect(res.status).toBe(400);
  });

  it('400 quando senha está ausente', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  it('401 quando usuário não existe', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const res = await request(app).post('/api/auth/login').send({ email: 'x@b.com', password: 'senha123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/incorretos/i);
  });

  it('401 quando senha está errada', async () => {
    pool.query.mockResolvedValue({ rows: [fakeUser] });
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app).post('/api/auth/login').send({ email: 'teste@oab.com', password: 'errada' });
    expect(res.status).toBe(401);
  });

  it('200 com token quando credenciais válidas', async () => {
    pool.query.mockResolvedValue({ rows: [fakeUser] });
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app).post('/api/auth/login').send({ email: 'teste@oab.com', password: 'senha123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('teste@oab.com');
  });

  it('500 em erro inesperado do banco', async () => {
    pool.query.mockRejectedValue(new Error('DB offline'));
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'senha123' });
    expect(res.status).toBe(500);
  });
});

// ── /me ───────────────────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('401 com token inválido', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer token-lixo');
    expect(res.status).toBe(401);
  });

  it('404 quando usuário não existe mais no banco', async () => {
    const token = jwt.sign({ userId: 99, email: 'ghost@oab.com', role: 'user' }, JWT_SECRET);
    pool.query.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('200 com dados do usuário com token válido', async () => {
    const token = jwt.sign({ userId: 1, email: 'teste@oab.com', role: 'user' }, JWT_SECRET);
    pool.query.mockResolvedValue({ rows: [fakeUser] });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('teste@oab.com');
    expect(res.body.password_hash).toBeUndefined();
  });
});
