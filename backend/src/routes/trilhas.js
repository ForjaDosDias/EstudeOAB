const express = require('express');
const pool = require('../db');
const { requirePremium } = require('../middleware/plan');

const router = express.Router();

// Trilhas são recurso Premium (Free: sem trilhas)
router.use(requirePremium);

// GET /api/trilhas — lista trilhas com contagem de questões disponíveis
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.slug, t.nome, t.descricao, t.areas, t.ordem,
              (SELECT COUNT(*)::int FROM questions q WHERE q.area_direito = ANY(t.areas)) AS total_questoes
       FROM trilhas t
       ORDER BY t.ordem, t.id`
    );
    res.json({ trilhas: result.rows });
  } catch (err) {
    console.error('GET /trilhas error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar trilhas' });
  }
});

// GET /api/trilhas/:slug/questoes?total=10 — sorteia questões da trilha
router.get('/:slug/questoes', async (req, res) => {
  const total = Math.min(parseInt(req.query.total) || 10, 80);

  try {
    const trilhaRes = await pool.query('SELECT id, areas FROM trilhas WHERE slug = $1', [
      req.params.slug,
    ]);
    const trilha = trilhaRes.rows[0];
    if (!trilha) return res.status(404).json({ error: 'Trilha não encontrada' });

    const result = await pool.query(
      `SELECT id, enunciado, comando, alternativa_a, alternativa_b,
              alternativa_c, alternativa_d, area_direito, banca, edicao, dificuldade
       FROM questions
       WHERE enunciado IS NOT NULL AND area_direito = ANY($1)
       ORDER BY RANDOM()
       LIMIT $2`,
      [trilha.areas, total]
    );
    res.json({ questoes: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('GET /trilhas/:slug/questoes error:', err.message);
    res.status(500).json({ error: 'Erro ao sortear questões da trilha' });
  }
});

module.exports = router;
