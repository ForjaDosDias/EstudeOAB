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

GET    /api/payments/config       — public key MP + preço do Premium          [requireAuth]
POST   /api/payments/pix          — cria pagamento Pix, retorna QR code       [requireAuth]
POST   /api/payments/card         — paga com cartão (token do SDK MP)         [requireAuth]
GET    /api/payments/:id/status   — polling do status (fluxo Pix)             [requireAuth]
POST   /api/payments/webhook      — notificações do Mercado Pago (sem auth)

GET    /api/coins                 — saldo + histórico de moedas               [requireAuth]
GET    /api/ads/config            — config de anúncios (Free: AdSense 30s)    [requireAuth]

GET    /api/trilhas/preview       — disciplinas + temas por incidência (SEM auth — tela do onboarding)
GET    /api/trilhas               — lista trilhas de estudo                   [requireAuth]
GET    /api/trilhas/:slug/questoes — sorteia questões da trilha               [requireAuth]
GET    /api/trilhas/:slug/mapa    — matéria → subtemas + progresso            [requireAuth]
GET    /api/trilhas/:slug/subtema/:id/questoes — questões; 423 se travado      [requireAuth]

POST   /api/events               — evento de produto (SEM auth — funil pré-cadastro)
GET    /api/admin/metricas        — funil, uso, retenção, origem, acerto     [requireAdmin]

