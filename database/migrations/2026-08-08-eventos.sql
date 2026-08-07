-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela de eventos (2026-08-08)
--
-- POR QUÊ: `answers` já registra tudo que o aluno faz DEPOIS de ter conta, mas
-- o onboarding roda antes de a conta existir. Quem abre o site, vê a tela 1 e
-- desiste não deixava rastro nenhum — justamente o trecho onde a maioria cai
-- numa divulgação por rede social.
--
-- `anon_id` é a peça central: gerado no navegador na primeira visita e enviado
-- em TODO evento, inclusive depois do cadastro. É o que costura "abriu o site"
-- a "criou conta"; sem ele o funil continua começando tarde demais.
--
-- Rodar UMA vez em banco existente. Bancos novos já nascem com ela.
--   docker exec -i estudeoab-db-1 psql -U estudeoab -d estudeoab \
--     < database/migrations/2026-08-08-eventos.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eventos (
  id        BIGSERIAL PRIMARY KEY,
  anon_id   UUID NOT NULL,                                   -- do navegador, atravessa o cadastro
  user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL antes da conta existir
  nome      VARCHAR(60) NOT NULL,                            -- allowlist no backend
  props     JSONB DEFAULT '{}',
  utm       JSONB DEFAULT '{}',                              -- origem da 1ª visita
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- O painel sempre pergunta "quantos X nos últimos N dias".
CREATE INDEX IF NOT EXISTS idx_eventos_nome_data ON eventos(nome, criado_em DESC);
-- E o funil precisa juntar todos os eventos de uma mesma pessoa anônima.
CREATE INDEX IF NOT EXISTS idx_eventos_anon      ON eventos(anon_id);
CREATE INDEX IF NOT EXISTS idx_eventos_user      ON eventos(user_id) WHERE user_id IS NOT NULL;
