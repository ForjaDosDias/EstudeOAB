const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const coinsService = require('../services/coins.service');

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

    // ── Streak ────────────────────────────────────────────────────────────
    // Até 06/08/2026 o streak acendia ao concluir QUALQUER sessão — uma questão
    // já valia o dia. Agora ele só acende quando o aluno bate a meta diária,
    // que é o que a mecânica de retenção promete.
    const userRes = await client.query(
      'SELECT ultima_atividade, streak, streak_max, meta_questoes_dia FROM users WHERE id = $1',
      [userId]
    );
    const { ultima_atividade, streak, streak_max, meta_questoes_dia } = userRes.rows[0];
    const meta = meta_questoes_dia || 10;

    const respondidasHojeRes = await client.query(
      `SELECT COUNT(*)::int AS total FROM answers
        WHERE user_id = $1 AND respondida_em::date = CURRENT_DATE`,
      [userId]
    );
    const respondidasHoje = respondidasHojeRes.rows[0]?.total || 0;
    const metaBatida = respondidasHoje >= meta;

    const hoje = new Date().toISOString().slice(0, 10);
    const ontem = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const ultimaStr = ultima_atividade ? ultima_atividade.toISOString().slice(0, 10) : null;

    let novoStreak = streak;
    if (metaBatida && ultimaStr !== hoje) {
      // Um dia perdido zera: só emenda quem bateu a meta ontem.
      novoStreak = ultimaStr === ontem ? streak + 1 : 1;
    }
    // `ultima_atividade` marca o último dia em que a META foi batida — é o que
    // sustenta a emenda do dia seguinte. Dia com prática abaixo da meta não conta.
    const novaUltimaAtividade = metaBatida ? hoje : ultima_atividade;
    const novoMax = Math.max(novoStreak, streak_max || 0);

    await client.query(
      `UPDATE sessions SET acertos=$1, tempo_total_s=$2, xp_ganho=$3,
       concluida=TRUE, concluida_em=NOW() WHERE id=$4`,
      [acertosInt, parseInt(tempo_total_s), xpGanho, sessionId]
    );

    await client.query(
      `UPDATE users SET xp = xp + $1, streak = $2, streak_max = $3, ultima_atividade = $4
        WHERE id = $5`,
      [xpGanho, novoStreak, novoMax, novaUltimaAtividade, userId]
    );

    await client.query('COMMIT');

    // Fora da transação, no padrão das outras moedas: falha aqui não desfaz a sessão.
    let moedasMarco = 0;
    if (metaBatida && novoStreak > streak) {
      moedasMarco = await coinsService.awardStreakMilestone(userId, novoStreak);
    }

    const userAtualizado = await pool.query(
      'SELECT xp, streak, streak_max FROM users WHERE id = $1', [userId]
    );

    res.json({
      acertos: acertosInt,
      total: totalInt,
      tempo_total_s: parseInt(tempo_total_s),
      xp_ganho: xpGanho,
      streak: novoStreak,
      streak_max: userAtualizado.rows[0].streak_max,
      meta: { alvo: meta, feito: respondidasHoje, batida: metaBatida },
      moedas_marco: moedasMarco,
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
