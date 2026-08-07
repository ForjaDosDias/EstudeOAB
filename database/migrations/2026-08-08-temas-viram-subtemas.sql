-- ─────────────────────────────────────────────────────────────────────────────
-- `temas` vira `subtemas` (2026-08-08)
--
-- POR QUÊ: a aplicação tem dois níveis e os dois se chamavam "tema" em algum
-- lugar. O de cima é a MATÉRIA (as 13 de `questions.area_direito`) — é o que o
-- aluno escolhe no onboarding. O de baixo são os 79 registros deste catálogo,
-- que são as unidades de estudo dentro de cada matéria.
--
-- A confusão apareceu na interface antes de aparecer no banco: quem escolhia
-- "Constitucional" lia "4 temas" e entendia que tinha escolhido quatro coisas.
-- Renomear só o texto da tela deixaria a armadilha montada para a próxima
-- pessoa que abrisse o schema.
--
-- COLISÃO RESOLVIDA JUNTO: `questions` já tinha `tema` e `subtema` como texto
-- livre vindo do CSV de importação (~236 valores distintos para 238 questões —
-- é um rótulo por questão, não agrupa nada). Ficariam ao lado de `subtema_id`
-- sugerindo uma relação que não existe: `subtema_id` aponta para o catálogo
-- curado, `subtema` é o que a planilha trouxe. O sufixo `_importado` diz de
-- onde cada um veio. Os dados não são descartados — só renomeados.
--
-- Rodar UMA vez em banco existente. Bancos novos já nascem certos pelo
-- schema.sql. Aplicar ANTES de subir o código novo:
--   docker exec -i estudeoab-db-1 psql -U estudeoab -d estudeoab \
--     < database/migrations/2026-08-08-temas-viram-subtemas.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE temas RENAME TO subtemas;

-- Postgres não renomeia sequence, PK e unique junto com a tabela: sem isto,
-- `\d subtemas` continuaria mostrando `temas_pkey` e ninguém entenderia por quê.
ALTER SEQUENCE temas_id_seq       RENAME TO subtemas_id_seq;
ALTER INDEX    temas_pkey         RENAME TO subtemas_pkey;
ALTER INDEX    temas_slug_key     RENAME TO subtemas_slug_key;

ALTER TABLE questions RENAME COLUMN tema_id TO subtema_id;
ALTER INDEX idx_questions_tema RENAME TO idx_questions_subtema;
ALTER TABLE questions RENAME CONSTRAINT questions_tema_id_fkey TO questions_subtema_id_fkey;

-- Texto livre do CSV: preservado, com a origem no nome.
ALTER TABLE questions RENAME COLUMN tema    TO tema_importado;
ALTER TABLE questions RENAME COLUMN subtema TO subtema_importado;

COMMIT;
