const pool = require('../db');

// Quantidade de moedas por ação. A referência garante idempotência:
// a mesma ação (user_id, tipo, referencia) nunca credita duas vezes.
const COIN_RULES = {
  login_diario:   5,   // referencia: data (YYYY-MM-DD)
  cinco_questoes: 10,  // referencia: data:bloco (a cada 5 questões respondidas no dia)
  compra:         100, // referencia: payment:<mp_payment_id>
  comentario:     2,   // referencia: comment:<id>
};

const MAX_COMENTARIOS_DIA = 3; // anti-spam: só os 3 primeiros comentários do dia geram moedas

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

module.exports = {
  COIN_RULES,
  MAX_COMENTARIOS_DIA,
  award,
  awardDailyLogin,
  awardQuestionBlock,
  awardPurchase,
  awardComment,
};
