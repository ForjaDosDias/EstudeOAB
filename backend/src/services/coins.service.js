const pool = require('../db');

// Quantidade de moedas por ação. A referência garante idempotência:
// a mesma ação (user_id, tipo, referencia) nunca credita duas vezes.
const COIN_RULES = {
  login_diario:   5,   // referencia: data (YYYY-MM-DD)
  cinco_questoes: 10,  // referencia: data:bloco (a cada 5 questões respondidas no dia)
  compra:         100, // referencia: payment:<mp_payment_id>
  comentario:     2,   // referencia: comment:<id>
  streak_marco:   0,   // valor real vem de STREAK_MARCOS; ver awardStreakMilestone
};

const MAX_COMENTARIOS_DIA = 3; // anti-spam: só os 3 primeiros comentários do dia geram moedas

// Marcos de streak e o que cada um paga.
// Calibragem: o login diário já dá 35 moedas numa semana, então o marco de 7
// dias precisa valer mais que isso para o esforço extra compensar.
const STREAK_MARCOS = {
  3:  15,
  7:  40,
  14: 80,
  30: 200,
};

// Credita moedas de forma idempotente. Retorna a quantidade creditada (0 se já creditado).
async function award(userId, tipo, referencia) {
  const quantidade = COIN_RULES[tipo];
  if (!quantidade) throw new Error(`Tipo de moeda desconhecido: ${tipo}`);

  const inserted = await pool.query(
    `INSERT INTO coin_transactions (user_id, tipo, quantidade, referencia)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, tipo, referencia) DO NOTHING
     RETURNING id`,
    [userId, tipo, quantidade, referencia]
  );
  if (!inserted.rows[0]) return 0;

  await pool.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [quantidade, userId]);
  return quantidade;
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

// Login diário — credita uma vez por dia
async function awardDailyLogin(userId) {
  return award(userId, 'login_diario', hoje());
}

// A cada 5 questões respondidas no dia credita um bloco
async function awardQuestionBlock(userId) {
  const dia = hoje();
  const res = await pool.query(
    `SELECT COUNT(*)::int AS total FROM answers
     WHERE user_id = $1 AND respondida_em::date = CURRENT_DATE`,
    [userId]
  );
  const total = res.rows[0]?.total || 0;
  if (total === 0 || total % 5 !== 0) return 0;
  return award(userId, 'cinco_questoes', `${dia}:${total / 5}`);
}

// Compra aprovada
async function awardPurchase(userId, mpPaymentId) {
  return award(userId, 'compra', `payment:${mpPaymentId}`);
}

// Comentário em questão — limitado por dia
async function awardComment(userId, commentId) {
  const res = await pool.query(
    `SELECT COUNT(*)::int AS total FROM coin_transactions
     WHERE user_id = $1 AND tipo = 'comentario' AND criado_em::date = CURRENT_DATE`,
    [userId]
  );
  if ((res.rows[0]?.total || 0) >= MAX_COMENTARIOS_DIA) return 0;
  return award(userId, 'comentario', `comment:${commentId}`);
}

/**
 * Credita o marco de streak, se o número atingido for um marco.
 *
 * A referência é `streak:<marco>` — idempotente **por marco, não por dia**.
 * Efeito colateral desejado: quem chega a 7 dias, quebra e chega a 7 de novo
 * não recebe duas vezes. O prêmio é por alcançar o marco, não por repeti-lo.
 */
async function awardStreakMilestone(userId, streak) {
  const quantidade = STREAK_MARCOS[streak];
  if (!quantidade) return 0;

  const inserted = await pool.query(
    `INSERT INTO coin_transactions (user_id, tipo, quantidade, referencia)
     VALUES ($1, 'streak_marco', $2, $3)
     ON CONFLICT (user_id, tipo, referencia) DO NOTHING
     RETURNING id`,
    [userId, quantidade, `streak:${streak}`]
  );
  if (!inserted.rows[0]) return 0;

  await pool.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [quantidade, userId]);
  return quantidade;
}

// Próximo marco acima do streak atual (para a UI mostrar o alvo)
function proximoMarco(streak) {
  const alvo = Object.keys(STREAK_MARCOS)
    .map(Number)
    .sort((a, b) => a - b)
    .find((m) => m > streak);
  return alvo ? { dias: alvo, moedas: STREAK_MARCOS[alvo] } : null;
}

module.exports = {
  COIN_RULES,
  MAX_COMENTARIOS_DIA,
  STREAK_MARCOS,
  award,
  awardDailyLogin,
  awardQuestionBlock,
  awardPurchase,
  awardComment,
  awardStreakMilestone,
  proximoMarco,
};
