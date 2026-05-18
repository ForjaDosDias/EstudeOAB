const express = require('express');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/reports  — usuário reporta uma questão
router.post('/', requireAuth, async (req, res) => {
  const { question_id, comentario } = req.body;
  const userId = req.user.userId;

  if (!question_id || !comentario?.trim()) {
    return res.status(400).json({ error: 'question_id e comentario são obrigatórios' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verifica se a questão existe
    const qRes = await client.query('SELECT id FROM questions WHERE id = $1', [question_id]);
    if (!qRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Questão não encontrada' });
    }

    // Verifica report duplicado
    const existing = await client.query(
      'SELECT id, status FROM reports WHERE user_id = $1 AND question_id = $2',
      [userId, question_id]
    );
    if (existing.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Você já tem um report aberto para esta questão',
        jaReportou: true,
        reportId: existing.rows[0].id,
        status: existing.rows[0].status,
      });
    }

    const reportRes = await client.query(
      `INSERT INTO reports (user_id, question_id, comentario)
       VALUES ($1, $2, $3) RETURNING id`,
      [userId, question_id, comentario.trim()]
    );
    const reportId = reportRes.rows[0].id;

    // Salva versão original no histórico
    await client.query(
      'INSERT INTO report_edits (report_id, comentario) VALUES ($1, $2)',
      [reportId, comentario.trim()]
    );

    await client.query('COMMIT');
    res.status(201).json({ id: reportId, status: 'pending' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /reports error:', err.message);
    res.status(500).json({ error: 'Erro ao criar report' });
  } finally {
    client.release();
  }
});

// PATCH /api/reports/:id  — usuário edita seu próprio report
router.patch('/:id', requireAuth, async (req, res) => {
  const { comentario } = req.body;
  const userId = req.user.userId;
  const reportId = parseInt(req.params.id);

  if (!comentario?.trim()) {
    return res.status(400).json({ error: 'comentario é obrigatório' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reportRes = await client.query(
      'SELECT id, user_id, status FROM reports WHERE id = $1',
      [reportId]
    );
    const report = reportRes.rows[0];
    if (!report) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Report não encontrado' });
    }
    if (report.user_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await client.query(
      'UPDATE reports SET comentario = $1 WHERE id = $2',
      [comentario.trim(), reportId]
    );

    // Registra nova versão no histórico
    await client.query(
      'INSERT INTO report_edits (report_id, comentario) VALUES ($1, $2)',
      [reportId, comentario.trim()]
    );

    await client.query('COMMIT');
    res.json({ updated: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PATCH /reports/:id error:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar report' });
  } finally {
    client.release();
  }
});

// GET /api/admin/reports?status=pending|resolved|all
router.get('/admin', requireAdmin, async (req, res) => {
  const { status = 'pending', limit = 50, offset = 0 } = req.query;

  const conditions = [];
  const params = [];
  let idx = 1;

  if (status !== 'all') {
    conditions.push(`r.status = $${idx++}`);
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM reports r ${where}`, params
    );

    const dataRes = await pool.query(
      `SELECT
         r.id, r.comentario, r.status, r.created_at, r.resolved_at,
         u.id AS user_id, u.nome AS user_nome,
         q.id AS question_id, q.external_id, q.enunciado, q.area_direito,
         q.banca, q.edicao, q.gabarito, q.corrigido_por_humano
       FROM reports r
       LEFT JOIN users     u ON u.id = r.user_id
       JOIN       questions q ON q.id = r.question_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({ reports: dataRes.rows, total: parseInt(countRes.rows[0].count) });
  } catch (err) {
    console.error('GET /admin/reports error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar reports' });
  }
});

// GET /api/admin/reports/:id/historico
router.get('/admin/:id/historico', requireAdmin, async (req, res) => {
  const reportId = parseInt(req.params.id);
  try {
    const result = await pool.query(
      'SELECT id, comentario, editado_em FROM report_edits WHERE report_id = $1 ORDER BY editado_em ASC',
      [reportId]
    );
    res.json({ historico: result.rows });
  } catch (err) {
    console.error('GET /admin/reports/:id/historico error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

// PATCH /api/admin/reports/:id/resolve
router.patch('/admin/:id/resolve', requireAdmin, async (req, res) => {
  const reportId = parseInt(req.params.id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reportRes = await client.query(
      `SELECT r.id, r.user_id, r.question_id, r.status,
              q.external_id, q.edicao, q.numero_questao
       FROM reports r JOIN questions q ON q.id = r.question_id
       WHERE r.id = $1`,
      [reportId]
    );
    const report = reportRes.rows[0];
    if (!report) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Report não encontrado' });
    }
    if (report.status === 'resolved') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Report já foi resolvido' });
    }

    await client.query(
      `UPDATE reports SET status = 'resolved', resolved_at = NOW() WHERE id = $1`,
      [reportId]
    );

    // Notificação para o usuário que reportou
    if (report.user_id) {
      const questaoLabel = report.external_id || `questão #${report.question_id}`;
      await client.query(
        `INSERT INTO notifications (user_id, tipo, titulo, mensagem)
         VALUES ($1, 'report_resolved', $2, $3)`,
        [
          report.user_id,
          'Sua contribuição foi importante!',
          `Sua observação sobre a ${questaoLabel} foi revisada e a explicação foi corrigida. Obrigado por ajudar a melhorar o conteúdo!`,
        ]
      );
    }

    await client.query('COMMIT');
    res.json({ resolved: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PATCH /admin/reports/:id/resolve error:', err.message);
    res.status(500).json({ error: 'Erro ao resolver report' });
  } finally {
    client.release();
  }
});

module.exports = router;
