const express = require('express');
const pool = require('../db');
const { requirePremium } = require('../middleware/plan');

const router = express.Router();

// ── Parâmetros da trilha gamificada (fáceis de ajustar) ──────────────────────
// Conclusão de um checkpoint = respondeu o mínimo de questões com acerto >= limiar.
const LIMIAR_APROVACAO = 0.5;        // fração de acerto para concluir um checkpoint
const MIN_QUESTOES_CHECKPOINT = 5;   // mínimo de questões respondidas (ou o total do tier, se menor)
const DIFICULDADES = ['baixa', 'media', 'alta']; // ordem de progressão dentro de cada disciplina

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

// Monta o estado da trilha para um usuário: disciplinas (áreas) ordenadas por
// incidência ("qual cai mais"), e dentro de cada uma os checkpoints por
// dificuldade (baixa→media→alta). A trava é sequencial e por disciplina —
// um tier só libera quando o anterior da MESMA disciplina foi concluído
// (tiers vazios são pulados e nunca bloqueiam).
async function montarMapa(areas, userId) {
  const incRes = await pool.query(
    `SELECT area_direito,
            COUNT(*)::int AS total,
            GREATEST(COUNT(DISTINCT edicao), 1)::int AS edicoes,
            COUNT(*) FILTER (WHERE dificuldade = 'baixa')::int AS baixa,
            COUNT(*) FILTER (WHERE dificuldade = 'media')::int AS media,
            COUNT(*) FILTER (WHERE dificuldade = 'alta')::int  AS alta
       FROM questions
      WHERE enunciado IS NOT NULL AND area_direito = ANY($1)
      GROUP BY area_direito`,
    [areas]
  );

  const perfRes = await pool.query(
    `SELECT q.area_direito,
            q.dificuldade,
            COUNT(DISTINCT a.question_id)::int AS respondidas,
            COUNT(DISTINCT a.question_id) FILTER (WHERE a.acertou)::int AS acertos
       FROM answers a
       JOIN questions q ON q.id = a.question_id
      WHERE a.user_id = $2 AND q.area_direito = ANY($1)
      GROUP BY q.area_direito, q.dificuldade`,
    [areas, userId]
  );

  const perf = {};
  for (const r of perfRes.rows) {
    perf[`${r.area_direito}|${r.dificuldade}`] = { respondidas: r.respondidas, acertos: r.acertos };
  }

  const ordenadas = [...incRes.rows].sort((a, b) => b.total - a.total);

  return ordenadas.map((row) => {
    let anteriorPendente = false;
    const checkpoints = [];
    for (const dif of DIFICULDADES) {
      const total = row[dif];
      if (!total) continue; // tier sem questões: pulado, não bloqueia (fiel ao protótipo)
      const p = perf[`${row.area_direito}|${dif}`] || { respondidas: 0, acertos: 0 };
      const minNec = Math.min(MIN_QUESTOES_CHECKPOINT, total);
      const pct = p.respondidas ? p.acertos / p.respondidas : 0;
      const concluido = p.respondidas >= minNec && pct >= LIMIAR_APROVACAO;
      checkpoints.push({
        dificuldade: dif,
        total,
        respondidas: p.respondidas,
        acertos: p.acertos,
        pct: Math.round(pct * 100),
        min_necessario: minNec,
        concluido,
        bloqueado: anteriorPendente,
      });
      if (!concluido) anteriorPendente = true; // trava os tiers seguintes desta disciplina
    }
    return {
      area: row.area_direito,
      incidencia_avg: Math.round((row.total / row.edicoes) * 10) / 10,
      total_questoes: row.total,
      checkpoints,
    };
  });
}

// GET /api/trilhas/:slug/mapa — trilha com checkpoints + progresso do usuário
router.get('/:slug/mapa', async (req, res) => {
  try {
    const trilhaRes = await pool.query(
      'SELECT slug, nome, descricao, areas, ordem FROM trilhas WHERE slug = $1',
      [req.params.slug]
    );
    const trilha = trilhaRes.rows[0];
    if (!trilha) return res.status(404).json({ error: 'Trilha não encontrada' });

    const disciplinas = await montarMapa(trilha.areas, req.user.userId);
    res.json({ trilha, disciplinas });
  } catch (err) {
    console.error('GET /trilhas/:slug/mapa error:', err.message);
    res.status(500).json({ error: 'Erro ao montar a trilha' });
  }
});

// GET /api/trilhas/:slug/checkpoint/:area/:dificuldade/questoes — questões de um
// checkpoint. A trava é recalculada no servidor: checkpoint bloqueado → 423.
router.get('/:slug/checkpoint/:area/:dificuldade/questoes', async (req, res) => {
  const total = Math.min(parseInt(req.query.total) || 10, 80);
  const { area, dificuldade } = req.params;

  if (!DIFICULDADES.includes(dificuldade)) {
    return res.status(400).json({ error: 'Dificuldade inválida' });
  }

  try {
    const trilhaRes = await pool.query('SELECT areas FROM trilhas WHERE slug = $1', [
      req.params.slug,
    ]);
    const trilha = trilhaRes.rows[0];
    if (!trilha) return res.status(404).json({ error: 'Trilha não encontrada' });
    if (!trilha.areas.includes(area)) {
      return res.status(404).json({ error: 'Disciplina não pertence a esta trilha' });
    }

    // Enforcement da trava no servidor — o front nunca é a única barreira
    const disciplinas = await montarMapa(trilha.areas, req.user.userId);
    const disc = disciplinas.find((d) => d.area === area);
    const cp = disc && disc.checkpoints.find((c) => c.dificuldade === dificuldade);
    if (!cp) return res.status(404).json({ error: 'Checkpoint sem questões' });
    if (cp.bloqueado) {
      return res.status(423).json({
        code: 'CHECKPOINT_LOCKED',
        error: 'Conclua o checkpoint anterior desta disciplina primeiro',
      });
    }

    const result = await pool.query(
      `SELECT id, enunciado, comando, alternativa_a, alternativa_b,
              alternativa_c, alternativa_d, area_direito, banca, edicao, dificuldade
         FROM questions
        WHERE enunciado IS NOT NULL AND area_direito = $1 AND dificuldade = $2
        ORDER BY RANDOM()
        LIMIT $3`,
      [area, dificuldade, total]
    );
    res.json({ questoes: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('GET /trilhas/:slug/checkpoint error:', err.message);
    res.status(500).json({ error: 'Erro ao sortear questões do checkpoint' });
  }
});

module.exports = router;
