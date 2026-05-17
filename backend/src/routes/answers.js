const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const LETRAS_VALIDAS = new Set(['A', 'B', 'C', 'D']);

// POST /api/answers
router.post('/', requireAuth, async (req, res) => {
  const { session_id, question_id, escolhida, tempo_s } = req.body;
  const userId = req.user.userId;

  if (!escolhida || !LETRAS_VALIDAS.has(escolhida.toUpperCase())) {
    return res.status(400).json({ error: 'escolhida deve ser A, B, C ou D' });
  }
  if (!session_id || !question_id || tempo_s == null) {
    return res.status(400).json({ error: 'session_id, question_id e tempo_s são obrigatórios' });
  }

  try {
    const sessionRes = await pool.query(
      'SELECT user_id, concluida FROM sessions WHERE id = $1',
      [session_id]
    );
    const session = sessionRes.rows[0];
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (session.user_id !== userId) return res.status(403).json({ error: 'Acesso negado' });
    if (session.concluida) return res.status(409).json({ error: 'Sessão já foi concluída' });

    const questionRes = await pool.query(
      'SELECT gabarito FROM questions WHERE id = $1',
      [question_id]
    );
    const question = questionRes.rows[0];
    if (!question) return res.status(404).json({ error: 'Questão não encontrada' });

    const correta = question.gabarito.toUpperCase();
    const escolhidaUp = escolhida.toUpperCase();
    const acertou = escolhidaUp === correta;

    await pool.query(
      `INSERT INTO answers (user_id, session_id, question_id, escolhida, correta, acertou, tempo_s)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, session_id, question_id, escolhidaUp, correta, acertou, tempo_s]
    );

    res.status(201).json({ acertou, correta });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Questão já respondida nesta sessão' });
    }
    console.error('POST /answers error:', err.message);
    res.status(500).json({ error: 'Erro ao registrar resposta' });
  }
});

// GET /api/answers/history?area=&resultado=&limit=&offset=
router.get('/history', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { area, resultado, limit = 20, offset = 0 } = req.query;

  const conditions = ['a.user_id = $1'];
  const params = [userId];
  let idx = 2;

  if (area) {
    conditions.push(`q.area_direito ILIKE $${idx++}`);
    params.push(area);
  }
  if (resultado === 'acertos') {
    conditions.push(`a.acertou = TRUE`);
  } else if (resultado === 'erros') {
    conditions.push(`a.acertou = FALSE`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM answers a JOIN questions q ON q.id = a.question_id ${where}`,
      params
    );

    const dataRes = await pool.query(
      `SELECT a.id, a.escolhida, a.correta, a.acertou, a.tempo_s, a.respondida_em,
              q.id AS question_id, q.enunciado, q.banca, q.edicao, q.area_direito,
              q.gabarito, q.alternativa_a, q.alternativa_b, q.alternativa_c, q.alternativa_d
       FROM answers a
       JOIN questions q ON q.id = a.question_id
       ${where}
       ORDER BY a.respondida_em DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({ answers: dataRes.rows, total: parseInt(countRes.rows[0].count) });
  } catch (err) {
    console.error('GET /answers/history error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

module.exports = router;
