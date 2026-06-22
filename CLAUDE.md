# EstudeOAB — Regras de desenvolvimento

## Testes

- **Todo código novo deve ter testes.** Ao adicionar uma rota, middleware ou função de negócio, escreva os testes correspondentes em `backend/tests/`.
- **Nenhuma alteração pode quebrar testes existentes.** Antes de considerar qualquer tarefa concluída, rode a suite completa:
  ```
  docker exec estudeoab-backend-1 npm test
  ```
- Os testes rodam com Jest + Supertest e mocam o banco. Para rodar com cobertura:
  ```
  docker exec estudeoab-backend-1 npm run test:coverage
  ```

## Commits

- **Toda alteração requer um commit descritivo numa branch `feature/*` (nunca direto na `main`).** Use mensagens no formato:
  ```
  tipo: resumo curto do que foi feito

  Contexto adicional se necessário (por quê, não o quê).
  ```
  Tipos: `feat`, `fix`, `test`, `refactor`, `chore`, `docs`.

- Exemplos válidos:
  - `feat: adiciona rota de progresso do usuário`
  - `fix: corrige validação de email no registro`
  - `test: cobre upload de CSV com linhas inválidas`

## Push e integração

Fluxo da esteira CI/CD: **`feature/*` → `dev` → `main`** (a `main` é protegida; não há push direto).

- Rode os testes localmente antes de cada push — nenhum push com teste falhando:
  ```bash
  docker exec estudeoab-backend-1 npm test
  ```
- Trabalhe sempre a partir de `dev` e abra PR para `dev`:
  ```bash
  git checkout -b feature/minha-mudanca dev
  git push -u origin feature/minha-mudanca
  gh pr create --base dev        # auto-merge quando o check `test` passar
  ```
- **Release:** PR `dev` → `main` exige guard (origem = `dev`) + 1 aprovação humana e dispara o
  deploy automático na VPS (self-hosted runner). Nunca dar push direto na `main` (bloqueado pelo ruleset).

## Issues e rastreamento

- **Após qualquer push ou pull, verificar as issues abertas no GitHub:**
  ```bash
  gh issue list --repo ForjaDosDias/EstudeOAB --state open --label "priority: P0" && \
  gh issue list --repo ForjaDosDias/EstudeOAB --state open --label "priority: P1"
  ```
- Ao começar a trabalhar em uma issue, referenciá-la no commit: `feat: descrição (#N)`.
- Ao concluir uma issue, fechá-la com: `gh issue close N --repo ForjaDosDias/EstudeOAB`.
- Respeitar a ordem de prioridade: P0 antes de P1, P1 antes de P2.
- Issues P0 têm dependências — ver o campo "Depende de" antes de começar.

## Estrutura dos testes

```
backend/
  tests/
    setup.js                  # variáveis de ambiente para Jest
    middleware/
      auth.test.js
    routes/
      auth.test.js
      questions.test.js
```

Cada novo arquivo de rota em `src/routes/` deve ter um arquivo `.test.js` correspondente em `tests/routes/`.
