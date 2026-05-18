const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await pool.query(
      `SELECT id, tipo, titulo, mensagem, lida, created_at
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    const naoLidas = result.rows.filter(n => !n.lida).length;
    res.json({ notifications: result.rows, nao_lidas: naoLidas });
  } catch (err) {
    console.error('GET /notifications error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar notificações' });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    await pool.query(
      'UPDATE notifications SET lida = TRUE WHERE user_id = $1 AND lida = FALSE',
      [userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /notifications/read-all error:', err.message);
    res.status(500).json({ error: 'Erro ao marcar notificações como lidas' });
  }
});

module.exports = router;
