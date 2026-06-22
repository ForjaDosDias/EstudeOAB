jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));
jest.mock('../../src/services/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({}),
  sendReengagementEmail: jest.fn().mockResolvedValue({}),
  sendResetEmail: jest.fn().mockResolvedValue({}),
}));

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
  email_verified: true,
};

const fakeUserUnverified = { ...fakeUser, email_verified: false };

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

  it('201 retorna requiresVerification e email quando dados válidos', async () => {
    bcrypt.hash.mockResolvedValue('$hashed$');
    pool.query
      .mockResolvedValueOnce({ rows: [fakeUser] })
      .mockResolvedValueOnce({ rows: [{ token: 'test-uuid-token' }] });

    const res = await request(app).post('/api/auth/register').send({
      email: 'teste@oab.com',
      password: 'senha123',
      nome: 'Testador',
    });

    expect(res.status).toBe(201);
    expect(res.body.requiresVerification).toBe(true);
    expect(res.body.email).toBe('teste@oab.com');
    expect(res.body.token).toBeUndefined();
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

  it('403 quando email não verificado (token ainda válido)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [fakeUserUnverified] })
      .mockResolvedValueOnce({ rows: [{ expires_at: new Date(Date.now() + 60000) }] });
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app).post('/api/auth/login').send({ email: 'teste@oab.com', password: 'senha123' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(res.body.tokenExpired).toBe(false);
  });

  it('403 quando email não verificado (token expirado)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [fakeUserUnverified] })
      .mockResolvedValueOnce({ rows: [{ expires_at: new Date(Date.now() - 60000) }] });
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app).post('/api/auth/login').send({ email: 'teste@oab.com', password: 'senha123' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(res.body.tokenExpired).toBe(true);
  });

  it('403 quando email não verificado (sem token no banco)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [fakeUserUnverified] })
      .mockResolvedValueOnce({ rows: [] });
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app).post('/api/auth/login').send({ email: 'teste@oab.com', password: 'senha123' });
    expect(res.status).toBe(403);
    expect(res.body.tokenExpired).toBe(true);
  });

  it('500 em erro inesperado do banco', async () => {
    pool.query.mockRejectedValue(new Error('DB offline'));
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'senha123' });
    expect(res.status).toBe(500);
  });
});

// ── /verify-email ─────────────────────────────────────────────────────────────

describe('GET /api/auth/verify-email', () => {
  const futureDate = new Date(Date.now() + 86400000); // +24h
  const pastDate   = new Date(Date.now() - 1000);    // já expirado

  it('400 quando token não informado', async () => {
    const res = await request(app).get('/api/auth/verify-email');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/token não informado/i);
  });

  it('404 quando token não existe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/auth/verify-email?token=invalido');
    expect(res.status).toBe(404);
  });

  it('400 quando token já foi usado', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, expires_at: futureDate, used_at: new Date() }] });
    const res = await request(app).get('/api/auth/verify-email?token=usado');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOKEN_USED');
  });

  it('400 quando token expirado', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, expires_at: pastDate, used_at: null }] });
    const res = await request(app).get('/api/auth/verify-email?token=expirado');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('200 quando token válido e e-mail confirmado', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, expires_at: futureDate, used_at: null }] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE email_tokens
      .mockResolvedValueOnce({ rows: [] }); // UPDATE users

    const res = await request(app).get('/api/auth/verify-email?token=valido');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('invalida todos os tokens verify_email pendentes do usuário (não só o clicado)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 7, user_id: 42, expires_at: futureDate, used_at: null }] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE email_tokens
      .mockResolvedValueOnce({ rows: [] }); // UPDATE users

    await request(app).get('/api/auth/verify-email?token=valido');

    const tokenUpdate = pool.query.mock.calls.find(
      ([sql]) => /UPDATE email_tokens SET used_at/i.test(sql)
    );
    expect(tokenUpdate).toBeDefined();
    // filtra por user_id + type, não pelo id do token clicado
    expect(tokenUpdate[0]).toMatch(/user_id = \$1/i);
    expect(tokenUpdate[0]).toMatch(/type = 'verify_email'/i);
    expect(tokenUpdate[1]).toEqual([42]);
  });
});

// ── /resend-verification ──────────────────────────────────────────────────────

