const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Parâmetros da trilha (fáceis de ajustar) ────────────────────────────────
// Conclusão de um tema = respondeu o mínimo de questões com acerto >= limiar.
const LIMIAR_APROVACAO = 0.5; // fração de acerto para concluir um tema
const MIN_QUESTOES_TEMA = 5; // mínimo de questões respondidas (ou o total do tema, se menor)

// Faixas de incidência: quantas questões daquele tema caem, em média, por prova.
// A ordem do array É a ordem de progressão — o aluno domina o que mais cai antes
// de gastar tempo no que cai pouco.
const FAIXAS = [
  { id: 'alta', label: 'Alta incidência', min: 1.5 },
  { id: 'media', label: 'Incidência média', min: 1.0 },
  { id: 'pontual', label: 'Incidência pontual', min: 0 },
];

function faixaDe(incidencia) {
  return FAIXAS.find((f) => incidencia >= f.min) || FAIXAS[FAIXAS.length - 1];
}

// ── Rota pública ───────────────────────────────────────────────────────────
// Fica ACIMA do requireAuth de propósito: é a tela 3 do onboarding, que mostra
// a trilha montada antes de o aluno criar conta. Mover para baixo quebra o
// fluxo inteiro, porque ali ainda não existe token.
// GET /api/trilhas/preview?excluir=penal,adm
router.get('/preview', async (req, res) => {
  const excluidas = (req.query.excluir || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const trilhaRes = await pool.query(
      'SELECT slug, nome, descricao, areas FROM trilhas ORDER BY ordem, id LIMIT 1'
    );
    const trilha = trilhaRes.rows[0];
    if (!trilha) return res.status(404).json({ error: 'Nenhuma trilha cadastrada' });

    // userId 0 não existe: o preview é sempre "progresso zero", sem consultar aluno.
    const faixas = await montarMapa(trilha.areas, 0, excluidas);

    // Só o resumo — o preview é um cartão visual, não a trilha inteira.
    res.json({
      trilha: { nome: trilha.nome, descricao: trilha.descricao },
      excluidas,
      faixas: faixas.map((f) => ({
        faixa: f.faixa,
        label: f.label,
        disciplinas: f.disciplinas.map((d) => ({
          disciplina: d.disciplina,
          temas: d.temas.length,
          incidencia_total: d.incidencia_total,
        })),
      })),
      total_temas: faixas.reduce(
        (s, f) => s + f.disciplinas.reduce((x, d) => x + d.temas.length, 0),
        0
      ),
    });
  } catch (err) {
    console.error('GET /trilhas/preview error:', err.message);
    res.status(500).json({ error: 'Erro ao montar o preview da trilha' });
  }
});

// A trilha é aberta: a única trava é o progresso do próprio aluno.
// Premium segue valendo para os outros recursos (stats, simulados, tema escuro).
router.use(requireAuth);

// Disciplinas que o aluno pediu para não estudar (escolhidas no onboarding).
async function excluidasDoUsuario(userId) {
  const r = await pool.query('SELECT areas_excluidas FROM users WHERE id = $1', [userId]);
  return r.rows[0]?.areas_excluidas || [];
}

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

// GET /api/trilhas/:slug/questoes?total=10 — sorteia questões da trilha inteira
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

/**
 * Monta o mapa da trilha: faixa de incidência → disciplina → temas.
 *
 * A incidência de um tema é `questões do tema / edições no banco` — quantas
 * vezes ele cai, em média, por prova. Questões sem `tema_id` ficam de fora do
 * mapa (não geram tema fantasma), mas seguem valendo na prática livre.
 *
 * Trava: uma disciplina só abre numa faixa quando a MESMA disciplina na faixa
 * anterior estiver concluída. Faixa em que a disciplina não tem tema nenhum é
 * pulada e nunca bloqueia.
 */
