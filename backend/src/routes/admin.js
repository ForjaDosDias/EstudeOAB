const express = require('express');
const multer  = require('multer');
const crypto  = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');
const pool    = require('../db');
const { requireAdmin } = require('../middleware/auth');

// Armazena jobs em memória — simples e suficiente para uso admin
const jobs = new Map();

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 2 },
  fileFilter: (_, file, cb) => {
    if (!file.originalname.match(/\.pdf$/i)) {
      return cb(new Error('Apenas arquivos PDF são aceitos'));
    }
    cb(null, true);
  },
});

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

function makeClient() {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY não configurada');
  return new Anthropic({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/anthropic',
  });
}

// Parseia o gabarito oficial de forma determinística — sem LLM.
// Reconhece o padrão em duas linhas da FGV:
//   "1 2 3 ... 20\nC D C ... A"
function parseGabarito(texto) {
  if (!texto) return {};
  const mapa = {};
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < linhas.length - 1; i++) {
    const nums = linhas[i].match(/\b(\d{1,2})\b/g);
    if (!nums || nums.length < 5) continue;
    const letras = linhas[i + 1].match(/\b([ABCD])\b/g);
    if (!letras || letras.length !== nums.length) continue;
    nums.forEach((n, j) => { mapa[parseInt(n)] = letras[j]; });
    i++;
  }
  return mapa;
}

// Extrai número e ano do exame a partir do texto do gabarito ou caderno.
function detectarExame(texto) {
  const numMatch = texto.match(/(\d{1,2})º\s+EXAME/i);
  const anoMatch = texto.match(/\b(20\d{2})\b/);
  const num = numMatch ? parseInt(numMatch[1]) : null;
  return { edicao: num ? toRomano(num) : null, ano: anoMatch ? parseInt(anoMatch[1]) : null };
}

function toRomano(n) {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
  let r = '';
  for (let i = 0; i < vals.length; i++) while (n >= vals[i]) { r += syms[i]; n -= vals[i]; }
  return r;
}

// Gera prompt por intervalo de questões.
// Envia o texto COMPLETO do caderno em cada chamada — o modelo busca pelo número,
// evitando completamente o problema de questões cortadas na borda de chunks.
function makeRangePrompt(from, to) {
  return `Você é um extrator de provas da OAB.
O texto abaixo é o caderno COMPLETO de questões. Extraia SOMENTE as questões numeradas de ${from} a ${to}.

Retorne APENAS um array JSON válido, sem markdown, sem texto extra.

Formato de cada questão:
{
  "numero_questao": ${from},
  "enunciado": "texto completo do enunciado e caso hipotético",
  "alternativa_a": "texto da alternativa A (sem o prefixo 'A)')",
  "alternativa_b": "texto da alternativa B",
  "alternativa_c": "texto da alternativa C",
  "alternativa_d": "texto da alternativa D",
  "area_direito": "etica",
  "materia": "Publicidade do Advogado",
  "dificuldade": "media",
  "legislacao_ref": "Art. 39, RGOAB/OAB (2015)"
}

Regras:
- Extraia SOMENTE as questões de número ${from} a ${to} — ignore tudo fora desse intervalo
- Inclua uma questão apenas se ela estiver completa (enunciado + 4 alternativas)
- area_direito: exatamente uma de: civil, const, penal, trabalho, adm, etica, trib, outros
- dificuldade: baixa, media ou alta
- legislacao_ref: artigo e diploma mais relevante, null se não houver
- NÃO inclua gabarito nem explicacao — serão preenchidos separadamente
- NÃO invente alternativas — preserve o texto exato do PDF
- Se nenhuma questão do intervalo estiver completa, retorne []`;
}

