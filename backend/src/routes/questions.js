const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const pool = require('../db');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const { userIsPremium } = require('../middleware/plan');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(csv|txt)$/i)) {
      return cb(new Error('Apenas arquivos CSV são aceitos'));
    }
    cb(null, true);
  },
});

// GET /api/questions
router.get('/', async (req, res) => {
  try {
    const { area, dificuldade, banca, edicao, limit = 50, offset = 0 } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (area)        { conditions.push(`area_direito ILIKE $${idx++}`); params.push(area); }
    if (dificuldade) { conditions.push(`dificuldade   ILIKE $${idx++}`); params.push(dificuldade); }
    if (banca)       { conditions.push(`banca         ILIKE $${idx++}`); params.push(banca); }
    if (edicao)      { conditions.push(`edicao        ILIKE $${idx++}`); params.push(edicao); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM questions ${where}`,
      params
    );

    const dataRes = await pool.query(
      `SELECT * FROM questions ${where} ORDER BY id LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      questions: dataRes.rows,
      total: parseInt(countRes.rows[0].count),
    });
  } catch (err) {
    console.error('GET /questions error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar questões' });
  }
});

// GET /api/questions/sortear?areas=civil,const&total=10&trilha=essencial-1a-fase  (#11)
router.get('/sortear', requireAuth, async (req, res) => {
  const total = Math.min(parseInt(req.query.total) || 10, 80);
  let areas = req.query.areas ? req.query.areas.split(',').map(a => a.trim()) : [];

  try {
    // Filtro por trilha (recurso Premium): restringe o sorteio às áreas da trilha
    if (req.query.trilha) {
      if (!(await userIsPremium(req.user.userId))) {
        return res.status(403).json({
          code: 'PREMIUM_REQUIRED',
          error: 'Filtro por trilha disponível apenas no plano Premium',
        });
      }
      const trilhaRes = await pool.query('SELECT areas FROM trilhas WHERE slug = $1', [
        req.query.trilha,
      ]);
      if (!trilhaRes.rows[0]) return res.status(404).json({ error: 'Trilha não encontrada' });
      areas = trilhaRes.rows[0].areas;
    }

    const areaFilter = areas.length > 0 ? 'AND area_direito = ANY($2)' : '';
    const params = areas.length > 0 ? [total, areas] : [total];

    const result = await pool.query(
      `SELECT id, enunciado, comando, alternativa_a, alternativa_b,
              alternativa_c, alternativa_d, area_direito, banca, edicao, dificuldade
       FROM questions
       WHERE enunciado IS NOT NULL ${areaFilter}
       ORDER BY RANDOM()
       LIMIT $1`,
      params
    );
    res.json({ questoes: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('GET /questions/sortear error:', err.message);
    res.status(500).json({ error: 'Erro ao sortear questões' });
  }
});

// GET /api/questions/stats
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)                                      AS total,
        COUNT(*) FILTER (WHERE explicacao IS NOT NULL) AS com_explicacao,
        COUNT(DISTINCT banca)                         AS bancas,
        COUNT(DISTINCT area_direito)                  AS areas,
        COUNT(DISTINCT edicao)                        AS edicoes,
        jsonb_agg(DISTINCT banca)     FILTER (WHERE banca IS NOT NULL)       AS lista_bancas,
        jsonb_agg(DISTINCT area_direito) FILTER (WHERE area_direito IS NOT NULL) AS lista_areas,
        jsonb_agg(DISTINCT edicao)    FILTER (WHERE edicao IS NOT NULL)      AS lista_edicoes
      FROM questions
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /questions/stats error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// POST /api/questions/upload  (apenas admins)
router.post('/upload', requireAdmin, upload.single('csv'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo CSV enviado' });
  }

  let records;
  try {
    const content = req.file.buffer.toString('utf-8').replace(/^﻿/, ''); // strip BOM
    const firstLine = content.split('\n')[0] || '';
    console.log(`[upload-csv] arquivo: ${req.file.originalname} (${req.file.size} bytes)`);
    console.log(`[upload-csv] primeira linha: ${firstLine.slice(0, 200)}`);
    records = parse(content, {
      delimiter: ';',
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (parseErr) {
    return res.status(400).json({ error: `Erro ao ler CSV: ${parseErr.message}` });
  }

  if (records.length === 0) {
    return res.status(400).json({ error: 'CSV vazio ou sem dados válidos' });
  }

  const colunasDetectadas = Object.keys(records[0]);
  console.log(`[upload-csv] ${records.length} linhas · colunas: ${colunasDetectadas.join(', ')}`);
  console.log(`[upload-csv] primeira linha parsed: enunciado="${records[0].enunciado?.slice(0,80)}" gabarito="${records[0].gabarito}"`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let anuladas = 0;
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];

      if (!row.enunciado || row.enunciado.trim() === '') {
        skipped++;
        continue;
      }

      if (row.gabarito && row.gabarito.trim().toUpperCase() === 'ANULADA') {
        anuladas++;
        continue;
      }

      await client.query('SAVEPOINT row_sp');
        let result;
        try {
          result = await client.query(
            `INSERT INTO questions (
              external_id, banca, prova, edicao, ano, data_aplicacao, tipo_prova,
              numero_questao, enunciado, comando, alternativa_a, alternativa_b,
              alternativa_c, alternativa_d, gabarito, area_direito, materia,
              tema_importado, subtema_importado, legislacao_ref, dificuldade, observacoes, explicacao
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
            ON CONFLICT (external_id) DO UPDATE SET
              banca          = EXCLUDED.banca,
              prova          = EXCLUDED.prova,
              edicao         = EXCLUDED.edicao,
              ano            = EXCLUDED.ano,
              data_aplicacao = EXCLUDED.data_aplicacao,
              tipo_prova     = EXCLUDED.tipo_prova,
              numero_questao = EXCLUDED.numero_questao,
              enunciado      = EXCLUDED.enunciado,
              comando        = EXCLUDED.comando,
              alternativa_a  = EXCLUDED.alternativa_a,
              alternativa_b  = EXCLUDED.alternativa_b,
              alternativa_c  = EXCLUDED.alternativa_c,
              alternativa_d  = EXCLUDED.alternativa_d,
              gabarito       = EXCLUDED.gabarito,
              area_direito   = EXCLUDED.area_direito,
              materia        = EXCLUDED.materia,
              tema_importado    = EXCLUDED.tema_importado,
              subtema_importado = EXCLUDED.subtema_importado,
              legislacao_ref = EXCLUDED.legislacao_ref,
              dificuldade    = EXCLUDED.dificuldade,
              observacoes    = EXCLUDED.observacoes,
              explicacao     = EXCLUDED.explicacao
            RETURNING (xmax = 0) AS is_insert`,
            [
              row.id         || null,
              row.banca      || null,
              row.prova      || null,
              row.edicao     || null,
              row.ano        ? parseInt(row.ano) : null,
              row.data_aplicacao || null,
              row.tipo_prova || null,
              row.numero_questao ? parseInt(row.numero_questao) : null,
              row.enunciado,
              row.comando        || null,
              row.alternativa_a  || null,
              row.alternativa_b  || null,
              row.alternativa_c  || null,
              row.alternativa_d  || null,
              row.gabarito       || null,
              row.area_direito   || null,
              row.materia        || null,
              // `row.*` são colunas do CSV, não do banco: o cabeçalho da
              // planilha continua "tema"/"subtema". As colunas ganharam o
              // sufixo `_importado` em 08/08/2026 para não se confundirem com
              // `subtema_id`, que aponta para o catálogo curado.
              row.tema           || null,
              row.subtema        || null,
              row.legislacao_ref || null,
              row.dificuldade    || null,
              row.observacoes    || null,
              row.explicacao     || null,
            ]
          );
          await client.query('RELEASE SAVEPOINT row_sp');
        } catch (insertErr) {
          await client.query('ROLLBACK TO SAVEPOINT row_sp');
          console.error(`[upload-csv] linha ${i + 2} erro: ${insertErr.message}`);
          errors.push({ linha: i + 2, erro: insertErr.message });
          skipped++;
          continue;
        }

      if (result.rows[0]?.is_insert) inserted++;
      else updated++;
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      total: records.length,
      inserted,
      updated,
      skipped,
      anuladas,
      colunas_detectadas: colunasDetectadas,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Upload transaction error:', err.message);
    res.status(500).json({ error: `Erro ao salvar questões: ${err.message}` });
  } finally {
    client.release();
  }
});

// GET /api/questions/:id  — deve ficar após as rotas com paths fixos (/sortear, /stats, /upload)
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM questions WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Questão não encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /questions/:id error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar questão' });
  }
});

module.exports = router;
