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

const PROMPT_SISTEMA = `Você é um especialista em provas da OAB (Ordem dos Advogados do Brasil).
Você receberá o texto extraído de 1 ou 2 PDFs: o caderno de questões e/ou o gabarito oficial.

Sua tarefa:
1. Se receber APENAS o caderno de questões: extraia todas as questões. Use gabarito: null quando não disponível.
2. Se receber APENAS o gabarito: isso não é suficiente. Retorne [].
3. Se receber AMBOS (caderno + gabarito): extraia as questões e preencha o gabarito cruzando pelo número da questão.

Como identificar cada documento:
- Caderno de questões: contém enunciados longos, alternativas A/B/C/D, situações hipotéticas.
- Gabarito: contém uma tabela simples com número da questão e letra (ex: "01 - B", "02 - A").

Retorne APENAS um array JSON válido, sem markdown, sem explicações.

Formato de cada questão:
{
  "id": "XLI-Q001",
  "banca": "FGV",
  "edicao": "XLI",
  "ano": 2024,
  "numero_questao": 1,
  "enunciado": "texto completo do enunciado",
  "alternativa_a": "texto da alternativa A",
  "alternativa_b": "texto da alternativa B",
  "alternativa_c": "texto da alternativa C",
  "alternativa_d": "texto da alternativa D",
  "gabarito": "B",
  "area_direito": "civil",
  "materia": "Responsabilidade Civil",
  "dificuldade": "media",
  "legislacao_ref": "Art. 186 · CC/2002",
  "explicacao": "Explicação didática de por que a alternativa correta está certa e as outras estão erradas."
}

Regras:
- id: sempre no formato {EDICAO}-Q{numero com 3 dígitos}, ex: XLI-Q001
- area_direito: exatamente uma de: civil, const, penal, trabalho, adm, etica, trib
- dificuldade: baixa, media ou alta (estime pela complexidade)
- gabarito: A, B, C ou D — preencha a partir do gabarito oficial se disponível, senão null
- legislacao_ref: artigo e diploma legal mais relevante (ex: "Art. 5º, X · CF/88"). Use null se não houver.
- explicacao: explique por que o gabarito está correto e por que as outras alternativas estão erradas. Use null se o gabarito for null.
- Não invente alternativas. Preserve o texto exatamente como está no PDF`;

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

  // Cria job e retorna imediatamente — processamento acontece em background
  const jobId = crypto.randomUUID();
  jobs.set(jobId, { status: 'processing', questoes: null, erro: null, criadoEm: Date.now() });

  // Separa texto do caderno e do gabarito
  const textoCaderno  = textos[0].texto;
  const textoGabarito = textos[1]?.texto || null;

  // Divide o caderno em lotes de ~40.000 chars (~10k tokens de entrada)
  // para garantir que a resposta caiba dentro dos 16k tokens de saída
  const CHUNK_SIZE = 40000;
  const chunks = [];
  for (let i = 0; i < textoCaderno.length; i += CHUNK_SIZE) {
    chunks.push(textoCaderno.slice(i, i + CHUNK_SIZE));
  }
  console.log(`[import-pdf] Job ${jobId} — ${chunks.length} lote(s) de até ${CHUNK_SIZE} chars. Gabarito: ${textoGabarito ? 'sim' : 'não'}`);
  res.json({ jobId, status: 'processing' });

  // Tenta recuperar JSON mesmo quando a resposta foi truncada por max_tokens
  function extrairQuestoes(raw) {
    // Tenta match completo primeiro
    const completo = raw.match(/\[[\s\S]*\]/);
    if (completo) {
      try { return JSON.parse(completo[0]); } catch { /* cai para recuperação */ }
    }
    // Resposta truncada: acha o último objeto completo e fecha o array
    const abreArray = raw.indexOf('[');
    if (abreArray === -1) return null;
    const trecho = raw.slice(abreArray);
    const ultimoFecha = trecho.lastIndexOf('},');
    if (ultimoFecha === -1) return null;
    try {
      return JSON.parse(trecho.slice(0, ultimoFecha + 1) + ']');
    } catch {
      return null;
    }
  }

  // Processa em background
  setImmediate(async () => {
    try {
      const client = makeClient();
      const todasQuestoes = [];

      for (let i = 0; i < chunks.length; i++) {
        const sufixo = textoGabarito
          ? `\n\n--- GABARITO OFICIAL ---\n\n${textoGabarito}`
          : '';
        const conteudo = chunks.length === 1
          ? `Texto do PDF:\n\n${chunks[i]}${sufixo}`
          : `Texto do PDF (parte ${i + 1} de ${chunks.length}):\n\n${chunks[i]}${sufixo}`;

        console.log(`[import-pdf] Job ${jobId} — lote ${i + 1}/${chunks.length} (${conteudo.length} chars)`);

        const response = await client.messages.create({
          model: DEEPSEEK_MODEL,
          max_tokens: 16000,
          messages: [{ role: 'user', content: `${PROMPT_SISTEMA}\n\n${conteudo}` }],
        });

        console.log(`[import-pdf] Job ${jobId} lote ${i + 1} — stop_reason: ${response.stop_reason}, tokens: ${JSON.stringify(response.usage)}`);

        const raw = response.content[0]?.text || '';
        const questoes = extrairQuestoes(raw);

        if (!questoes || questoes.length === 0) {
          console.warn(`[import-pdf] Job ${jobId} lote ${i + 1} — sem questões extraídas`);
          continue;
        }

        console.log(`[import-pdf] Job ${jobId} lote ${i + 1} — ${questoes.length} questões extraídas`);
        todasQuestoes.push(...questoes);

        if (response.stop_reason === 'max_tokens') {
          console.warn(`[import-pdf] Job ${jobId} lote ${i + 1} — resposta truncada, ${questoes.length} questões recuperadas parcialmente`);
        }
      }

      if (todasQuestoes.length === 0) {
        jobs.set(jobId, { status: 'error', erro: 'Nenhuma questão encontrada nos PDFs enviados.' });
        return;
      }

      const comGabarito = todasQuestoes.filter(q => q.gabarito).length;
      console.log(`[import-pdf] Job ${jobId} — concluído: ${todasQuestoes.length} questões, ${comGabarito} com gabarito`);
      jobs.set(jobId, { status: 'done', questoes: todasQuestoes, comGabarito, total: todasQuestoes.length });
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
router.put('/questions/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d,
          gabarito, area_direito, banca, edicao, ano, materia, dificuldade,
          legislacao_ref, explicacao } = req.body;

  if (!enunciado?.trim()) {
    return res.status(400).json({ error: 'Enunciado é obrigatório' });
  }

  try {
    const result = await pool.query(
      `UPDATE questions SET
         enunciado=$1, alternativa_a=$2, alternativa_b=$3, alternativa_c=$4, alternativa_d=$5,
         gabarito=$6, area_direito=$7, banca=$8, edicao=$9, ano=$10, materia=$11, dificuldade=$12,
         legislacao_ref=$13, explicacao=$14
       WHERE id=$15 RETURNING *`,
      [enunciado, alternativa_a||null, alternativa_b||null, alternativa_c||null, alternativa_d||null,
       gabarito||null, area_direito||null, banca||null, edicao||null,
       ano ? parseInt(ano) : null, materia||null, dificuldade||null,
       legislacao_ref||null, explicacao||null, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Questão não encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /admin/questions error:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar questão' });
  }
});

// POST /api/admin/questions/:id/explicacao — gera explicação via DeepSeek
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

    const prompt = `Você é um especialista em provas da OAB. Analise a questão abaixo e retorne APENAS um JSON com dois campos.

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

    const client = makeClient();
    const response = await client.messages.create({
      model: DEEPSEEK_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
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