// POST /api/admin/import-pdf — recebe PDFs, inicia job em background, retorna job_id imediatamente
// O Cloudflare free tem timeout de 99s; processamento assíncrono evita o corte.
router.post('/import-pdf', requireAdmin, (req, res, next) => {
  upload.array('pdfs', 2)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ error: 'Nenhum arquivo PDF enviado' });
  }

  const pdfParse = require('pdf-parse');
  const textos = [];

  for (const file of files) {
    console.log(`[import-pdf] Lendo PDF: ${file.originalname} (${(file.size/1024).toFixed(0)} KB)`);
    try {
      const data = await pdfParse(file.buffer);
      const chars = data.text?.trim().length || 0;
      console.log(`[import-pdf] "${file.originalname}": ${chars} caracteres extraídos`);
      if (chars < 50) {
        return res.status(422).json({
          error: `"${file.originalname}" não tem texto extraível (pode ser imagem escaneada)`,
        });
      }
      textos.push({ nome: file.originalname, texto: data.text });
    } catch (err) {
      console.error(`[import-pdf] Erro ao parsear "${file.originalname}":`, err.message);
      return res.status(422).json({ error: `Erro ao ler "${file.originalname}": ${err.message}` });
    }
  }

  // Identifica caderno e gabarito pela heurística de tamanho:
  // caderno tem centenas de KB de texto; gabarito tem poucos KB
  const [arqA, arqB] = textos;
  let textoCaderno, textoGabarito;
  if (!arqB) {
    textoCaderno  = arqA.texto;
    textoGabarito = null;
  } else {
    // Maior = caderno; menor = gabarito
    [textoCaderno, textoGabarito] = arqA.texto.length >= arqB.texto.length
      ? [arqA.texto, arqB.texto]
      : [arqB.texto, arqA.texto];
  }

  // Gabarito parseado deterministicamente — não depende de tokens de saída do LLM
  const mapaGabarito = parseGabarito(textoGabarito || '');
  const { edicao, ano } = detectarExame(textoGabarito || textoCaderno);
  const comGabarito = Object.keys(mapaGabarito).length;
  console.log(`[import-pdf] Gabarito: ${comGabarito} questões. Edição detectada: ${edicao || '?'} (${ano || '?'})`);

  // 4 chamadas fixas por intervalo de questão — o modelo busca pelo número,
  // eliminando o problema de questões cortadas na borda de chunks de texto.
  const RANGES = [[1, 20], [21, 40], [41, 60], [61, 80]];

  // Cria job e retorna imediatamente — processamento acontece em background
  const jobId = crypto.randomUUID();
  jobs.set(jobId, { status: 'processing', questoes: null, erro: null, criadoEm: Date.now() });
  console.log(`[import-pdf] Job ${jobId} — 4 lotes por intervalo (Q1-20, Q21-40, Q41-60, Q61-80)`);
  res.json({ jobId, status: 'processing' });

  // Tenta recuperar JSON mesmo quando a resposta foi truncada ou malformada
  function extrairQuestoes(raw, label) {
    // 1. Parse completo
    const completo = raw.match(/\[[\s\S]*\]/);
    if (completo) {
      try { return JSON.parse(completo[0]); } catch (e) {
        console.warn(`[import-pdf] ${label} — parse completo falhou: ${e.message.slice(0, 120)}`);
      }
    }

    // 2. Recuperação por último objeto completo
    const abreArray = raw.indexOf('[');
    if (abreArray !== -1) {
      const trecho = raw.slice(abreArray);
      const ultimoFecha = trecho.lastIndexOf('},');
      if (ultimoFecha !== -1) {
        try { return JSON.parse(trecho.slice(0, ultimoFecha + 1) + ']'); } catch { /* continua */ }
      }
    }

    // 3. Extração objeto a objeto — resiliente a questões individuais malformadas
    const questoes = [];
    const objRe = /\{[\s\S]*?\n\s*\}/g;
    let m;
    while ((m = objRe.exec(raw)) !== null) {
      try {
        const q = JSON.parse(m[0]);
        if (q.numero_questao && q.enunciado) questoes.push(q);
      } catch { /* objeto inválido, pula */ }
    }
    if (questoes.length > 0) {
      console.warn(`[import-pdf] ${label} — recuperação objeto-a-objeto: ${questoes.length} questões`);
      return questoes;
    }

    console.warn(`[import-pdf] ${label} — raw (primeiros 400 chars): ${raw.slice(0, 400)}`);
    return null;
  }

  // Processa em background
  setImmediate(async () => {
    try {
      const client = makeClient();
      const todasQuestoes = [];

      for (const [from, to] of RANGES) {
        const label = `Job ${jobId} Q${from}-Q${to}`;
        const basePrompt = `${makeRangePrompt(from, to)}\n\nTexto completo do caderno:\n\n${textoCaderno}`;
        console.log(`[import-pdf] ${label} — lote (${basePrompt.length} chars total)`);

        let questoes = null;
        const tentativas = [
          { prompt: basePrompt, tag: '' },
          {
            prompt: `Retorne APENAS o array JSON, sem nenhum texto fora dos colchetes.\n\n${basePrompt}`,
            tag: ' (retry)',
          },
        ];

        for (const { prompt, tag } of tentativas) {
          const response = await client.messages.create({
            model: DEEPSEEK_MODEL,
            max_tokens: 14000,
            messages: [{ role: 'user', content: prompt }],
          });

          console.log(`[import-pdf] ${label}${tag} — stop_reason: ${response.stop_reason}, tokens: ${JSON.stringify(response.usage)}`);

          if (response.stop_reason === 'max_tokens') {
            console.warn(`[import-pdf] ${label}${tag} — ATENÇÃO: resposta truncada`);
          }

          const raw = response.content[0]?.text || '';
          questoes = extrairQuestoes(raw, `${label}${tag}`);
          if (questoes && questoes.length > 0) break;
          console.warn(`[import-pdf] ${label}${tag} — sem questões extraídas`);
        }

        if (!questoes || questoes.length === 0) continue;

        console.log(`[import-pdf] ${label} — ${questoes.length} questões`);
        todasQuestoes.push(...questoes);
      }

      if (todasQuestoes.length === 0) {
        jobs.set(jobId, { status: 'error', erro: 'Nenhuma questão encontrada nos PDFs enviados.' });
        return;
      }

      // Remove duplicatas por numero_questao (não deve ocorrer com ranges exclusivos, mas por segurança)
      const vistas = new Set();
      const semDup = todasQuestoes.filter(q => {
        const k = q.numero_questao;
        if (!k || vistas.has(k)) return false;
        vistas.add(k);
        return true;
      });
      semDup.sort((a, b) => (a.numero_questao || 0) - (b.numero_questao || 0));

      // Mescla gabarito determinístico + metadados detectados
      const questoesFinal = semDup.map(q => {
        const num = q.numero_questao;
        const padded = String(num).padStart(3, '0');
        return {
          ...q,
          id:       edicao ? `${edicao}-Q${padded}` : null,
          banca:    'FGV',
          edicao:   edicao  || null,
          ano:      ano     || null,
          gabarito: mapaGabarito[num] || null,
          explicacao: null,
        };
      });

      const totalGabarito = questoesFinal.filter(q => q.gabarito).length;
      console.log(`[import-pdf] Job ${jobId} — concluído: ${questoesFinal.length} questões, ${totalGabarito} com gabarito`);
      jobs.set(jobId, { status: 'done', questoes: questoesFinal, comGabarito: totalGabarito, total: questoesFinal.length });
    } catch (err) {
      console.error(`[import-pdf] Job ${jobId} — erro na IA:`, err.message);
      jobs.set(jobId, { status: 'error', erro: `Erro ao processar com IA: ${err.message}` });
    }
  });
});

