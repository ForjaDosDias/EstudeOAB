const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { isPremium } = require('../middleware/plan');

const router = express.Router();

// GET /api/ads/config — configuração de anúncios para o usuário logado.
// Premium não vê anúncios; Free recebe a config do AdSense (vídeo 30s skippable).
router.get('/config', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT role, plan, premium_until FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (isPremium(result.rows[0])) {
      return res.json({ adsEnabled: false });
    }

    res.json({
      adsEnabled: true,
      provider: 'adsense',
      clientId: process.env.ADSENSE_CLIENT_ID || null,
      slotId: process.env.ADSENSE_VIDEO_SLOT_ID || null,
      formato: 'video',
      duracaoS: 30,
      pulavelAposS: 5,
    });
  } catch (err) {
    console.error('GET /ads/config error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar configuração de anúncios' });
  }
});

module.exports = router;
