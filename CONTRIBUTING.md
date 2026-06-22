# Como contribuir

Este projeto roda em **produção** na VPS. O merge na `main` **dispara deploy automático**, então o
fluxo de branches é protegido. Leia antes de abrir um PR.

## Fluxo de branches

```
feature/*  →  dev  →  main (produção)
```

- **`feature/*`** — onde você trabalha. Sem regras; crie sempre a partir de `dev`.
- **`dev`** — integração. Recebe PRs de `feature/*` e **faz merge automático** assim que o check `test`
  fica verde (sem aprovação humana).
- **`main`** — produção. **Protegida**: não aceita push direto. Só recebe PR vindo de `dev` (check
  `guard`), com testes verdes e **1 aprovação de outro sócio**. O merge dispara o deploy na VPS.

## Passo a passo

### 1. Trabalhar numa feature
```bash
git checkout dev && git pull
git checkout -b feature/minha-mudanca
# ... código ...
docker exec estudeoab-backend-1 npm test    # rode os testes — nada de PR com teste vermelho
git push -u origin feature/minha-mudanca
```

### 2. Abrir PR para `dev`
```bash
gh pr create --base dev
gh pr merge --auto --squash         # funde sozinho quando o check `test` ficar verde
```
Não precisa de aprovação para entrar na `dev` — só dos testes passando.

### 3. Levar para produção (release `dev` → `main`)
```bash
gh pr create --base main --head dev --title "release: dev -> main"
gh pr merge --auto --squash
```
Este PR exige: vir de `dev` (outra origem falha no `guard`), check `test` verde e **1 aprovação humana**
(de outro sócio — quem abre o PR não pode aprovar o próprio). Ao fundir, o **deploy automático** roda na
VPS (self-hosted runner) e sobe o novo container.

## Rodar os testes localmente

```bash
# O backend roda no container; os testes usam Jest + Supertest e mocam o banco.
docker exec estudeoab-backend-1 npm test
docker exec estudeoab-backend-1 npm run test:coverage   # com cobertura
```

## Regras

- Nunca dar push direto na `main` (bloqueado pelo ruleset).
- Nenhum commit/PR com teste falhando.
- Mensagens de commit: `tipo: resumo` (`feat`, `fix`, `test`, `refactor`, `chore`, `docs`).
- Nunca commitar `.env` nem segredos.