// GET /api/admin/import-status/:jobId — frontend faz polling aqui
router.get('/import-status/:jobId', requireAdmin, (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job não encontrado' });

  if (job.status === 'processing') return res.json({ status: 'processing' });
  if (job.status === 'error')      return res.json({ status: 'error', erro: job.erro });

  // Sucesso — remove da memória após entregar
  jobs.delete(req.params.jobId);
  res.json({ status: 'done', questoes: job.questoes, total: job.total, com_gabarito: job.comGabarito });
});

// POST /api/admin/bulk-save  — salva questões após revisão do admin
router.post('/bulk-save', requireAdmin, async (req, res) => {
  const { questoes } = req.body;
  if (!Array.isArray(questoes) || questoes.length === 0) {
    return res.status(400).json({ error: 'Nenhuma questão enviada' });
  }

  const client = await pool.connect();
  let inserted = 0, updated = 0, skipped = 0;
  const errors = [];

  try {
    await client.query('BEGIN');

    for (let i = 0; i < questoes.length; i++) {
      const q = questoes[i];
      if (!q.enunciado?.trim()) { skipped++; continue; }

      try {
        const result = await client.query(
          `INSERT INTO questions (
             external_id, banca, edicao, ano, numero_questao, enunciado,
             alternativa_a, alternativa_b, alternativa_c, alternativa_d,
             gabarito, area_direito, materia, dificuldade, legislacao_ref, explicacao
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (external_id) DO UPDATE SET
             banca = EXCLUDED.banca, edicao = EXCLUDED.edicao,
             ano = EXCLUDED.ano, numero_questao = EXCLUDED.numero_questao,
             enunciado = EXCLUDED.enunciado,
             alternativa_a = EXCLUDED.alternativa_a, alternativa_b = EXCLUDED.alternativa_b,
             alternativa_c = EXCLUDED.alternativa_c, alternativa_d = EXCLUDED.alternativa_d,
             gabarito = EXCLUDED.gabarito, area_direito = EXCLUDED.area_direito,
             materia = EXCLUDED.materia, dificuldade = EXCLUDED.dificuldade,
             legislacao_ref = EXCLUDED.legislacao_ref, explicacao = EXCLUDED.explicacao
           RETURNING (xmax = 0) AS is_insert`,
          [
            q.id || null, q.banca || null, q.edicao || null,
            q.ano ? parseInt(q.ano) : null, q.numero_questao ? parseInt(q.numero_questao) : null,
            q.enunciado, q.alternativa_a || null, q.alternativa_b || null,
            q.alternativa_c || null, q.alternativa_d || null,
            q.gabarito || null, q.area_direito || null,
            q.materia || null, q.dificuldade || null,
            q.legislacao_ref || null, q.explicacao || null,
          ]
        );
        result.rows[0]?.is_insert ? inserted++ : updated++;
      } catch (rowErr) {
        errors.push({ index: i + 1, erro: rowErr.message });
        skipped++;
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, total: questoes.length, inserted, updated, skipped, errors: errors.slice(0, 10) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('bulk-save error:', err.message);
    res.status(500).json({ error: `Erro ao salvar questões: ${err.message}` });
  } finally {
    client.release();
  }
});

// PUT /api/admin/questions/:id — editar questão existente
// Quando source='moderation' no body, seta corrigido_por_humano=TRUE
router.put('/questions/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d,
          gabarito, area_direito, banca, edicao, ano, materia, dificuldade,
          legislacao_ref, explicacao, source } = req.body;

  if (!enunciado?.trim()) {
    return res.status(400).json({ error: 'Enunciado é obrigatório' });
  }

  const corrigidoPorHumano = source === 'moderation';

  try {
    const result = await pool.query(
      `UPDATE questions SET
         enunciado=$1, alternativa_a=$2, alternativa_b=$3, alternativa_c=$4, alternativa_d=$5,
         gabarito=$6, area_direito=$7, banca=$8, edicao=$9, ano=$10, materia=$11, dificuldade=$12,
         legislacao_ref=$13, explicacao=$14,
         corrigido_por_humano = CASE WHEN $15 THEN TRUE ELSE corrigido_por_humano END
       WHERE id=$16 RETURNING *`,
      [enunciado, alternativa_a||null, alternativa_b||null, alternativa_c||null, alternativa_d||null,
       gabarito||null, area_direito||null, banca||null, edicao||null,
       ano ? parseInt(ano) : null, materia||null, dificuldade||null,
       legislacao_ref||null, explicacao||null, corrigidoPorHumano, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Questão não encontrada' });

    // Log de auditoria (fire-and-forget — não bloqueia a resposta)
    pool.query(
      'INSERT INTO question_edits (question_id, admin_id) VALUES ($1, $2)',
      [id, req.user.userId]
    )?.catch(err => console.error('question_edits insert error:', err.message));

    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /admin/questions error:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar questão' });
  }
});

// GET /api/admin/questions/:id/edits — histórico de edições da questão
router.get('/questions/:id/edits', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT qe.id, qe.editado_em, u.nome AS admin_nome, u.email AS admin_email
       FROM question_edits qe
       LEFT JOIN users u ON u.id = qe.admin_id
       WHERE qe.question_id = $1
       ORDER BY qe.editado_em DESC`,
      [req.params.id]
    );
    res.json({ edits: result.rows });
  } catch (err) {
    console.error('GET /admin/questions/:id/edits error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar histórico de edições' });
  }
});

function makeExplicacaoPrompt(q) {
  return `Você é um especialista em provas da OAB. Analise a questão abaixo e retorne APENAS um JSON com dois campos.

Questão:
Banca: ${q.banca || 'OAB'} | Edição: ${q.edicao || ''} | Área: ${q.area_direito || ''} | Matéria: ${q.materia || ''}
${q.enunciado}
${q.comando ? `\n${q.comando}` : ''}

A) ${q.alternativa_a || ''}
B) ${q.alternativa_b || ''}
C) ${q.alternativa_c || ''}
D) ${q.alternativa_d || ''}