GET    /api/health                 — { ok, db }
```

## Freemium

- `users.plan` (`free` | `premium`) + `users.premium_until` (NULL = vitalício). `isPremium()` em `src/middleware/plan.js`; admins sempre passam.
- **Premium**: stats (`/api/stats/*` inteiro tem `requirePremium`), filtro `?trilha=` no sortear, tema escuro (frontend), sem anúncios.
- **Trilha saiu do Premium em 06/08/2026** — a única trava passou a ser o progresso do aluno.
- **Free**: prática liberada, com anúncios (`/api/ads/config`).
- Pagamento aprovado → +30 dias de premium (`activatePremium` em `routes/payments.js`, idempotente via `payments.ativado_em`).

## Moedas (`src/services/coins.service.js`)

`coin_transactions` com UNIQUE(user_id, tipo, referencia) = idempotência. Regras: login diário +5, a cada 5 questões/dia +10, compra +100, comentário +2 (máx 3/dia). Saldo em `users.coins`.

## Tabelas principais (PostgreSQL)

**users**: `id, email, password_hash, nome, role (user|admin), edicao, minutos_dia, area_segunda_fase, data_prova, xp, streak, ultima_atividade`

**questions**: `id, external_id (UNIQUE), banca, prova, edicao, ano, numero_questao, enunciado, comando, alternativa_a/b/c/d, gabarito (A-D), area_direito, materia, tema_importado, subtema_importado, subtema_id → subtemas(id), legislacao_ref, dificuldade (baixa|media|alta), explicacao, observacoes`

**sessions**: `id, user_id, modo (rapida|simulado|personalizado), areas[], total_questoes, acertos, tempo_total_s, xp_ganho, concluida, concluida_em`

**answers**: `id, user_id, session_id, question_id, escolhida, correta, acertou, tempo_s, respondida_em` — UNIQUE(session_id, question_id)

## Padrões importantes

**Middleware**: `requireAuth` injeta `req.user = { userId, email, role }`. `requireAdmin` chama `requireAuth` antes de verificar `role === 'admin'`.

**publicUser()**: shape do usuário retornado ao frontend — nunca expõe `password_hash`. Campos: `id, email, nome, role, edicao, minutosDia, area_segunda_fase, dataProva, xp, streak`.

**XP por sessão**: 15 pts por acerto + 30 pts bônus se 100% de acerto.

**Streak**: incrementa se `ultima_atividade === ontem`; mantém se `=== hoje`; reseta para 1 caso contrário.

**Meta diária**: `Math.round(minutos_dia / 2)` questões.

**Áreas válidas** (`questions.area_direito`, 13 valores reais no banco):
`etica, const, civil, proc civil, penal, proc penal, trabalho, proc trab, adm,
trib e proc trib, empresarial, human, outros`

⚠️ Não é `trib` — o valor real é `trib e proc trib`. O seed das trilhas usava
`trib` e por isso a Trilha Publicista prometia Tributário e devolvia zero
questões dessa matéria (corrigido em 06/08/2026).

## Métricas de produto (08/08/2026)

**`eventos`**: `id, anon_id (UUID do navegador), user_id (NULL antes da conta), nome, props JSONB, utm JSONB, criado_em`

`POST /api/events` é **público de propósito**: o evento mais valioso do funil —
"abriu o site e desistiu no onboarding" — acontece antes de existir conta. Pôr
`requireAuth` ali faz o funil voltar a começar no cadastro **sem quebrar nada**,
que é o pior tipo de regressão. Três travas seguram o endpoint: allowlist de
nomes (`EVENTOS` em `routes/events.js`), teto de 2 KB em `props` e rate limit de
40/min por `anon_id`.

`anon_id` fica no `localStorage` e continua sendo enviado **depois** do cadastro
— é ele que costura "abriu o site" a "criou conta".

O funil do painel tem duas metades: as 4 primeiras etapas vêm de `eventos` (só
existem desde 08/08/2026), as 4 últimas de `users`/`answers` (valem para todo o
histórico). Período anterior a essa data mostra as primeiras zeradas — é
ausência de medição, não queda.

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

## Trilha por incidência (06/08/2026) · por disciplina (08/08/2026)

A trilha progride por **incidência**, não por dificuldade: alta (≥1,5
questões/prova) → média (1,0–1,49) → pontual. Um tema só abre quando os de
incidência maior da mesma disciplina fecham; faixa em que ela não tem tema é
pulada e nunca bloqueia.

**A apresentação virou por disciplina em 08/08/2026.** `montarMapa()` continua
calculando faixa → disciplina → temas (é ali que mora a trava), e
`agruparPorDisciplina()` vira isso do avesso para a resposta da API. A
progressão não mudou — só quem é a seção de primeiro nível, porque o aluno
pensa "quero estudar Penal", não "quero estudar a faixa alta".

### Foco de disciplinas (08/08/2026)

`users.areas_foco TEXT[]` substituiu `users.areas_excluidas` (que fica no banco
como coluna legada, sem leitor). A pergunta do onboarding inverteu: era "escolha
até 2 que você NÃO quer", virou "escolha o que você QUER focar", sem teto.

⚠️ **`areas_foco = '{}'` significa TODAS, não "nenhuma".** É o que grava o botão
"quero estudar todas as matérias" e o default de quem nunca passou pelo
onboarding. Ler como lista de inclusão literal deixa a trilha vazia para todo
mundo.

- **`slug = 'minha'`** é a trilha do próprio aluno, montada com `areas_foco`.
  Não existe na tabela `trilhas` — `resolverTrilha()` resolve o slug.
- O foco **não** recorta as trilhas do catálogo: quem abre a Civilista pediu
  Civil explicitamente, e cruzar as duas listas devolveria trilha vazia.
- As disciplinas válidas saem de `SELECT DISTINCT disciplina FROM temas`, nunca
  de uma lista no código — foi uma lista chumbada (`trib` em vez de
  `trib e proc trib`) que fez a Publicista prometer Tributário e devolver zero.

- Catálogo em `subtemas` (79 registros) + `questions.subtema_id`. As colunas
  `questions.tema_importado` / `subtema_importado` são texto livre do CSV, com
  ~236 valores distintos para 238 questões — não agrupam nada e a trilha não as usa.
- Classificação: `scripts/classificar-subtemas.js` (DeepSeek). 235/238 classificadas;
  o resto fica `subtema_id NULL` para revisão humana e não aparece no mapa.
- A trava é recalculada no servidor em `/subtema/:id/questoes` → **423
  CHECKPOINT_LOCKED**. O front nunca é a única barreira.

### Vocabulário — dois níveis, nunca três (08/08/2026)

| Nível | Banco | Interface |
|---|---|---|
| de cima | `questions.area_direito` (13) · `subtemas.disciplina` | **matéria** |
| de baixo | tabela `subtemas` (79) · `questions.subtema_id` | **subtema** |

A tabela se chamava `temas` e a interface dizia "tema" para o nível de baixo —
quem escolhia "Constitucional" lia "4 temas" e entendia ter escolhido quatro
coisas. Migração em `database/migrations/2026-08-08-temas-viram-subtemas.sql`.
No código o campo é `disciplina` e não `materia` porque `questions.materia` já
existe como texto livre do CSV; são o mesmo conceito, não dois.
