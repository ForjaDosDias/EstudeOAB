# Backend — Contexto de desenvolvimento

## Stack
- Node.js + Express, PostgreSQL via `pg` (pool de 10 conexões, `DATABASE_URL`)
- Auth: JWT (7 dias, `JWT_SECRET` env var) com bcrypt (12 rounds)
- IA: DeepSeek via Anthropic SDK (`DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL=deepseek-chat`, baseURL `https://api.deepseek.com/anthropic`)
- Testes: Jest + Supertest, banco mockado via `jest.mock('../db')`

## Mapa de rotas

```
POST   /api/auth/register          — cria conta; retorna { token, user }
POST   /api/auth/login             — retorna { token, user }
GET    /api/auth/me                — valida token, retorna usuário atualizado  [requireAuth]
PATCH  /api/auth/profile           — atualiza nome/email/senha                [requireAuth]

GET    /api/questions              — lista com filtros (area, dificuldade, banca, edicao, limit, offset)
GET    /api/questions/sortear      — sorteia N questões aleatórias             [requireAuth]
GET    /api/questions/stats        — total, bancas, áreas, edições no banco
POST   /api/questions/upload       — import CSV (delimitador `;`)              [requireAdmin]

POST   /api/sessions               — cria sessão + sorteia questões            [requireAuth]
PATCH  /api/sessions/:id/concluir  — fecha sessão, calcula XP e streak         [requireAuth]

POST   /api/answers                — registra resposta, retorna acertou+explicação [requireAuth]
GET    /api/answers/history        — histórico com filtros (area, resultado)   [requireAuth]

GET    /api/stats/overview         — métricas gerais do usuário               [requireAuth]
GET    /api/stats/areas            — % acerto por área de direito             [requireAuth]
GET    /api/stats/last-7-days      — sparkline dos últimos 7 dias (array[7])  [requireAuth]
GET    /api/stats/study-plan/next  — próxima sessão recomendada               [requireAuth]

POST   /api/admin/import-pdf       — inicia job async de importação via IA    [requireAdmin]
GET    /api/admin/import-status/:id — polling do job (processing|done|error)  [requireAdmin]
POST   /api/admin/bulk-save        — salva questões revisadas pelo admin       [requireAdmin]
PUT    /api/admin/questions/:id    — edita questão                            [requireAdmin]
POST   /api/admin/questions/:id/explicacao — gera explicação via DeepSeek     [requireAdmin]
DELETE /api/admin/questions/:id    — remove questão                           [requireAdmin]

GET    /api/health                 — { ok, db }
```

## Tabelas principais (PostgreSQL)

**users**: `id, email, password_hash, nome, role (user|admin), edicao, minutos_dia, area_segunda_fase, data_prova, xp, streak, ultima_atividade`

**questions**: `id, external_id (UNIQUE), banca, prova, edicao, ano, numero_questao, enunciado, comando, alternativa_a/b/c/d, gabarito (A-D), area_direito, materia, tema, subtema, legislacao_ref, dificuldade (baixa|media|alta), explicacao, observacoes`

**sessions**: `id, user_id, modo (rapida|simulado|personalizado), areas[], total_questoes, acertos, tempo_total_s, xp_ganho, concluida, concluida_em`

**answers**: `id, user_id, session_id, question_id, escolhida, correta, acertou, tempo_s, respondida_em` — UNIQUE(session_id, question_id)

## Padrões importantes

**Middleware**: `requireAuth` injeta `req.user = { userId, email, role }`. `requireAdmin` chama `requireAuth` antes de verificar `role === 'admin'`.

**publicUser()**: shape do usuário retornado ao frontend — nunca expõe `password_hash`. Campos: `id, email, nome, role, edicao, minutosDia, area_segunda_fase, dataProva, xp, streak`.

**XP por sessão**: 15 pts por acerto + 30 pts bônus se 100% de acerto.

**Streak**: incrementa se `ultima_atividade === ontem`; mantém se `=== hoje`; reseta para 1 caso contrário.

**Meta diária**: `Math.round(minutos_dia / 2)` questões.

**Áreas válidas**: `civil, const, penal, trabalho, adm, etica, trib`

## Import PDF (admin.js)

Job assíncrono em `Map<jobId, {status, questoes, erro}>` — sem banco, sem Redis.

Fluxo: upload → parse PDF (pdf-parse) → gabarito parseado deterministicamente (`parseGabarito`) → 4 chamadas DeepSeek (Q1-20, Q21-40, Q41-60, Q61-80) com o caderno completo em cada — `max_tokens: 14000` (Q1-20 chegou a 9.3k tokens).

`extrairQuestoes()` tem 3 níveis de fallback: parse completo → recuperação por último `},` → extração objeto-a-objeto. Se lote retornar 0 questões, há retry automático com prompt mais restritivo.

## Como rodar testes

```bash
docker exec estudeoab-backend-1 npm test
docker exec estudeoab-backend-1 npm run test:coverage
```

Estrutura: `tests/setup.js` (env vars) + `tests/middleware/auth.test.js` + `tests/routes/*.test.js`.
