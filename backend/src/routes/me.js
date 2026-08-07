const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { proximoMarco, STREAK_MARCOS } = require('../services/coins.service');

const router = express.Router();

// Dados do próprio usuário que a interface precisa em toda tela.
// `requireAuth`, NUNCA `requirePremium`: /api/stats/* inteiro é Premium, e é de
// lá que saía a meta diária — o aluno Free não enxergava o próprio progresso.
// Uma mecânica de retenção que não alcança quem ainda não paga não retém ninguém.
router.use(requireAuth);

// GET /api/me/streak — sequência, recorde, meta do dia e próximo marco
router.get('/streak', async (req, res) => {
  try {
    const [userRes, hojeRes] = await Promise.all([
      pool.query(
        `SELECT streak, streak_max, meta_questoes_dia, ultima_atividade
           FROM users WHERE id = $1`,
        [req.user.userId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM answers
          WHERE user_id = $1 AND respondida_em::date = CURRENT_DATE`,
        [req.user.userId]
      ),
    ]);

    const u = userRes.rows[0];
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });

    const meta = u.meta_questoes_dia || 10;
    const feito = hojeRes.rows[0]?.total || 0;
    const streak = u.streak || 0;

    res.json({
      streak,
      streak_max: u.streak_max || 0,
      meta: { alvo: meta, feito, batida: feito >= meta, faltam: Math.max(0, meta - feito) },
      proximo_marco: proximoMarco(streak),
      marcos: STREAK_MARCOS,
    });
  } catch (err) {
    console.error('GET /me/streak error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar streak' });
  }
});

module.exports = router;
