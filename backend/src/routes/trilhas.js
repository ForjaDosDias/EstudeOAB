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

// Slug reservado: a trilha montada com o foco do próprio aluno. Não existe na
// tabela `trilhas` — as áreas vêm de users.areas_foco.
const SLUG_PESSOAL = 'minha';

// Todas as disciplinas que hoje têm tema ativo. Sai do banco de propósito: uma
// lista chumbada no código é o que fez a Publicista prometer Tributário e
// devolver zero questões (o valor real é `trib e proc trib`, não `trib`).
async function todasDisciplinas() {
  const r = await pool.query('SELECT DISTINCT disciplina FROM temas WHERE ativo ORDER BY disciplina');
  return r.rows.map((x) => x.disciplina);
}

// ── Rota pública ───────────────────────────────────────────────────────────
// Fica ACIMA do requireAuth de propósito: é a tela 3 do onboarding, que mostra
// a trilha montada antes de o aluno criar conta. Mover para baixo quebra o
// fluxo inteiro, porque ali ainda não existe token.
// GET /api/trilhas/preview?foco=penal,adm
router.get('/preview', async (req, res) => {
  const foco = (req.query.foco || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    // O preview é sobre o foco do aluno, não sobre uma trilha do catálogo: o
    // universo é tudo que tem tema, e o recorte vem do que ele selecionou.
    const universo = await todasDisciplinas();

    // userId 0 não existe: o preview é sempre "progresso zero", sem consultar aluno.
    const faixas = await montarMapa(universo, 0, foco);
    const disciplinas = agruparPorDisciplina(faixas);

    // Só o resumo — o preview é um cartão visual, não a trilha inteira.
    res.json({
      foco,
      disciplinas: disciplinas.map((d) => ({
        disciplina: d.disciplina,
        total_temas: d.total_temas,
        incidencia_total: d.incidencia_total,
        temas: d.temas.map((t) => ({ tema_id: t.tema_id, nome: t.nome, incidencia: t.incidencia, faixa: t.faixa })),
      })),
      total_temas: disciplinas.reduce((s, d) => s + d.total_temas, 0),
    });
  } catch (err) {
    console.error('GET /trilhas/preview error:', err.message);
    res.status(500).json({ error: 'Erro ao montar o preview da trilha' });
  }
});

// A trilha é aberta: a única trava é o progresso do próprio aluno.
// Premium segue valendo para os outros recursos (stats, simulados, tema escuro).
router.use(requireAuth);

// Disciplinas que o aluno escolheu focar no onboarding. Vazio = todas.
async function focoDoUsuario(userId) {
  const r = await pool.query('SELECT areas_foco FROM users WHERE id = $1', [userId]);
  return r.rows[0]?.areas_foco || [];
}

// Resolve o slug em { trilha, areas }. `minha` é a trilha do próprio aluno; os
// outros slugs continuam vindo do catálogo.
async function resolverTrilha(slug, userId) {
  if (slug === SLUG_PESSOAL) {
    const foco = await focoDoUsuario(userId);
    const areas = foco.length ? foco : await todasDisciplinas();
    return {
      trilha: {
        slug: SLUG_PESSOAL,
        nome: 'Minha trilha',
        descricao: 'Montada com as disciplinas que você escolheu focar.',
        areas,
      },
      areas,
      foco,
    };
  }

  const r = await pool.query(
    'SELECT slug, nome, descricao, areas, ordem FROM trilhas WHERE slug = $1',
    [slug]
  );
  const trilha = r.rows[0];
  if (!trilha) return null;
  // O foco NÃO recorta as trilhas do catálogo: quem abre a Civilista pediu Civil
  // explicitamente. Cruzar as duas listas devolveria trilha vazia para quem
  // focou em outra coisa — o aluno escolheria uma trilha e receberia nada.
  return { trilha, areas: trilha.areas, foco: [] };
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
async function montarMapa(areas, userId, foco = []) {
  // O foco recorta a TRILHA e só ela: /questions/sortear e /sessions continuam
  // sorteando de todas as áreas. Estreitar o estudo guiado é escolha do aluno;
  // esconder da prova não é opção nossa.
  //
  // Foco vazio = todas. É o estado de quem clicou em "quero estudar todas" e o
  // default de quem nunca passou pelo onboarding — nunca "trilha vazia".
  const efetivas = foco.length ? areas.filter((a) => foco.includes(a)) : areas;
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

/**
 * Vira o mapa do avesso: de faixa → disciplina para disciplina → temas.
 *
 * A progressão NÃO muda — os temas continuam saindo na ordem das faixas (alta
 * antes de média antes de pontual) e o `bloqueado` de cada um é o mesmo que
 * `montarMapa` calculou. O que muda é só quem é a seção de primeiro nível: o
 * aluno pensa "quero estudar Penal", não "quero estudar a faixa alta".
 */
function agruparPorDisciplina(faixas) {
  const porDisc = new Map();

  // `faixas` já vem na ordem de progressão, então basta empilhar: os temas de
  // alta incidência entram primeiro na lista de cada disciplina.
  for (const f of faixas) {
    for (const d of f.disciplinas) {
      if (!porDisc.has(d.disciplina)) porDisc.set(d.disciplina, []);
      porDisc.get(d.disciplina).push(...d.temas);
    }
  }

  return [...porDisc.entries()]
    .map(([disciplina, temas]) => {
      const concluidos = temas.filter((t) => t.concluido).length;
      return {
        disciplina,
        temas,
        total_temas: temas.length,
        concluidos,
        pct: temas.length ? Math.round((concluidos / temas.length) * 100) : 0,
        incidencia_total: Math.round(temas.reduce((s, t) => s + t.incidencia, 0) * 100) / 100,
        // A disciplina só está travada se NENHUM tema dela estiver aberto — o
        // caminho sempre começa pelo que mais cai, que nunca vem bloqueado.
        bloqueado: temas.every((t) => t.bloqueado),
      };
    })
    .sort((a, b) => b.incidencia_total - a.incidencia_total);
}

// GET /api/trilhas/:slug/mapa — disciplina → temas + progresso do usuário.
// `slug = minha` é a trilha do foco do aluno.
router.get('/:slug/mapa', async (req, res) => {
  try {
    const alvo = await resolverTrilha(req.params.slug, req.user.userId);
    if (!alvo) return res.status(404).json({ error: 'Trilha não encontrada' });

    const faixas = await montarMapa(alvo.areas, req.user.userId, alvo.foco);
    res.json({
      trilha: alvo.trilha,
      disciplinas: agruparPorDisciplina(faixas),
      foco: alvo.foco,
    });
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
    const trilha = await resolverTrilha(req.params.slug, req.user.userId);
    if (!trilha) return res.status(404).json({ error: 'Trilha não encontrada' });

    const faixas = await montarMapa(trilha.areas, req.user.userId, trilha.foco);
    let alvo = null;
    for (const d of agruparPorDisciplina(faixas)) {
      const t = d.temas.find((x) => x.tema_id === temaId);
      if (t) alvo = t;
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
