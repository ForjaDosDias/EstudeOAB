# Frontend — Contexto de desenvolvimento

## Stack
React via CDN (sem bundler, sem npm). Arquivos `.jsx` servidos diretamente pelo browser via Babel standalone. Cada arquivo exporta para `window.*`.

**Não há build step.** Editar o arquivo = recarregar o browser.

## Arquivos e exports

| Arquivo | Exporta para `window` | Conteúdo |
|---|---|---|
| `data.js` | `window.AppData = { AREAS }`, `window.apiFetch` | Config de áreas + helper de API |
| `auth.jsx` | `window.AuthFlow = { SplashScreen, RegisterFlow }` | Telas de login/cadastro |
| `shell.jsx` | `window.Shell = { AppShell, Dashboard }` | Layout principal + dashboard |
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
window.AppData.AREAS = {
  civil, const, penal, trabalho, adm, etica, trib
  // cada área: { id, label, icon, pillClass }
}
```

`pillClass` mapeia para classes CSS como `area-pill-civil` — usar sempre esse campo nos chips de área.

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
