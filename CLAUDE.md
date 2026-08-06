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

- **Toda alteração requer um commit descritivo.** Use mensagens no formato:
  ```
  tipo: resumo curto do que foi feito

  Contexto adicional se necessário (por quê, não o quê).
  ```
  Tipos: `feat`, `fix`, `test`, `refactor`, `chore`, `docs`.

- Exemplos válidos:
  - `feat: adiciona rota de progresso do usuário`
  - `fix: corrige validação de email no registro`
  - `test: cobre upload de CSV com linhas inválidas`

## Fluxo de trabalho e Git

> Regra da frota — idêntica nos 5 projetos da VPS. Atualizada em 2026-08-06.

**Todo trabalho começa por um plano.** Levantar o que já existe, decidir a abordagem e só então
implementar.

**Rodar os testes antes de qualquer push — sem exceção:**
```bash
docker exec estudeoab-backend-1 npm test
```

**Ao final de todo plano, sincronizar tudo:**
```bash
git add -A && git commit -m "tipo: descrição"
git push origin main        # push direto — é o fluxo atual
git push origin main:dev    # mantém a dev alinhada
```

⚠️ **Commitar ANTES de qualquer push.** Este diretório é o alvo do deploy: todo push na `main`
dispara o workflow, que faz `git reset --hard FETCH_HEAD` aqui. Qualquer alteração não commitada
é **destruída** — aconteceu em 06/08/2026 com uma edição de CLAUDE.md.

**Por que push direto na `main`:** nenhuma aplicação da VPS tem cliente hoje, e o gate de aprovação
humana do fluxo `feature → dev → main` só atrasa o desenvolvimento. Os `bypass_actors` de admin nos
rulesets são **intencionais**, não descuido.

**A `dev` é mantida em dia de propósito.** Ela não está em uso, mas fica idêntica à `main` para que
o fluxo com PR volte sem migração no dia em que houver cliente.

**Quando houver cliente:** remover os bypasses dos rulesets e voltar para `feature → dev → main` com
PR, check `test` verde e 1 aprovação humana. A esteira já está montada — só o bypass precisa sair.

Push na `main` dispara o deploy automático na VPS (self-hosted runner).

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
