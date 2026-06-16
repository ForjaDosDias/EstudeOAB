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

-- ── Log de edições de questões ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS question_edits (
  id          SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  admin_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  editado_em  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_edits_q ON question_edits(question_id);

-- ── Comentários de professor por questão ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS question_comments (
  id          SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  admin_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  corpo       TEXT NOT NULL,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qcomments_question ON question_comments(question_id);

-- ── Verificação de e-mail e reset de senha ────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS email_tokens (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token                UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  type                 VARCHAR(30) NOT NULL,   -- 'verify_email' | 'reset_password'
  expires_at           TIMESTAMPTZ NOT NULL,
  used_at              TIMESTAMPTZ,
  reengagement_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_user   ON email_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_tokens_lookup ON email_tokens(type, expires_at, used_at, reengagement_sent_at);

-- ── Freemium: plano do usuário ─────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS plan          VARCHAR(20) NOT NULL DEFAULT 'free';  -- 'free' | 'premium'
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins         INTEGER     NOT NULL DEFAULT 0;

-- ── Pagamentos (Mercado Pago) ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mp_payment_id  VARCHAR(64) UNIQUE,            -- id do pagamento no Mercado Pago
  metodo         VARCHAR(20) NOT NULL,          -- 'pix' | 'cartao'
  valor_centavos INTEGER NOT NULL,
  status         VARCHAR(30) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | cancelled | refunded
  plano          VARCHAR(30) NOT NULL DEFAULT 'premium_mensal',
  ativado_em     TIMESTAMPTZ,                   -- quando o premium foi liberado por este pagamento
  criado_em      TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user   ON payments(user_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- ── Sistema de moedas ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coin_transactions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo       VARCHAR(30) NOT NULL,   -- 'login_diario' | 'cinco_questoes' | 'compra' | 'comentario'
  quantidade INTEGER NOT NULL,
  referencia VARCHAR(100) NOT NULL,  -- chave de idempotência (ex: data, payment id, comment id)
  criado_em  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tipo, referencia)
);

CREATE INDEX IF NOT EXISTS idx_coin_tx_user ON coin_transactions(user_id, criado_em DESC);

-- ── Trilhas de estudo ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trilhas (
  id        SERIAL PRIMARY KEY,
  slug      VARCHAR(50) UNIQUE NOT NULL,
  nome      VARCHAR(200) NOT NULL,
  descricao TEXT,
  areas     TEXT[] NOT NULL,
  ordem     INTEGER NOT NULL DEFAULT 0
);

INSERT INTO trilhas (slug, nome, descricao, areas, ordem) VALUES
  ('essencial-1a-fase', 'Essencial 1ª Fase',     'As três áreas de maior incidência no exame.',          ARRAY['etica','civil','const'],   1),
  ('penalista',         'Trilha Penalista',      'Foco em Direito Penal e Processo Penal.',               ARRAY['penal'],                   2),
  ('civilista',         'Trilha Civilista',      'Foco em Direito Civil e Processo Civil.',               ARRAY['civil'],                   3),
  ('publicista',        'Trilha Publicista',     'Constitucional, Administrativo e Tributário.',          ARRAY['const','adm','trib'],      4),
  ('trabalhista',       'Trilha Trabalhista',    'Direito e Processo do Trabalho.',                       ARRAY['trabalho'],                5)
ON CONFLICT (slug) DO NOTHING;

-- Índice de apoio à trilha com checkpoints (mapa por área × dificuldade)
CREATE INDEX IF NOT EXISTS idx_questions_area_dif ON questions(area_direito, dificuldade);
