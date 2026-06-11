jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../src/db');

const app = express();
app.use(express.json());
app.use('/api/ads', require('../../src/routes/ads'));

const JWT_SECRET = process.env.JWT_SECRET;

function token(userId = 1) {
  return jwt.sign({ userId, email: 'u@oab.com', role: 'user' }, JWT_SECRET);
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/ads/config', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/ads/config');
    expect(res.status).toBe(401);
  });

  it('200 free recebe config do vídeo 30s skippable', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ role: 'user', plan: 'free', premium_until: null }],
    });

    const res = await request(app).get('/api/ads/config').set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.adsEnabled).toBe(true);
    expect(res.body.provider).toBe('adsense');
    expect(res.body.formato).toBe('video');
    expect(res.body.duracaoS).toBe(30);
    expect(res.body.pulavelAposS).toBe(5);
  });

  it('200 premium não vê anúncios', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ role: 'user', plan: 'premium', premium_until: null }],
    });

    const res = await request(app).get('/api/ads/config').set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ adsEnabled: false });
  });

  it('404 quando usuário não existe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/ads/config').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });
});
