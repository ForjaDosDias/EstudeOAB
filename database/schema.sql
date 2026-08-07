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
  tema_importado    VARCHAR(200),   -- texto livre do CSV: rótulo por questão, não agrupa
  subtema_importado VARCHAR(200),   -- idem. O catálogo curado é a tabela `subtemas`
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo de SUBTEMAS (2026-08-06 · renomeado de `temas` em 2026-08-08)
--
-- Dois níveis, e só estes dois:
--   MATÉRIA  = questions.area_direito, 13 valores. É o que o aluno escolhe.
--   SUBTEMA  = esta tabela, 79 registros. É a unidade de estudo dentro da matéria.
--
-- Chamava-se `temas` e colidia com a matéria na cabeça de quem lia: escolher
-- "Constitucional" e ver "4 temas" sugere ter escolhido quatro coisas.
--
-- `questions.tema_importado` é texto livre do CSV, ~236 valores distintos para
-- 238 questões — um rótulo por questão, que não agrupa nada. Fica intacto pelo
-- histórico; a trilha por incidência usa este catálogo fechado.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subtemas (
  id         SERIAL PRIMARY KEY,
  slug       VARCHAR(160) UNIQUE NOT NULL,
  nome       VARCHAR(200) NOT NULL,
  disciplina VARCHAR(100) NOT NULL,   -- espelha questions.area_direito
  ativo      BOOLEAN DEFAULT TRUE
);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS subtema_id INTEGER REFERENCES subtemas(id);
CREATE INDEX IF NOT EXISTS idx_questions_subtema ON questions(subtema_id);
INSERT INTO subtemas (slug, nome, disciplina) VALUES
  ('penal-crimes-contra-a-pessoa', 'Crimes contra a pessoa', 'penal'),
  ('const-organizacao-do-estado-federacao', 'Organização do Estado / Federação', 'const'),
  ('const-direito-internacional-privado', 'Direito Internacional Privado', 'const'),
  ('const-direito-eleitoral', 'Direito eleitoral', 'const'),
  ('trabalho-rescisao-e-verbas-rescisorias', 'Rescisão e verbas rescisórias', 'trabalho'),
  ('outros-filosofia-e-teoria-geral-do-direito', 'Filosofia e teoria geral do direito', 'outros'),
  ('trib-e-proc-trib-especies-tributarias', 'Espécies tributárias', 'trib e proc trib'),
  ('adm-pad-e-servidores', 'PAD e servidores', 'adm'),
  ('proc-civil-proc-civil-execucao-e-cumprimento', 'Proc. Civil — execução e cumprimento', 'proc civil'),
  ('outros-cdc-responsabilidade-do-fornecedor', 'CDC — responsabilidade do fornecedor', 'outros'),
  ('penal-crimes-contra-o-patrimonio', 'Crimes contra o patrimônio', 'penal'),
  ('trabalho-previdencia-social-rgps', 'Previdência social — RGPS', 'trabalho'),
  ('trib-e-proc-trib-credito-tributario-lancamento-e-extincao', 'Crédito tributário — lançamento e extinção', 'trib e proc trib'),
  ('adm-ato-administrativo', 'Ato administrativo', 'adm'),
  ('adm-licitacao-e-contratos', 'Licitação e contratos', 'adm'),
  ('proc-civil-proc-civil-competencia-e-juizados', 'Proc. Civil — competência e Juizados', 'proc civil'),
  ('civil-sucessoes', 'Sucessões', 'civil'),
  ('human-direitos-humanos-povos-indigenas-e-minorias', 'Direitos Humanos — povos indígenas e minorias', 'human'),
  ('human-direitos-humanos-tratados-e-incorporacao', 'Direitos Humanos — tratados e incorporação', 'human'),
  ('empresarial-tipos-societarios', 'Tipos societários', 'empresarial'),
  ('proc-penal-proc-penal-prisao-e-cautelares', 'Proc. Penal — prisão e cautelares', 'proc penal'),
  ('proc-penal-proc-penal-provas', 'Proc. Penal — provas', 'proc penal'),
  ('trabalho-jornada-e-horas-extras', 'Jornada e horas extras', 'trabalho'),
  ('proc-trab-proc-trabalho-execucao', 'Proc. Trabalho — execução', 'proc trab'),
  ('etica-sigilo-profissional', 'Sigilo profissional', 'etica'),
  ('outros-licenciamento-ambiental', 'Licenciamento ambiental', 'outros'),
  ('civil-contratos', 'Contratos', 'civil'),
  ('civil-direitos-reais', 'Direitos reais', 'civil'),
  ('civil-familia', 'Família', 'civil'),
  ('proc-civil-proc-civil-procedimentos-especiais', 'Proc. Civil — procedimentos especiais', 'proc civil'),
  ('civil-responsabilidade-civil-e-obrigacoes', 'Responsabilidade civil e obrigações', 'civil'),
  ('outros-eca-ato-infracional', 'ECA — ato infracional', 'outros'),
  ('outros-eca-familia-e-protecao', 'ECA — família e proteção', 'outros'),
  ('const-controle-externo-tcu', 'Controle externo / TCU', 'const'),
  ('empresarial-empresario-e-mei', 'Empresário e MEI', 'empresarial'),
  ('trabalho-contratos-especiais-de-trabalho', 'Contratos especiais de trabalho', 'trabalho'),
  ('proc-trab-proc-trabalho-competencia', 'Proc. Trabalho — competência', 'proc trab'),
  ('proc-trab-proc-trabalho-instrucao-e-provas', 'Proc. Trabalho — instrução e provas', 'proc trab'),
  ('trib-e-proc-trib-lrf-limites-de-gasto-e-responsabilidade-fiscal', 'LRF — limites de gasto e responsabilidade fiscal', 'trib e proc trib'),
  ('trib-e-proc-trib-orcamento-publico-loa-e-ldo', 'Orçamento público — LOA e LDO', 'trib e proc trib'),
  ('trib-e-proc-trib-principios-tributarios-anterioridade-e-legalidade', 'Princípios tributários — anterioridade e legalidade', 'trib e proc trib'),
  ('etica-deveres-e-vedacoes-do-advogado', 'Deveres e vedações do advogado', 'etica'),
  ('etica-estagio-e-inscricao-na-oab', 'Estágio e inscrição na OAB', 'etica'),
  ('etica-honorarios-advocaticios', 'Honorários advocatícios', 'etica'),
  ('etica-incompatibilidades-e-impedimentos', 'Incompatibilidades e impedimentos', 'etica'),
  ('etica-prerrogativas-do-advogado', 'Prerrogativas do advogado', 'etica'),
  ('etica-processo-disciplinar-oab', 'Processo disciplinar OAB', 'etica'),
  ('etica-publicidade-e-captacao-de-clientela', 'Publicidade e captação de clientela', 'etica'),
  ('adm-improbidade-administrativa', 'Improbidade administrativa', 'adm'),
  ('outros-areas-protegidas-e-instrumentos', 'Áreas protegidas e instrumentos', 'outros'),
  ('outros-lgpd-protecao-de-dados', 'LGPD — proteção de dados', 'outros'),
  ('const-controle-de-constitucionalidade', 'Controle de constitucionalidade', 'const'),
  ('const-direitos-fundamentais-aplicacao-e-restricoes', 'Direitos fundamentais — aplicação e restrições', 'const'),
  ('empresarial-falencia-e-recuperacao-judicial', 'Falência e recuperação judicial', 'empresarial'),
  ('empresarial-titulos-de-credito-e-garantias', 'Títulos de crédito e garantias', 'empresarial'),
  ('proc-penal-proc-penal-acao-penal', 'Proc. Penal — ação penal', 'proc penal'),
  ('proc-penal-proc-penal-recursos-penais', 'Proc. Penal — recursos penais', 'proc penal'),
  ('trabalho-empregado-domestico', 'Empregado doméstico', 'trabalho'),
  ('proc-trab-proc-trabalho-sentenca', 'Proc. Trabalho — sentença', 'proc trab'),
  ('trib-e-proc-trib-competencia-tributaria-e-imunidades', 'Competência tributária e imunidades', 'trib e proc trib'),
  ('proc-civil-proc-civil-honorarios', 'Proc. Civil — honorários', 'proc civil'),
  ('proc-civil-proc-civil-recursos', 'Proc. Civil — recursos', 'proc civil'),
  ('proc-civil-proc-civil-tutela-provisoria', 'Proc. Civil — tutela provisória', 'proc civil'),
  ('outros-superendividamento-lei-14-181', 'Superendividamento — Lei 14.181', 'outros'),
  ('penal-aplicacao-da-lei-penal', 'Aplicação da lei penal', 'penal'),
  ('penal-concurso-de-pessoas', 'Concurso de pessoas', 'penal'),
  ('penal-crimes-contra-a-honra-e-outros', 'Crimes contra a honra e outros', 'penal'),
  ('penal-execucao-penal-progressao-de-regime', 'Execução penal — progressão de regime', 'penal'),
  ('proc-penal-proc-penal-tribunal-do-juri', 'Proc. Penal — Tribunal do Júri', 'proc penal'),
  ('proc-trab-proc-trabalho-recursos', 'Proc. Trabalho — recursos', 'proc trab'),
  ('trabalho-remuneracao-e-salario', 'Remuneração e salário', 'trabalho'),
  ('adm-intervencao-e-desapropriacao', 'Intervenção e desapropriação', 'adm'),
  ('outros-responsabilidade-e-dano-ambiental', 'Responsabilidade e dano ambiental', 'outros'),
  ('civil-negocios-juridicos-e-vicios', 'Negócios jurídicos e vícios', 'civil'),
  ('proc-civil-proc-civil-acao-civil-publica', 'Proc. Civil — ação civil pública', 'proc civil'),
  ('empresarial-propriedade-industrial', 'Propriedade industrial', 'empresarial'),
  ('penal-lei-de-drogas', 'Lei de drogas', 'penal'),
  ('trabalho-estabilidade-e-garantias', 'Estabilidade e garantias', 'trabalho'),
  ('proc-trab-proc-trabalho-dissidio-coletivo', 'Proc. Trabalho — dissídio coletivo', 'proc trab')
