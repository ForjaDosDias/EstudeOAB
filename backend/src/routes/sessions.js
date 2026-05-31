const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const MODOS_VALIDOS = ['rapida', 'simulado', 'personalizado'];

// POST /api/sessions
router.post('/', requireAuth, async (req, res) => {
  const { modo, areas, total_questoes } = req.body;
  const userId = req.user.userId;

  if (!modo || !MODOS_VALIDOS.includes(modo)) {
    return res.status(400).json({ error: `modo deve ser um de: ${MODOS_VALIDOS.join(', ')}` });
  }
  const total = parseInt(total_questoes);
  if (!total || total < 1 || total > 80) {
    return res.status(400).json({ error: 'total_questoes deve ser entre 1 e 80' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionRes = await client.query(
      `INSERT INTO sessions (user_id, modo, areas, total_questoes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, modo, areas || null, total]
    );
    const sessionId = sessionRes.rows[0].id;

    const areaFilter = areas && areas.length > 0
      ? `AND area_direito = ANY($2)`
      : '';
    const params = areas && areas.length > 0
      ? [total, areas]
      : [total];

    const questoesRes = await client.query(
      `SELECT id, enunciado, comando, alternativa_a, alternativa_b,
              alternativa_c, alternativa_d, area_direito, banca, edicao, dificuldade,
              (SELECT COUNT(*)::int FROM question_comments WHERE question_id = questions.id) AS comment_count
       FROM questions
       WHERE enunciado IS NOT NULL ${areaFilter}
       ORDER BY RANDOM()
       LIMIT $1`,
      params
    );

    await client.query('COMMIT');

    res.status(201).json({ id: sessionId, questoes: questoesRes.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /sessions error:', err.message);
    res.status(500).json({ error: 'Erro ao criar sessão' });
  } finally {
    client.release();
  }
});

// PATCH /api/sessions/:id/concluir
router.patch('/:id/concluir', requireAuth, async (req, res) => {
  const sessionId = parseInt(req.params.id);
  const userId = req.user.userId;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionRes = await client.query(
      'SELECT * FROM sessions WHERE id = $1',
      [sessionId]
    );
    const session = sessionRes.rows[0];

    if (!session) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }
    if (session.user_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acesso negado' });
    }
    if (session.concluida) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Sessão já foi concluída' });
    }

    const answersRes = await client.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE acertou) AS acertos,
              COALESCE(SUM(tempo_s), 0) AS tempo_total_s
       FROM answers WHERE session_id = $1`,
      [sessionId]
    );
    const { total, acertos, tempo_total_s } = answersRes.rows[0];
    const acertosInt = parseInt(acertos);
    const totalInt = parseInt(total);

    let xpGanho = acertosInt * 15;
    if (totalInt > 0 && acertosInt === totalInt) xpGanho += 30;

    // Calcular streak
    const userRes = await client.query(
      'SELECT ultima_atividade, streak FROM users WHERE id = $1',
      [userId]
    );
    const { ultima_atividade, streak } = userRes.rows[0];
    const hoje = new Date().toISOString().slice(0, 10);
    const ontem = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const ultimaStr = ultima_atividade ? ultima_atividade.toISOString().slice(0, 10) : null;

    let novoStreak;
    if (ultimaStr === hoje) {
      novoStreak = streak;
    } else if (ultimaStr === ontem) {
      novoStreak = streak + 1;
    } else {
      novoStreak = 1;
    }

    await client.query(
      `UPDATE sessions SET acertos=$1, tempo_total_s=$2, xp_ganho=$3,
       concluida=TRUE, concluida_em=NOW() WHERE id=$4`,
      [acertosInt, parseInt(tempo_total_s), xpGanho, sessionId]
    );

    await client.query(
      `UPDATE users SET xp = xp + $1, streak = $2, ultima_atividade = $3 WHERE id = $4`,
      [xpGanho, novoStreak, hoje, userId]
    );

    await client.query('COMMIT');

    const userAtualizado = await pool.query(
      'SELECT xp, streak FROM users WHERE id = $1', [userId]
    );

    res.json({
      acertos: acertosInt,
      total: totalInt,
      tempo_total_s: parseInt(tempo_total_s),
      xp_ganho: xpGanho,
      streak: novoStreak,
      xp_total: userAtualizado.rows[0].xp,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PATCH /sessions/:id/concluir error:', err.message);
    res.status(500).json({ error: 'Erro ao concluir sessão' });
  } finally {
    client.release();
  }
});

module.exports = router;
