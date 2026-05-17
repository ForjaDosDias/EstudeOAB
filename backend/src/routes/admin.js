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
  "dificuldade": "media"
}

Regras:
- id: sempre no formato {EDICAO}-Q{numero com 3 dígitos}, ex: XLI-Q001
- area_direito: exatamente uma de: civil, const, penal, trabalho, adm, etica, trib
- dificuldade: baixa, media ou alta (estime pela complexidade)
- gabarito: A, B, C ou D — preencha a partir do gabarito oficial se disponível, senão null
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

  const conteudo = textos.length === 1
    ? `Texto do PDF:\n\n${textos[0].texto}`
    : textos.map((t, i) => `--- PDF ${i + 1}: ${t.nome} ---\n\n${t.texto}`).join('\n\n');

  console.log(`[import-pdf] Job ${jobId} iniciado. ${conteudo.length} chars → DeepSeek`);
  res.json({ jobId, status: 'processing' });

  // Processa em background (sem bloquear a resposta HTTP)
  setImmediate(async () => {
    try {
      const client = makeClient();
      const response = await client.messages.create({
        model: DEEPSEEK_MODEL,
        max_tokens: 16000,
        messages: [{ role: 'user', content: `${PROMPT_SISTEMA}\n\n${conteudo}` }],
      });

      console.log(`[import-pdf] Job ${jobId} — DeepSeek respondeu. stop_reason: ${response.stop_reason}, tokens: ${JSON.stringify(response.usage)}`);
      const raw = response.content[0]?.text || '';
      const jsonMatch = raw.match(/\[[\s\S]*\]/);

      if (!jsonMatch) {
        console.error(`[import-pdf] Job ${jobId} — sem JSON válido na resposta:`, raw.slice(0, 300));
        jobs.set(jobId, { status: 'error', erro: 'A IA não retornou JSON válido. Tente novamente.' });
        return;
      }

      const questoes = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(questoes) || questoes.length === 0) {
        jobs.set(jobId, { status: 'error', erro: 'Nenhuma questão encontrada nos PDFs enviados.' });
        return;
      }

      const comGabarito = questoes.filter(q => q.gabarito).length;
      console.log(`[import-pdf] Job ${jobId} — concluído: ${questoes.length} questões, ${comGabarito} com gabarito`);
      jobs.set(jobId, { status: 'done', questoes, comGabarito, total: questoes.length });
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
             gabarito, area_direito, materia, dificuldade
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (external_id) DO UPDATE SET
             banca = EXCLUDED.banca, edicao = EXCLUDED.edicao,
             ano = EXCLUDED.ano, numero_questao = EXCLUDED.numero_questao,
             enunciado = EXCLUDED.enunciado,
             alternativa_a = EXCLUDED.alternativa_a, alternativa_b = EXCLUDED.alternativa_b,
             alternativa_c = EXCLUDED.alternativa_c, alternativa_d = EXCLUDED.alternativa_d,
             gabarito = EXCLUDED.gabarito, area_direito = EXCLUDED.area_direito,
             materia = EXCLUDED.materia, dificuldade = EXCLUDED.dificuldade
           RETURNING (xmax = 0) AS is_insert`,
          [
            q.id || null, q.banca || null, q.edicao || null,
            q.ano ? parseInt(q.ano) : null, q.numero_questao ? parseInt(q.numero_questao) : null,
            q.enunciado, q.alternativa_a || null, q.alternativa_b || null,
            q.alternativa_c || null, q.alternativa_d || null,
            q.gabarito || null, q.area_direito || null,
            q.materia || null, q.dificuldade || null,
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
          gabarito, area_direito, banca, edicao, ano, materia, dificuldade } = req.body;

  if (!enunciado?.trim()) {
    return res.status(400).json({ error: 'Enunciado é obrigatório' });
  }

  try {
    const result = await pool.query(
      `UPDATE questions SET
         enunciado=$1, alternativa_a=$2, alternativa_b=$3, alternativa_c=$4, alternativa_d=$5,
         gabarito=$6, area_direito=$7, banca=$8, edicao=$9, ano=$10, materia=$11, dificuldade=$12
       WHERE id=$13 RETURNING *`,
      [enunciado, alternativa_a||null, alternativa_b||null, alternativa_c||null, alternativa_d||null,
       gabarito||null, area_direito||null, banca||null, edicao||null,
       ano ? parseInt(ano) : null, materia||null, dificuldade||null, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Questão não encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /admin/questions error:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar questão' });
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