ON CONFLICT (slug) DO NOTHING;

-- Correção das áreas das trilhas (2026-08-06)
-- O seed original usava 'trib', que não existe em questions.area_direito (o valor
-- real é 'trib e proc trib'), e omitia os ramos processuais — a Trilha Publicista
-- prometia Tributário e devolvia zero questões dessa matéria.
UPDATE trilhas SET areas = ARRAY['penal','proc penal']                          WHERE slug = 'penalista';
UPDATE trilhas SET areas = ARRAY['civil','proc civil']                          WHERE slug = 'civilista';
UPDATE trilhas SET areas = ARRAY['trabalho','proc trab']                        WHERE slug = 'trabalhista';
UPDATE trilhas SET areas = ARRAY['const','adm','trib e proc trib']              WHERE slug = 'publicista';
UPDATE trilhas SET areas = ARRAY['etica','civil','proc civil','const']          WHERE slug = 'essencial-1a-fase';

-- ─────────────────────────────────────────────────────────────────────────────
-- Onboarding em 3 telas + streak por meta diária (2026-08-07)
--
-- `areas` (legado) é lista de INCLUSÃO e não é usada pela trilha; fica intacta.
-- A exclusão era o conceito: o aluno escolhia até 2 disciplinas que não queria
-- estudar. ⚠️ SUPERADO em 2026-08-08 pelo bloco de `areas_foco` no fim deste
-- arquivo — a pergunta inverteu para "o que você quer focar".
--
-- `meta_questoes_dia` substitui a conversão escondida `minutos_dia / 2` como
-- fonte da meta. `minutos_dia` continua existindo porque
-- /api/stats/study-plan/next ainda o usa.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS areas_excluidas   TEXT[]  DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS meta_questoes_dia INTEGER DEFAULT 10;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_max        INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_em     TIMESTAMPTZ;

