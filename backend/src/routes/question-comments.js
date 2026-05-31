const express = require('express');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/question-comments/:questionId — qualquer usuário autenticado
router.get('/:questionId', requireAuth, async (req, res) => {
  const questionId = parseInt(req.params.questionId);
  if (!questionId) return res.status(400).json({ error: 'questionId inválido' });

  try {
    const result = await pool.query(
      `SELECT qc.id, qc.corpo, qc.criado_em,
              u.nome AS autor_nome
       FROM question_comments qc
       LEFT JOIN users u ON u.id = qc.admin_id
       WHERE qc.question_id = $1
       ORDER BY qc.criado_em ASC`,
      [questionId]
    );
    res.json({ comments: result.rows });
  } catch (err) {
    console.error('GET /question-comments error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar comentários' });
  }
});

// POST /api/question-comments/:questionId — qualquer usuário autenticado
router.post('/:questionId', requireAuth, async (req, res) => {
  const questionId = parseInt(req.params.questionId);
  const { corpo } = req.body;
  const authorId = req.user.userId;

  if (!questionId) return res.status(400).json({ error: 'questionId inválido' });
  if (!corpo?.trim()) return res.status(400).json({ error: 'corpo é obrigatório' });

  try {
    const qCheck = await pool.query('SELECT id FROM questions WHERE id = $1', [questionId]);
    if (!qCheck.rows[0]) return res.status(404).json({ error: 'Questão não encontrada' });

    const result = await pool.query(
      `INSERT INTO question_comments (question_id, admin_id, corpo)
       VALUES ($1, $2, $3)
       RETURNING id, corpo, criado_em,
         (SELECT nome FROM users WHERE id = $2) AS autor_nome`,
      [questionId, authorId, corpo.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /question-comments error:', err.message);
    res.status(500).json({ error: 'Erro ao criar comentário' });
  }
});

// DELETE /api/question-comments/:commentId — apenas admins
router.delete('/:commentId', requireAdmin, async (req, res) => {
  const commentId = parseInt(req.params.commentId);
  if (!commentId) return res.status(400).json({ error: 'commentId inválido' });

  try {
    const result = await pool.query(
      'DELETE FROM question_comments WHERE id = $1 RETURNING id',
      [commentId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Comentário não encontrado' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /question-comments error:', err.message);
    res.status(500).json({ error: 'Erro ao deletar comentário' });
  }
});

module.exports = router;
