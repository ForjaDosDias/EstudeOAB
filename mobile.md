# App Android — levantamento e plano (engavetado)

> **Status: engavetado em 07/08/2026.** Levantamento feito, decisões fechadas, nada implementado.
> O trabalho seguiu no site. Este documento existe para não precisar refazer a análise.
>
> **Revisado no mesmo dia**, depois da instalação das skills oficiais da Expo: três afirmações da
> primeira versão estavam erradas e foram corrigidas — estão marcadas com *(corrigido)* abaixo.

## Decisões fechadas (07/08/2026)

| Tema | Decisão |
|---|---|
| Monetização | **App v1 não vende nada.** Premium continua só no site |
| Stack | **React Native + Expo**, com EAS Build |
| Escopo v1 | **Prática + trilha + streak.** Admin, moderação e stats ficam no site |
| Push | **Objetivo central**, entra desde a v1 |

### Por que "não vende nada" na v1

As lojas exigem o sistema de pagamento delas para conteúdo digital consumido dentro do app — a
comissão fica entre **15% e 30%** conforme o faturamento e o programa em que a conta se enquadra. O
EstudeOAB vende Premium por Mercado Pago; fazer isso dentro do APK é motivo de reprovação. A skill
`expo-web-to-native` é explícita sobre isso: pagamento **não é uma troca de biblioteca, é uma
bifurcação de modelo de negócio**, e a decisão tem que ser tomada no começo, não na revisão da loja.

Como ainda não há cliente pagante para proteger, o caminho barato é a v1 entrar sem venda nenhuma.

---

## As três perguntas que originaram este documento

### 1. Qual a melhor stack?

**React Native + Expo.**

*(corrigido)* Na primeira versão eu escrevi que **a interface precisaria ser reescrita**. Isso está
errado como afirmação absoluta. A Expo tem **DOM components** (`'use dom'`): o app nativo roda a
interface web existente dentro de um webview embutido **desde o primeiro dia**, e depois cada tela é
convertida para nativo por ordem de valor — o padrão *strangler fig*. Ou seja, dá para ter APK
instalável antes de reescrever qualquer tela.

O custo disso, que a própria skill deixa claro: **cada tela em DOM carrega ~2 MB de runtime web**.
Serve de ponte, não de destino — as telas quentes (prática e trilha) devem virar nativas de verdade.

Alternativas descartadas:
- **Capacitor** — cobriria o mesmo caso de uso do DOM component, mas sem caminho de saída: nunca
  vira nativo. E embrulharia um front que compila JSX em tempo de execução via Babel standalone.
- **TWA / PWA na loja** — o site dentro de uma casca, sujeito à regra de "funcionalidade mínima".

Para as telas nativizadas, a recomendação da Expo é **`@expo/ui` primeiro** (renderiza SwiftUI e
Jetpack Compose de verdade), com componentes RN só para layout customizado. O princípio que vale
citar: *"nativizar é redesenhar, não repaginar — se ainda parece um site, você portou em vez de
redesenhar"*.

### 2. Tem plugin ou skill que acelere?

*(corrigido)* Eu disse que **não existia**. Estava errado — existem **23 skills oficiais da Expo**,
instaladas em 07/08/2026 e disponíveis globalmente em `/home/victor/.agents/skills/`. As que
importam para este projeto:

| Skill | Para quê |
|---|---|
| `expo-web-to-native` | O roteiro de migração de app React web para nativo. É a espinha do trabalho |
| `expo-dom` | O mecanismo de DOM component que permite embarcar a UI atual |
| `expo-router` | Navegação por arquivos, NativeTabs, headers nativos |
| `expo-data-fetching` | Requisições, cache, offline — a camada que troca `localStorage` por SecureStore |
| `expo-ui` | `@expo/ui`, SwiftUI/Compose de verdade para as telas nativizadas |
| `eas-app-stores` | Build e submissão para a Play Store |
| `eas-simulator` | Simulador Android/iOS na nuvem da EAS |

Além delas, **EAS Build** compila na nuvem (sem Android Studio aqui) e **Expo Go** testa no celular
por QR code, sem gerar build a cada alteração.

### 3. O site precisa mudar para os dados sincronizarem?

**A sincronização não é o problema.** Site e app falam com a mesma API e o mesmo Postgres, e
`app.use(cors())` já está aberto. O que falta é sustentar um cliente que não controlamos — fase 0.

---

## Fase 0 — Backend: o que realmente muda no site

1. **Sessão longa.** `TOKEN_TTL = '7d'` em `backend/src/routes/auth.js:12`. Num app, ser deslogado
   toda semana mata o streak. Refresh token, ou TTL longo com revogação.

