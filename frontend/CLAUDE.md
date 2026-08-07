# Frontend — Contexto de desenvolvimento

## Stack
React via CDN (sem bundler, sem npm). Arquivos `.jsx` servidos diretamente pelo browser via Babel standalone. Cada arquivo exporta para `window.*`.

**Não há build step.** Editar o arquivo = recarregar o browser.

## Arquivos e exports

| Arquivo | Exporta para `window` | Conteúdo |
|---|---|---|
| `data.js` | `window.AppData = { AREAS }`, `window.apiFetch` | Config de áreas + helper de API |
| `auth.jsx` | `window.AuthFlow = { SplashScreen, RegisterFlow }` | Telas de login/cadastro |
| `onboarding.jsx` | `window.Onboarding = { OnboardingFlow }` | Onboarding em 3 telas (foco por disciplina) |
| `shell.jsx` | `window.Shell = { AppShell, Dashboard, StreakFlame, DisciplinaBolinha }` | Layout principal + dashboard |
| `trilha.jsx` | `window.Trilha = { TrilhaPage }` | Trilha por disciplina |
| `practice.jsx` | `window.Practice = { PracticeFlow }` | Fluxo de questões |
| `stats.jsx` | `window.Stats = { StatsPage }` | Estatísticas |
| `admin.jsx` | `window.Admin = { AdminPage }` | Painel admin |
| `app.jsx` | (renderiza `<App />` no `#app`) | Roteador raiz |

## Navegação (app.jsx)

Dois estados ortogonais:

- **`route`**: `loading | splash | register | app` — controla autenticação
- **`page`**: `dashboard | practice | stats | review | admin` — controla tela dentro do app

Sem React Router. Trocas de página = `setPage('dashboard')`.

`AppShell` recebe `page` + `onNavigate` e renderiza a sidebar com os itens ativos. Item `admin` só aparece se `user.role === 'admin'`.

## Fluxo de autenticação

1. `loading` → testa token salvo em `localStorage('oab_token')` via `GET /api/auth/me`
2. Token válido → `route = 'app'`
3. Token inválido/ausente → `route = 'splash'`
4. Login/register bem-sucedido → salva token no `localStorage` + `route = 'app'`

## apiFetch (data.js)

```js
window.apiFetch('/stats/overview')        // GET
window.apiFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify({...}) })
window.apiFetch('/questions/upload', { method: 'POST', body: formData }) // FormData: sem Content-Type manual
```

Lê `oab_token` do `localStorage` automaticamente. Em caso de erro HTTP, faz `Promise.reject(errorBody)`.

## Dados estáticos (data.js)

```js
window.AppData.AREAS       // 13 áreas reais + alias legado `trib`
window.AppData.DISCIPLINAS // as 13, sem o alias
window.AppData.areaInfo(id) // lookup com fallback — nunca devolve undefined
// cada área: { id, label, sigla, cor, icon, pillClass }
```

- `pillClass` mapeia para classes CSS como `area-pill-civil` — usar nos chips de área.
- `sigla` + `cor` (08/08/2026) são a identidade visual da disciplina na trilha: bolinha
  colorida com o nome dentro. **Cada disciplina tem uma cor só, em toda a aplicação** —
  é o que permite reconhecer "PENAL" de relance. Emoji não servia: `⚖️` era Civil, Penal
  e o fallback ao mesmo tempo.
- Sempre `areaInfo(id)`, nunca `AREAS[id]` direto: disciplina nova no banco tem que
  aparecer em cinza, não sumir da tela.

## Trilha e onboarding (08/08/2026)

Vocabulário: **matéria** é o nível de cima (13, `area_direito`) e **subtema** o de
baixo (79, tabela `subtemas`). Nunca "tema" — o aluno lê como a matéria inteira.

`window.Shell.DisciplinaBolinha` é o componente compartilhado entre `onboarding.jsx`
(tela 3) e `trilha.jsx`. A leitura de `window.Shell` acontece em tempo de render, então
a ordem dos `<script>` no `index.html` não importa.

O onboarding pergunta **o que o aluno quer focar** (inclusão), não o que ele quer
excluir. A tela 2 chama `/trilhas/preview` sem `foco` para descobrir as disciplinas
ordenadas por incidência e **pré-marca as 5 primeiras** — a lista não é chumbada aqui.

## CSS

- `styles.css` — design system global: variáveis CSS, reset, tipografia, botões, inputs, toasts, modais
- `screens.css` — componentes por tela: `.shell`, `.sidebar-*`, `.dash-*`, `.practice-*`, `.stat-*`, `.admin-*`

**Variáveis de cor principais**: `--bordo` (vermelho escuro primário), `--azul`, `--amarelo`, `--amarelo-dark`, `--green-dark`, `--bg-base`, `--bg-surface`, `--text-muted`, `--text-secondary`

## Padrão de hooks

Como o React é carregado globalmente (sem imports), cada arquivo aliasa os hooks para evitar conflito com outros arquivos no mesmo escopo:

```js
const { useState: useStateShell, useEffect: useEffectShell } = React;
```

Ao adicionar um novo arquivo, usar um sufixo próprio (ex: `useStatePractice`).

## Toasts (app.jsx)

```js
flashToast({ kind: 'success' | 'error' | 'xp', title: '...', body: '...' })
```

Passado via `onNavigate`/prop drilling ou chamado diretamente dentro de `App`. Desaparece em 4.2s.

## Perfil do usuário (shell.jsx)

`UserProfilePanel` — modal lateral acionado pelo clique no avatar da sidebar. Salva via `PATCH /api/auth/profile` e atualiza token + user no estado raiz via `onUserUpdate`.

## Campos do objeto `user` (vindo do backend)

`id, email, nome, role, edicao, minutosDia, area_segunda_fase, dataProva, xp, streak`
