CREATE TABLE IF NOT EXISTS questions (
  id             SERIAL PRIMARY KEY,
  external_id    VARCHAR(100) UNIQUE,
  banca          VARCHAR(100),
  prova          VARCHAR(200),
  edicao         VARCHAR(100),
  ano            INTEGER,
  data_aplicacao DATE,
  tipo_prova     VARCHAR(100),
  numero_questao INTEGER,
  enunciado      TEXT NOT NULL,
  comando        TEXT,
  alternativa_a  TEXT,
  alternativa_b  TEXT,
  alternativa_c  TEXT,
  alternativa_d  TEXT,
  gabarito       VARCHAR(1),
  area_direito   VARCHAR(100),
  materia        VARCHAR(200),
  tema           VARCHAR(200),
  subtema        VARCHAR(200),
  legislacao_ref TEXT,
  dificuldade    VARCHAR(50),
  observacoes    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_area       ON questions(area_direito);
CREATE INDEX IF NOT EXISTS idx_questions_banca      ON questions(banca);
CREATE INDEX IF NOT EXISTS idx_questions_dificuldade ON questions(dificuldade);
CREATE INDEX IF NOT EXISTS idx_questions_edicao     ON questions(edicao);
CREATE INDEX IF NOT EXISTS idx_questions_ano        ON questions(ano);