Gabarito oficial: ${q.gabarito}
${q.legislacao_ref ? `Referência já conhecida: ${q.legislacao_ref}` : ''}

Retorne APENAS este JSON (sem markdown):
{
  "explicacao": "Explicação didática e objetiva de por que a alternativa ${q.gabarito} está correta e por que as outras estão erradas. Máximo 3 parágrafos.",
  "legislacao_ref": "Artigo e diploma legal principal, ex: Art. 186 · CC/2002"
}`;
}

// POST /api/admin/questions/:id/explicacao — gera explicação individual via DeepSeek
router.post('/questions/:id/explicacao', requireAdmin, async (req, res) => {
  try {
    const qRes = await pool.query(
      `SELECT id, banca, edicao, ano, numero_questao, enunciado, comando,
              alternativa_a, alternativa_b, alternativa_c, alternativa_d,
              gabarito, area_direito, materia, legislacao_ref
       FROM questions WHERE id = $1`,
      [req.params.id]
    );
    const q = qRes.rows[0];
    if (!q) return res.status(404).json({ error: 'Questão não encontrada' });
    if (!q.gabarito) return res.status(400).json({ error: 'Questão sem gabarito — defina o gabarito antes de gerar a explicação' });

    const client = makeClient();
    const response = await client.messages.create({
      model: DEEPSEEK_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: makeExplicacaoPrompt(q) }],
    });

    const raw = response.content[0]?.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(502).json({ error: 'IA não retornou JSON válido' });
    }

    const { explicacao, legislacao_ref } = JSON.parse(jsonMatch[0]);

    await pool.query(
      'UPDATE questions SET explicacao=$1, legislacao_ref=COALESCE($2, legislacao_ref) WHERE id=$3',
      [explicacao || null, legislacao_ref || null, req.params.id]
    );

    res.json({ explicacao, legislacao_ref });
  } catch (err) {
    console.error('POST /admin/questions/:id/explicacao error:', err.message);
    res.status(502).json({ error: `Erro ao gerar explicação: ${err.message}` });
  }
});

// POST /api/admin/bulk-explicacoes — gera explicações para TODAS as questões sem explicação
router.post('/bulk-explicacoes', requireAdmin, async (req, res) => {
  const pendentes = await pool.query(
    `SELECT id, banca, edicao, ano, numero_questao, enunciado, comando,
            alternativa_a, alternativa_b, alternativa_c, alternativa_d,
            gabarito, area_direito, materia, legislacao_ref
     FROM questions
     WHERE explicacao IS NULL AND gabarito IS NOT NULL
     ORDER BY id`
  );

  if (pendentes.rows.length === 0) {
    return res.json({ jobId: null, total: 0, mensagem: 'Todas as questões já têm explicação.' });
  }

  const jobId = crypto.randomUUID();
  jobs.set(jobId, { status: 'processing', total: pendentes.rows.length, done: 0, errors: [], criadoEm: Date.now() });
  res.json({ jobId, total: pendentes.rows.length });

  setImmediate(async () => {
    const client = makeClient();
    for (const q of pendentes.rows) {
      const job = jobs.get(jobId);
      if (!job || job.status === 'cancelled') break;

      try {
        const response = await client.messages.create({
          model: DEEPSEEK_MODEL,
          max_tokens: 1024,
          messages: [{ role: 'user', content: makeExplicacaoPrompt(q) }],
        });
        const raw = response.content[0]?.text || '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const { explicacao, legislacao_ref } = JSON.parse(jsonMatch[0]);
          await pool.query(
            'UPDATE questions SET explicacao=$1, legislacao_ref=COALESCE($2, legislacao_ref) WHERE id=$3',
            [explicacao || null, legislacao_ref || null, q.id]
          );
        } else {
          job.errors.push({ id: q.id, erro: 'IA não retornou JSON válido' });
        }
      } catch (err) {
        job.errors.push({ id: q.id, erro: err.message });
      }

      job.done++;
      // Pausa breve entre chamadas para não sobrecarregar a API
      await new Promise(r => setTimeout(r, 300));
    }

    const job = jobs.get(jobId);
    if (job) job.status = 'done';
    console.log(`[bulk-explicacoes] Job ${jobId} — concluído: ${jobs.get(jobId)?.done}/${jobs.get(jobId)?.total}`);
  });
});

// GET /api/admin/bulk-explicacoes/:jobId — polling de progresso
router.get('/bulk-explicacoes/:jobId', requireAdmin, (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job não encontrado' });
  res.json({
    status: job.status,
    total:  job.total,
    done:   job.done,
    errors: job.errors,
  });
});

// POST /api/admin/bulk-explicacoes/:jobId/cancel
router.post('/bulk-explicacoes/:jobId/cancel', requireAdmin, (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job não encontrado' });
  job.status = 'cancelled';
  res.json({ cancelled: true });
});

// DELETE /api/admin/questions/:id
router.delete('/questions/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM questions WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Questão não encontrada' });
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    console.error('DELETE /admin/questions error:', err.message);
    res.status(500).json({ error: 'Erro ao deletar questão' });
  }
});

module.exports = router;
