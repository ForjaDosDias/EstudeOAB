CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nome          VARCHAR(255),
  role          VARCHAR(20)  NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
  edicao        VARCHAR(20)  DEFAULT 'XLI',
  minutos_dia   INTEGER      DEFAULT 30,
  areas         TEXT[]       DEFAULT ARRAY['civil','const','etica'],
  xp            INTEGER      DEFAULT 0,
  streak        INTEGER      DEFAULT 0,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

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

CREATE INDEX IF NOT EXISTS idx_questions_area        ON questions(area_direito);
CREATE INDEX IF NOT EXISTS idx_questions_banca       ON questions(banca);
CREATE INDEX IF NOT EXISTS idx_questions_dificuldade ON questions(dificuldade);
CREATE INDEX IF NOT EXISTS idx_questions_edicao      ON questions(edicao);
CREATE INDEX IF NOT EXISTS idx_questions_ano         ON questions(ano);

-- ── Sessões de estudo ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  modo           VARCHAR(20) NOT NULL,  -- 'rapida' | 'simulado' | 'personalizado'
  areas          TEXT[],
  total_questoes INTEGER NOT NULL,
  acertos        INTEGER     DEFAULT 0,
  tempo_total_s  INTEGER     DEFAULT 0,
  xp_ganho       INTEGER     DEFAULT 0,
  concluida      BOOLEAN     DEFAULT FALSE,
  iniciada_em    TIMESTAMPTZ DEFAULT NOW(),
  concluida_em   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, iniciada_em DESC);

-- ── Respostas individuais ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS answers (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id    INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  question_id   INTEGER NOT NULL REFERENCES questions(id),
  escolhida     VARCHAR(1)  NOT NULL,
  correta       VARCHAR(1)  NOT NULL,
  acertou       BOOLEAN     NOT NULL,
  tempo_s       INTEGER     NOT NULL,
  respondida_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_answers_user    ON answers(user_id, respondida_em DESC);
CREATE INDEX IF NOT EXISTS idx_answers_session ON answers(session_id);

-- ── Questões salvas para revisão ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reviews (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  criado_em   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

-- ── Colunas adicionais em users ────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS ultima_atividade  DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS area_segunda_fase VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS data_prova        DATE;

ALTER TABLE questions ADD COLUMN IF NOT EXISTS explicacao TEXT;

-- ── Colunas adicionais em questions ───────────────────────────────────────────

ALTER TABLE questions ADD COLUMN IF NOT EXISTS corrigido_por_humano BOOLEAN DEFAULT FALSE;

-- ── Reports de usuários sobre questões ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reports (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  comentario  TEXT NOT NULL,
  status      VARCHAR(20) DEFAULT 'pending',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE(user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_status      ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_question    ON reports(question_id);

-- ── Histórico de edições dos reports ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS report_edits (
  id         SERIAL PRIMARY KEY,
  report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  comentario TEXT NOT NULL,
  editado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_edits_report ON report_edits(report_id);

-- ── Notificações in-app ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo       VARCHAR(50) NOT NULL,
  titulo     TEXT NOT NULL,
  mensagem   TEXT NOT NULL,
  lida       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, lida);
