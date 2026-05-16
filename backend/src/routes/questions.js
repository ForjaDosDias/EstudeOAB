const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const pool = require('../db');

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

// GET /api/questions/stats
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)                                      AS total,
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

// POST /api/questions/upload
router.post('/upload', upload.single('csv'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo CSV enviado' });
  }

  let records;
  try {
    const content = req.file.buffer.toString('utf-8').replace(/^﻿/, ''); // strip BOM
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      try {
        if (!row.enunciado || row.enunciado.trim() === '') {
          skipped++;
          continue;
        }

        const result = await client.query(
          `INSERT INTO questions (
            external_id, banca, prova, edicao, ano, data_aplicacao, tipo_prova,
            numero_questao, enunciado, comando, alternativa_a, alternativa_b,
            alternativa_c, alternativa_d, gabarito, area_direito, materia,
            tema, subtema, legislacao_ref, dificuldade, observacoes
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
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
            tema           = EXCLUDED.tema,
            subtema        = EXCLUDED.subtema,
            legislacao_ref = EXCLUDED.legislacao_ref,
            dificuldade    = EXCLUDED.dificuldade,
            observacoes    = EXCLUDED.observacoes
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
            row.tema           || null,
            row.subtema        || null,
            row.legislacao_ref || null,
            row.dificuldade    || null,
            row.observacoes    || null,
          ]
        );

        if (result.rows[0]?.is_insert) inserted++;
        else updated++;
      } catch (rowErr) {
        errors.push({ linha: i + 2, erro: rowErr.message });
        skipped++;
      }
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      total: records.length,
      inserted,
      updated,
      skipped,
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

module.exports = router;
