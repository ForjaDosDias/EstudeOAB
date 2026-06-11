const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { COIN_RULES } = require('../services/coins.service');

const router = express.Router();

// GET /api/coins — saldo + histórico de transações
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);

  try {
    const [saldoRes, txRes] = await Promise.all([
      pool.query('SELECT coins FROM users WHERE id = $1', [userId]),
      pool.query(
        `SELECT id, tipo, quantidade, referencia, criado_em
         FROM coin_transactions
         WHERE user_id = $1
         ORDER BY criado_em DESC
         LIMIT $2`,
        [userId, limit]
      ),
    ]);

    if (!saldoRes.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });

    res.json({
      saldo: saldoRes.rows[0].coins,
      regras: COIN_RULES,
      transacoes: txRes.rows,
    });
  } catch (err) {
    console.error('GET /coins error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar moedas' });
  }
});

module.exports = router;
