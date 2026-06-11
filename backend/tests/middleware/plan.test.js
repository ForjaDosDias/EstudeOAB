jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../src/db');
const { requirePremium, isPremium } = require('../../src/middleware/plan');

const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
app.get('/premium-only', requirePremium, (req, res) => res.json({ ok: true }));

function token(role = 'user') {
  return jwt.sign({ userId: 1, email: 'u@oab.com', role }, JWT_SECRET);
}

beforeEach(() => jest.clearAllMocks());

describe('isPremium', () => {
  it('false para row inexistente', () => {
    expect(isPremium(null)).toBe(false);
  });

  it('true para admin independente do plano', () => {
    expect(isPremium({ role: 'admin', plan: 'free' })).toBe(true);
  });

  it('true para premium sem expiração', () => {
    expect(isPremium({ role: 'user', plan: 'premium', premium_until: null })).toBe(true);
  });

  it('true para premium com expiração futura', () => {
    expect(isPremium({ role: 'user', plan: 'premium', premium_until: new Date(Date.now() + 86400000) })).toBe(true);
  });

  it('false para premium expirado', () => {
    expect(isPremium({ role: 'user', plan: 'premium', premium_until: new Date(Date.now() - 86400000) })).toBe(false);
  });

  it('false para plano free', () => {
    expect(isPremium({ role: 'user', plan: 'free', premium_until: null })).toBe(false);
  });
});

describe('requirePremium', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/premium-only');
    expect(res.status).toBe(401);
  });

  it('403 PREMIUM_REQUIRED para usuário free', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ role: 'user', plan: 'free', premium_until: null }] });
    const res = await request(app).get('/premium-only').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PREMIUM_REQUIRED');
  });

  it('200 para usuário premium', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ role: 'user', plan: 'premium', premium_until: null }] });
    const res = await request(app).get('/premium-only').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('200 para admin mesmo com plano free', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ role: 'admin', plan: 'free', premium_until: null }] });
    const res = await request(app).get('/premium-only').set('Authorization', `Bearer ${token('admin')}`);
    expect(res.status).toBe(200);
  });

  it('404 quando usuário não existe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/premium-only').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });

  it('500 em erro do banco', async () => {
    pool.query.mockRejectedValueOnce(new Error('falhou'));
    const res = await request(app).get('/premium-only').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(500);
  });
});
