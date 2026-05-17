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

- **Toda alteração requer um commit descritivo na branch `main`.** Use mensagens no formato:
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

- **A cada 2 commits, faça push para o remoto e garanta que todos os testes passam antes:**
  ```bash
  docker exec estudeoab-backend-1 npm test && git push
  ```
- Nunca faça push se algum teste estiver falhando.
- O push vai sempre para `origin main`.

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