describe('POST /api/auth/resend-verification', () => {
  it('400 quando email não informado', async () => {
    const res = await request(app).post('/api/auth/resend-verification').send({});
    expect(res.status).toBe(400);
  });

  it('200 quando email não existe (não vaza existência)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/auth/resend-verification').send({ email: 'naoexiste@oab.com' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('400 quando e-mail já está verificado', async () => {
    pool.query.mockResolvedValueOnce({ rows: [fakeUser] }); // email_verified: true
    const res = await request(app).post('/api/auth/resend-verification').send({ email: 'teste@oab.com' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ALREADY_VERIFIED');
  });

  it('200 e reenvia e-mail para usuário não verificado', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [fakeUserUnverified] })
      .mockResolvedValueOnce({ rows: [] })                         // UPDATE old tokens
      .mockResolvedValueOnce({ rows: [{ token: 'novo-uuid' }] }); // INSERT new token

    const res = await request(app).post('/api/auth/resend-verification').send({ email: 'teste@oab.com' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── /forgot-password ──────────────────────────────────────────────────────────

describe('POST /api/auth/forgot-password', () => {
  it('400 quando email não informado', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({});
    expect(res.status).toBe(400);
  });

  it('200 quando email não existe (não vaza existência)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'naoexiste@oab.com' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('200 e envia e-mail de reset para email existente', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [fakeUser] })
      .mockResolvedValueOnce({ rows: [] })                         // UPDATE old tokens
      .mockResolvedValueOnce({ rows: [{ token: 'reset-uuid' }] }); // INSERT new token

    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'teste@oab.com' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── /reset-password ───────────────────────────────────────────────────────────

describe('POST /api/auth/reset-password', () => {
  const futureDate = new Date(Date.now() + 3600000); // +1h
  const pastDate   = new Date(Date.now() - 1000);

  it('400 quando token não informado', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ password: 'novasenha123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/token não informado/i);
  });

  it('400 quando senha tem menos de 8 caracteres', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'abc', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 caracteres/i);
  });

  it('404 quando token não existe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'invalido', password: 'novasenha123' });
    expect(res.status).toBe(404);
  });

  it('400 quando token já foi usado', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, expires_at: futureDate, used_at: new Date() }] });
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'usado', password: 'novasenha123' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOKEN_USED');
  });

  it('400 quando token expirado', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, expires_at: pastDate, used_at: null }] });
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'expirado', password: 'novasenha123' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('200 redefine senha com token válido', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, expires_at: futureDate, used_at: null }] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE users
      .mockResolvedValueOnce({ rows: [] }); // UPDATE email_tokens
    bcrypt.hash.mockResolvedValue('$novo-hash$');

    const res = await request(app).post('/api/auth/reset-password').send({ token: 'valido', password: 'novasenha123' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── /profile ──────────────────────────────────────────────────────────────────

describe('PATCH /api/auth/profile', () => {
  const validToken = () => jwt.sign({ userId: 1, email: 'teste@oab.com', role: 'user' }, JWT_SECRET);

  it('401 sem token', async () => {
    const res = await request(app).patch('/api/auth/profile').send({ nome: 'Novo' });
    expect(res.status).toBe(401);
  });

  it('401 com token inválido', async () => {
    const res = await request(app).patch('/api/auth/profile')
      .set('Authorization', 'Bearer lixo')
      .send({ nome: 'Novo' });
    expect(res.status).toBe(401);
  });

  it('404 quando usuário não existe mais no banco', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ nome: 'Novo' });
    expect(res.status).toBe(404);
  });

  it('400 quando nenhum campo é enviado', async () => {
    pool.query.mockResolvedValueOnce({ rows: [fakeUser] });
    const res = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nenhum campo/i);
  });

  it('400 quando nome é string vazia', async () => {
    pool.query.mockResolvedValueOnce({ rows: [fakeUser] });
    const res = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ nome: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nome/i);
  });

  it('400 quando email tem formato inválido', async () => {
    pool.query.mockResolvedValueOnce({ rows: [fakeUser] });
    const res = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ email: 'nao-e-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/e-mail inválido/i);
  });

  it('409 quando novo email já pertence a outra conta', async () => {
    pool.query.mockResolvedValueOnce({ rows: [fakeUser] });
    pool.query.mockResolvedValueOnce({ rows: [{ id: 2 }] });
    const res = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ email: 'outro@oab.com' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/já está em uso/i);
  });

  it('400 quando novaSenha é enviada sem senhaAtual', async () => {
    pool.query.mockResolvedValueOnce({ rows: [fakeUser] });
    const res = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ novaSenha: 'novasenha123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/senha atual/i);
  });

  it('400 quando novaSenha tem menos de 8 caracteres', async () => {
    pool.query.mockResolvedValueOnce({ rows: [fakeUser] });
    const res = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ senhaAtual: 'atual123', novaSenha: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 caracteres/i);
  });

  it('401 quando senhaAtual está incorreta', async () => {
    pool.query.mockResolvedValueOnce({ rows: [fakeUser] });
    bcrypt.compare.mockResolvedValue(false);
    const res = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ senhaAtual: 'errada', novaSenha: 'novasenha123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/incorreta/i);
  });

  it('200 ao atualizar nome com sucesso', async () => {
    const updated = { ...fakeUser, nome: 'Novo Nome' };
    pool.query.mockResolvedValueOnce({ rows: [fakeUser] });
    pool.query.mockResolvedValueOnce({ rows: [updated] });
    const res = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ nome: 'Novo Nome' });
    expect(res.status).toBe(200);
    expect(res.body.user.nome).toBe('Novo Nome');
    expect(res.body.token).toBeDefined();
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('200 ao atualizar email sem conflito', async () => {
    const updated = { ...fakeUser, email: 'novo@oab.com' };
    pool.query.mockResolvedValueOnce({ rows: [fakeUser] });
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [updated] });
    const res = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ email: 'novo@oab.com' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('novo@oab.com');
  });

  it('200 ao alterar senha com senhaAtual correta', async () => {
    const updated = { ...fakeUser, password_hash: '$novo$' };
    pool.query.mockResolvedValueOnce({ rows: [fakeUser] });
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue('$novo$');
    pool.query.mockResolvedValueOnce({ rows: [updated] });
    const res = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ senhaAtual: 'atual123', novaSenha: 'novasenha123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.password_hash).toBeUndefined();
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