-- Quem já tem streak pela regra antiga mantém o número; o recorde parte dele.
UPDATE users SET streak_max = GREATEST(COALESCE(streak_max, 0), COALESCE(streak, 0));

-- ─────────────────────────────────────────────────────────────────────────────
-- Foco de disciplinas: a exclusão virou inclusão (2026-08-08)
--
-- O onboarding parou de perguntar "o que você NÃO quer estudar" (até 2) e passou
-- a perguntar "o que você QUER focar" (mínimo 1, máximo tudo). A trilha é montada
-- SÓ com o que está aqui.
--
-- `areas_foco = '{}'` significa TODAS as disciplinas — é o estado de quem clicou
-- em "quero estudar todas" e o default de quem nunca passou pelo onboarding.
-- Guardar as 13 strings explicitamente seria pior: disciplina nova entraria no
-- banco e ficaria invisível para todo mundo que já tem conta.
--
-- `areas_excluidas` fica como coluna LEGADA — ninguém mais lê dela depois desta
-- data. Não é dropada porque é a origem do backfill abaixo e a única forma de
-- refazer a conversão se ela estiver errada.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS areas_foco TEXT[] DEFAULT '{}';

-- Preserva a escolha de quem já tinha exclusões: foco = disciplinas ativas − excluídas.
UPDATE users u
   SET areas_foco = ARRAY(
         SELECT DISTINCT t.disciplina
           FROM subtemas t
          WHERE t.ativo AND NOT (t.disciplina = ANY(u.areas_excluidas)))
 WHERE COALESCE(array_length(u.areas_excluidas, 1), 0) > 0
   AND COALESCE(array_length(u.areas_foco, 1), 0) = 0;