2. **Push.** Tabela `device_tokens` (`user_id`, `token`, `plataforma`, `atualizado_em`) + endpoint de
   registro. O job diário reusa o gancho `sendReengagementEmail` (já importado em `src/server.js`) e
   a consulta que `GET /api/me/streak` já faz para saber quem não bateu a meta.

3. **Fechar a API.** Hoje é `cors()` liberado e **sem rate limit nenhum**. Com o app na loja, o
   endereço da API vira conhecido — dá para raspar as 238 questões com um `for`. CORS restrito e
   `express-rate-limit` no login e no registro. **Vale fazer mesmo sem app.**

4. **AdMob no lugar do AdSense.** `backend/src/routes/ads.js` devolve `provider: 'adsense'`, que não
   roda em app. O endpoint passa a responder por plataforma.

5. **Deep links** para verificação de e-mail e reset de senha
   (`backend/src/services/email.service.js`).
   ⚠️ O default de `APP_URL` no código é `https://aprovanoab.com.br` — **sem o "do"**. Em produção o
   `.env` está correto, mas quem subir sem a variável manda link de verificação quebrado.

## Fases 1–3 — a migração, na ordem da skill

**Repositório novo `EstudeOAB-App`** — o deploy da VPS faz `git reset --hard` no repo do site, e
misturar um projeto que não é deployado ali é pedir problema.

1. **Levantamento** → `migration-progress.md`, classificando cada tela em *portar como está*,
   *nativizar agora*, *nativizar depois* ou *híbrida*.
2. **Esqueleto Expo** espelhando as rotas.
3. **Casca em DOM components** — o app inteiro rodando no celular, instalável. É o marco do dia um.
4. **Nativizar por valor** — prática e trilha primeiro, que é onde o aluno passa o tempo.
5. **Dados/auth/storage** — token sai do `localStorage` e vai para `expo-secure-store`.
6. **Publicar** — EAS Build, Play Console.

Endpoints que a v1 consome, **todos já existentes**:

| Tela | Endpoints |
|---|---|
| Onboarding | `GET /trilhas/preview` — já funciona **sem token**, exatamente o que o app precisa antes do cadastro |
| Prática | `POST /sessions` · `POST /answers` · `PATCH /sessions/:id/concluir` |
| Trilha | `GET /trilhas/:slug/mapa` · `/tema/:id/questoes` (trava de 423 recalculada no servidor) |
| Streak | `GET /me/streak` — já fora do paywall |

## Push — o motivo do app existir

`expo-notifications` + Firebase Cloud Messaging (o Android exige FCM; a conta é gratuita). Job diário
no fim da tarde: quem tem streak ativo e não bateu a meta recebe *"faltam 4 questões para manter seus
6 dias"*. Com coluna de opt-out — sem isso o app vira spam e ganha desinstalação.

## Publicação

- **Google Play Console: taxa única de US$ 25.** Definir se a conta é PF ou CNPJ — aparece público.
- **Política de privacidade é obrigatória e hoje não existe.** Sem ela o app não é aprovado.
- **Data Safety form**: declarar coleta de e-mail, nome e uso, batendo com a realidade.
- A fila de revisão leva dias e a primeira submissão costuma voltar.

## Verificação — e o limite do ambiente

*(corrigido)* Eu afirmei que **não daria para testar o app a partir da VPS**. Era pessimista demais:
existe a skill **`eas-simulator`**, que roda simulador Android/iOS **na nuvem da EAS** e é descrita
como o caminho padrão justamente para hosts Linux sem simulador local — dá para instalar o app,
tirar screenshot e navegar por ele daqui. É **serviço pago da EAS** e precisa de conta, então depende
de vocês contratarem; sem isso, a validação continua dependendo do celular de vocês pelo Expo Go.

A skill também é opinativa quanto à verificação: comparar o app rodando com o site rodando usando
`agent-browser` (web) e `argent` (simulador) — **nenhum dos dois está instalado aqui**. E o princípio
dela vale registrar: *"verifique executando, não compilando — build verde não prova nada, um webview
em branco compila perfeitamente"*.

## Perguntas em aberto

1. **Titular da conta Google Play** — PF ou CNPJ? Aparece público na ficha.
2. **Nome e ícone** — "Aprovado na OAB"? Precisa de ícone 512×512 e capturas de tela.
3. **Política de privacidade** — quem escreve? Precisa existir antes da submissão.
4. **Conta Expo da empresa**, não pessoal. E se vale pagar EAS para ter o simulador na nuvem.
5. **Faixa de teste interna antes do lançamento aberto?** Recomendado.