async function montarMapa(areas, userId, excluidas = []) {
  // A exclusão some da TRILHA e só dela: /questions/sortear e /sessions
  // continuam sorteando de todas as áreas. Esconder a disciplina do estudo
  // guiado é escolha do aluno; esconder da prova não é opção nossa.
  const efetivas = areas.filter((a) => !excluidas.includes(a));
  if (!efetivas.length) return [];

  const incRes = await pool.query(
    `SELECT t.id, t.nome, t.slug, t.disciplina,
            COUNT(q.id)::int AS total,
            COUNT(q.id)::numeric / GREATEST((SELECT COUNT(DISTINCT edicao) FROM questions), 1) AS incidencia
       FROM temas t
       JOIN questions q ON q.tema_id = t.id AND q.enunciado IS NOT NULL
      WHERE t.ativo AND t.disciplina = ANY($1)
      GROUP BY t.id, t.nome, t.slug, t.disciplina`,
    [efetivas]
  );

  const perfRes = await pool.query(
    `SELECT q.tema_id,
            COUNT(DISTINCT a.question_id)::int AS respondidas,
            COUNT(DISTINCT a.question_id) FILTER (WHERE a.acertou)::int AS acertos
       FROM answers a
       JOIN questions q ON q.id = a.question_id
      WHERE a.user_id = $2 AND q.tema_id IS NOT NULL AND q.area_direito = ANY($1)
      GROUP BY q.tema_id`,
    [efetivas, userId]
  );

  const perf = {};
  for (const r of perfRes.rows) perf[r.tema_id] = r;

  const temas = incRes.rows.map((row) => {
    const p = perf[row.id] || { respondidas: 0, acertos: 0 };
    const minNec = Math.min(MIN_QUESTOES_TEMA, row.total);
    const pct = p.respondidas ? p.acertos / p.respondidas : 0;
    return {
      tema_id: row.id,
      nome: row.nome,
      slug: row.slug,
      disciplina: row.disciplina,
      faixa: faixaDe(Number(row.incidencia)).id,
      incidencia: Math.round(Number(row.incidencia) * 100) / 100,
      total_questoes: row.total,
      respondidas: p.respondidas,
      acertos: p.acertos,
      pct: Math.round(pct * 100),
      min_necessario: minNec,
      concluido: p.respondidas >= minNec && pct >= LIMIAR_APROVACAO,
    };
  });

  // Agrupa por faixa (na ordem de progressão) e, dentro dela, por disciplina
  const disciplinaTravada = new Set();
  return FAIXAS.map((f) => {
    const daFaixa = temas.filter((t) => t.faixa === f.id);
    const porDisciplina = {};
    for (const t of daFaixa) (porDisciplina[t.disciplina] ||= []).push(t);

    const disciplinas = Object.keys(porDisciplina)
      .sort()
      .map((disc) => {
        const lista = porDisciplina[disc].sort((a, b) => b.incidencia - a.incidencia);
        const bloqueado = disciplinaTravada.has(disc);
        return {
          disciplina: disc,
          bloqueado,
          concluida: lista.every((t) => t.concluido),
          incidencia_total: Math.round(lista.reduce((s, t) => s + t.incidencia, 0) * 100) / 100,
          temas: lista.map((t) => ({ ...t, bloqueado })),
        };
      });

    // Só depois de montar a faixa é que ela passa a travar as seguintes — assim
    // a própria faixa nunca se autobloqueia.
    for (const d of disciplinas) if (!d.concluida) disciplinaTravada.add(d.disciplina);

    return { faixa: f.id, label: f.label, min_incidencia: f.min, disciplinas };
  }).filter((f) => f.disciplinas.length > 0);
}

// GET /api/trilhas/:slug/mapa — trilha por faixa de incidência + progresso do usuário
router.get('/:slug/mapa', async (req, res) => {
  try {
    const trilhaRes = await pool.query(
      'SELECT slug, nome, descricao, areas, ordem FROM trilhas WHERE slug = $1',
      [req.params.slug]
    );
    const trilha = trilhaRes.rows[0];
    if (!trilha) return res.status(404).json({ error: 'Trilha não encontrada' });

    const excluidas = await excluidasDoUsuario(req.user.userId);
    const faixas = await montarMapa(trilha.areas, req.user.userId, excluidas);
    res.json({ trilha, faixas, excluidas });
  } catch (err) {
    console.error('GET /trilhas/:slug/mapa error:', err.message);
    res.status(500).json({ error: 'Erro ao montar a trilha' });
  }
});

// GET /api/trilhas/:slug/tema/:temaId/questoes — questões de um tema.
// A trava é recalculada no servidor: tema bloqueado → 423. O front nunca é a
// única barreira.
router.get('/:slug/tema/:temaId/questoes', async (req, res) => {
  const total = Math.min(parseInt(req.query.total) || 10, 80);
  const temaId = parseInt(req.params.temaId, 10);

  if (!Number.isInteger(temaId)) {
    return res.status(400).json({ error: 'Tema inválido' });
  }

  try {
    const trilhaRes = await pool.query('SELECT areas FROM trilhas WHERE slug = $1', [
      req.params.slug,
    ]);
    const trilha = trilhaRes.rows[0];
    if (!trilha) return res.status(404).json({ error: 'Trilha não encontrada' });

    const excluidas = await excluidasDoUsuario(req.user.userId);
    const faixas = await montarMapa(trilha.areas, req.user.userId, excluidas);
    let alvo = null;
    for (const f of faixas) {
      for (const d of f.disciplinas) {
        const t = d.temas.find((x) => x.tema_id === temaId);
        if (t) alvo = t;
      }
    }
    if (!alvo) return res.status(404).json({ error: 'Tema não pertence a esta trilha' });
    if (alvo.bloqueado) {
      return res.status(423).json({
        code: 'CHECKPOINT_LOCKED',
        error: 'Conclua esta disciplina na faixa de incidência anterior primeiro',
      });
    }

    const result = await pool.query(
      `SELECT id, enunciado, comando, alternativa_a, alternativa_b,
              alternativa_c, alternativa_d, area_direito, banca, edicao, dificuldade
         FROM questions
        WHERE enunciado IS NOT NULL AND tema_id = $1
        ORDER BY RANDOM()
        LIMIT $2`,
      [temaId, total]
    );
    res.json({ questoes: result.rows, total: result.rows.length, tema: alvo.nome });
  } catch (err) {
    console.error('GET /trilhas/:slug/tema error:', err.message);
    res.status(500).json({ error: 'Erro ao sortear questões do tema' });
  }
});

module.exports = router;
