const pool = require('../db');
const { requireAuth } = require('./auth');

// Um usuário é premium se plan='premium' e premium_until ainda não passou
// (premium_until NULL = vitalício). Admins têm acesso completo sempre.
function isPremium(row) {
  if (!row) return false;
  if (row.role === 'admin') return true;
  if (row.plan !== 'premium') return false;
  if (row.premium_until && new Date(row.premium_until) < new Date()) return false;
  return true;
}

// requirePremium — bloqueia usuários Free com 403 { code: 'PREMIUM_REQUIRED' }
function requirePremium(req, res, next) {
  requireAuth(req, res, async () => {
    try {
      const result = await pool.query(
        'SELECT role, plan, premium_until FROM users WHERE id = $1',
        [req.user.userId]
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });
      if (!isPremium(result.rows[0])) {
        return res.status(403).json({
          code: 'PREMIUM_REQUIRED',
          error: 'Recurso disponível apenas no plano Premium',
        });
      }
      next();
    } catch (err) {
      console.error('requirePremium error:', err.message);
      res.status(500).json({ error: 'Erro ao verificar plano' });
    }
  });
}

// Consulta o plano direto no banco — para checagens condicionais dentro de rotas
async function userIsPremium(userId) {
  const result = await pool.query(
    'SELECT role, plan, premium_until FROM users WHERE id = $1',
    [userId]
  );
  return isPremium(result.rows[0]);
}

module.exports = { requirePremium, isPremium, userIsPremium };
