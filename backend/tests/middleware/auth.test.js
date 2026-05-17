jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const jwt = require('jsonwebtoken');
const { requireAuth, requireAdmin, JWT_SECRET } = require('../../src/middleware/auth');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('requireAuth', () => {
  it('retorna 401 sem header Authorization', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 401 com token inválido', () => {
    const req = { headers: { authorization: 'Bearer token-invalido' } };
    const res = mockRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('chama next() e popula req.user com token válido', () => {
    const payload = { userId: 1, email: 'a@b.com', role: 'user' };
    const token = jwt.sign(payload, JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.userId).toBe(1);
    expect(req.user.email).toBe('a@b.com');
  });
});

describe('requireAdmin', () => {
  it('retorna 403 quando role é user', () => {
    const token = jwt.sign({ userId: 1, email: 'a@b.com', role: 'user' }, JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('chama next() quando role é admin', () => {
    const token = jwt.sign({ userId: 2, email: 'admin@b.com', role: 'admin' }, JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
