const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * Métricas de produto para o painel do admin.
 *
 * Tudo agregado no SQL: nenhuma linha individual sai daqui. O painel responde
 * "quantos" e "onde travam", nunca "o que o fulano respondeu" — não há por que
 * expor resposta de aluno para montar gráfico.
 *
 * O funil tem duas metades com origens diferentes, e a distinção importa na
 * hora de ler:
 *  - as 4 primeiras etapas vêm de `eventos`, que só existe desde 08/08/2026 e
 *    é a única fonte do que acontece ANTES da conta;
 *  - as 4 últimas vêm de `users` / `answers`, que são o registro real do que
 *    aconteceu — e valem para o histórico inteiro, inclusive de antes dos eventos.
 * Comparar as duas metades em datas anteriores a 08/08/2026 dá queda falsa.
 */

const DIAS_PADRAO = 30;
const DIAS_MAX = 365;

// GET /api/admin/metricas?dias=30
router.get('/', requireAdmin, async (req, res) => {
  // Valor negativo ou zero cai no padrão, não no piso: `Math.max(-5, 1)` daria
  // 1 dia, e um painel quase vazio faria o admin concluir que o produto morreu.
  const pedido = parseInt(req.query.dias, 10);
  const dias = Number.isInteger(pedido) && pedido > 0 ? Math.min(pedido, DIAS_MAX) : DIAS_PADRAO;

  try {
    const [funilEventos, funilContas, porDia, conteudo, retencao, origem] = await Promise.all([
      // ── Antes da conta: quantas PESSOAS distintas chegaram a cada tela ─────
      // count(DISTINCT anon_id) e não count(*): a mesma pessoa vendo a tela 1
      // três vezes é uma pessoa, não três.
      pool.query(
        `SELECT nome, count(DISTINCT anon_id)::int AS pessoas
           FROM eventos
          WHERE criado_em > NOW() - ($1 || ' days')::interval
          GROUP BY nome`,
        [dias]
      ),

      // ── Depois da conta: o registro real, que não depende de evento ────────
      pool.query(
        `SELECT
           count(*)::int                                              AS contas,
           count(*) FILTER (WHERE email_verified)::int                AS verificaram_email,
           count(*) FILTER (WHERE id IN (SELECT user_id FROM answers))::int AS responderam_questao,
           count(*) FILTER (WHERE streak_max > 0)::int                AS bateram_meta_1x
         FROM users
        WHERE created_at > NOW() - ($1 || ' days')::interval`,
        [dias]
      ),

      // ── Uso por dia ────────────────────────────────────────────────────────
      pool.query(
        `WITH d AS (
           SELECT generate_series(
             (NOW() - ($1 || ' days')::interval)::date, NOW()::date, '1 day'
           )::date AS dia
         )
         SELECT d.dia,
                (SELECT count(*)::int FROM users u   WHERE u.created_at::date = d.dia)     AS contas,
                (SELECT count(*)::int FROM answers a WHERE a.respondida_em::date = d.dia) AS respostas,
                (SELECT count(*)::int FROM sessions s WHERE s.iniciada_em::date = d.dia)    AS sessoes,
                (SELECT count(*)::int FROM sessions s WHERE s.iniciada_em::date = d.dia AND s.concluida) AS sessoes_ok
           FROM d ORDER BY d.dia`,
        [dias]
      ),

      // ── Onde o aluno erra ──────────────────────────────────────────────────
      // HAVING >= 5: com menos que isso o percentual é ruído e induz a
      // conclusão errada sobre a matéria.
      pool.query(
        `SELECT q.area_direito AS materia,
                st.nome        AS subtema,
                count(*)::int  AS respostas,
                round(100.0 * count(*) FILTER (WHERE a.acertou) / count(*))::int AS pct_acerto
           FROM answers a
           JOIN questions q  ON q.id = a.question_id
           LEFT JOIN subtemas st ON st.id = q.subtema_id
          WHERE a.respondida_em > NOW() - ($1 || ' days')::interval
          GROUP BY q.area_direito, st.nome
         HAVING count(*) >= 5
          ORDER BY pct_acerto ASC
          LIMIT 15`,
        [dias]
      ),

      // ── Retenção: voltou no dia seguinte? na semana seguinte? ──────────────
      // A coorte exclui quem se cadastrou ontem: ainda não teve chance de
      // voltar, e contá-lo como "não voltou" derruba o número sem motivo.
      pool.query(
        `WITH coorte AS (
           SELECT id, created_at::date AS dia FROM users
            WHERE created_at > NOW() - ($1 || ' days')::interval
              AND created_at < NOW() - interval '1 day'
         )
         SELECT count(*)::int AS coorte,
                count(*) FILTER (WHERE EXISTS (
                  SELECT 1 FROM answers a WHERE a.user_id = c.id
                   AND a.respondida_em::date = c.dia + 1))::int AS voltou_d1,
                count(*) FILTER (WHERE EXISTS (
                  SELECT 1 FROM answers a WHERE a.user_id = c.id
                   AND a.respondida_em::date BETWEEN c.dia + 1 AND c.dia + 7))::int AS voltou_d7
           FROM coorte c`,
        [dias]
      ),

      // ── De onde veio ───────────────────────────────────────────────────────
      pool.query(
        `SELECT COALESCE(utm->>'source', 'direto') AS origem,
                count(DISTINCT anon_id)::int       AS pessoas,
                count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int AS viraram_conta
           FROM eventos
          WHERE criado_em > NOW() - ($1 || ' days')::interval
          GROUP BY 1 ORDER BY pessoas DESC LIMIT 10`,
        [dias]
      ),
    ]);

    const ev = Object.fromEntries(funilEventos.rows.map((r) => [r.nome, r.pessoas]));
    const c = funilContas.rows[0];

    res.json({
      dias,
      funil: [
        { etapa: 'Abriu o onboarding', pessoas: ev.onboarding_visto || 0, fonte: 'evento' },
        { etapa: 'Escolheu as matérias', pessoas: ev.foco_escolhido || 0, fonte: 'evento' },
        { etapa: 'Viu a trilha montada', pessoas: ev.trilha_vista || 0, fonte: 'evento' },
        { etapa: 'Abriu o cadastro', pessoas: ev.conta_iniciada || 0, fonte: 'evento' },
        { etapa: 'Criou conta', pessoas: c.contas, fonte: 'banco' },
        { etapa: 'Verificou o e-mail', pessoas: c.verificaram_email, fonte: 'banco' },
        { etapa: 'Respondeu 1 questão', pessoas: c.responderam_questao, fonte: 'banco' },
        { etapa: 'Bateu a meta 1 vez', pessoas: c.bateram_meta_1x, fonte: 'banco' },
      ],
      por_dia: porDia.rows,
      conteudo: conteudo.rows,
      retencao: retencao.rows[0],
      origem: origem.rows,
    });
  } catch (err) {
    console.error('GET /admin/metricas error:', err.message);
    res.status(500).json({ error: 'Erro ao montar as métricas' });
  }
});

module.exports = router;
