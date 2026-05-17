const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/stats/overview
router.get('/overview', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const hoje = new Date().toISOString().slice(0, 10);

    const [overviewRes, metaRes, userRes] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)                                    AS questoes_respondidas,
           COUNT(*) FILTER (WHERE acertou)             AS acertos,
           COALESCE(SUM(tempo_s), 0)                  AS tempo_total_s
         FROM answers WHERE user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT COUNT(*) AS questoes_hoje
         FROM answers
         WHERE user_id = $1 AND DATE(respondida_em) = $2`,
        [userId, hoje]
      ),
      pool.query(
        'SELECT xp, streak, minutos_dia FROM users WHERE id = $1',
        [userId]
      ),
    ]);

    const sessoesRes = await pool.query(
      `SELECT COUNT(*) AS sessoes_completas,
              COALESCE(SUM(tempo_total_s), 0) AS tempo_sessoes_s
       FROM sessions WHERE user_id = $1 AND concluida = TRUE`,
      [userId]
    );

    const { questoes_respondidas, acertos, tempo_total_s } = overviewRes.rows[0];
    const { questoes_hoje } = metaRes.rows[0];
    const { xp, streak, minutos_dia } = userRes.rows[0];
    const { sessoes_completas, tempo_sessoes_s } = sessoesRes.rows[0];

    const total = parseInt(questoes_respondidas);
    const acertosInt = parseInt(acertos);
    const acertosPct = total > 0 ? Math.round((acertosInt / total) * 100) : 0;
    const tempoH = Math.round(parseInt(tempo_sessoes_s) / 3600);
    const metaAlvo = Math.round(minutos_dia / 2); // ~questões para cumprir meta

    res.json({
      acertosPct,
      questoesRespondidas: total,
      sessoesCompletas: parseInt(sessoes_completas),
      tempoEstudoH: tempoH,
      xpTotal: xp,
      xpHoje: 0, // calculado via answers de hoje
      streak,
      metaDiaria: { feito: parseInt(questoes_hoje), alvo: metaAlvo },
    });
  } catch (err) {
    console.error('GET /stats/overview error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// GET /api/stats/areas
router.get('/areas', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const res_ = await pool.query(
      `SELECT
         q.area_direito                                  AS area,
         COUNT(q.id)                                     AS total,
         COUNT(a.id)                                     AS respondidas,
         COUNT(a.id) FILTER (WHERE a.acertou)            AS acertos
       FROM questions q
       LEFT JOIN answers a ON a.question_id = q.id AND a.user_id = $1
       WHERE q.area_direito IS NOT NULL
       GROUP BY q.area_direito
       ORDER BY q.area_direito`,
      [userId]
    );

    const areas = res_.rows.map(r => ({
      area:        r.area,
      total:       parseInt(r.total),
      respondidas: parseInt(r.respondidas),
      acertos:     parseInt(r.acertos),
      pct:         parseInt(r.respondidas) > 0
        ? Math.round((parseInt(r.acertos) / parseInt(r.respondidas)) * 100)
        : 0,
    }));

    res.json(areas);
  } catch (err) {
    console.error('GET /stats/areas error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar estatísticas por área' });
  }
});

// GET /api/stats/last-7-days
router.get('/last-7-days', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await pool.query(
      `SELECT
         DATE(respondida_em)                              AS dia,
         COUNT(*)                                         AS total,
         COUNT(*) FILTER (WHERE acertou)                 AS acertos
       FROM answers
       WHERE user_id = $1 AND respondida_em >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(respondida_em)
       ORDER BY dia`,
      [userId]
    );

    // Montar array de 7 posições (hoje = índice 6)
    const mapa = {};
    result.rows.forEach(r => {
      mapa[r.dia.toISOString().slice(0, 10)] = parseInt(r.total) > 0
        ? Math.round((parseInt(r.acertos) / parseInt(r.total)) * 100)
        : 0;
    });

    const spark = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 864e5).toISOString().slice(0, 10);
      return mapa[d] ?? 0;
    });

    res.json(spark);
  } catch (err) {
    console.error('GET /stats/last-7-days error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar histórico semanal' });
  }
});

// GET /api/stats/study-plan/next  (#16)
router.get('/study-plan/next', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const userRes = await pool.query(
      'SELECT minutos_dia, area_segunda_fase FROM users WHERE id = $1',
      [userId]
    );
    const { minutos_dia, area_segunda_fase } = userRes.rows[0];

    // Busca área com menor % de acerto entre as áreas com respostas
    const areaRes = await pool.query(
      `SELECT q.area_direito,
              COUNT(*) AS respondidas,
              COUNT(*) FILTER (WHERE a.acertou) AS acertos
       FROM answers a
       JOIN questions q ON q.id = a.question_id
       WHERE a.user_id = $1 AND q.area_direito IS NOT NULL
       GROUP BY q.area_direito
       ORDER BY (COUNT(*) FILTER (WHERE a.acertou)::float / COUNT(*)) ASC
       LIMIT 1`,
      [userId]
    );

    // Se não tem histórico, usa a área da 2ª fase do usuário
    const area = areaRes.rows[0]?.area_direito || area_segunda_fase || 'civil';
    const LABELS = {
      civil: 'Direito Civil', const: 'Constitucional', penal: 'Direito Penal',
      trabalho: 'Direito do Trabalho', adm: 'Direito Administrativo',
      etica: 'Ética Profissional', trib: 'Direito Tributário', empresarial: 'Direito Empresarial',
    };

    res.json({
      titulo: `Reforço em ${LABELS[area] || area}`,
      area,
      total: 10,
      minutos: minutos_dia || 30,
      xp_esperado: 150,
    });
  } catch (err) {
    console.error('GET /stats/study-plan/next error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar próxima sessão' });
  }
});

module.exports = router;
