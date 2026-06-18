const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const mp = require('../services/mercadopago.service');
const coins = require('../services/coins.service');

const router = express.Router();

const PREMIUM_DIAS = 30;

// Libera o premium para o usuário e marca o pagamento como ativado.
// Idempotente: só ativa se o pagamento ainda não tiver ativado_em.
async function activatePremium(paymentRowId) {
  const result = await pool.query(
    `UPDATE payments SET ativado_em = NOW(), atualizado_em = NOW()
     WHERE id = $1 AND status = 'approved' AND ativado_em IS NULL
     RETURNING user_id, mp_payment_id`,
    [paymentRowId]
  );
  const row = result.rows[0];
  if (!row) return false;

  await pool.query(
    `UPDATE users SET
       plan = 'premium',
       premium_until = GREATEST(COALESCE(premium_until, NOW()), NOW()) + ($2 || ' days')::interval
     WHERE id = $1`,
    [row.user_id, PREMIUM_DIAS]
  );
  await coins.awardPurchase(row.user_id, row.mp_payment_id).catch((err) =>
    console.error('award purchase coins error:', err.message)
  );
  return true;
}

// Atualiza o status local a partir do Mercado Pago e ativa premium se aprovado.
async function syncPaymentStatus(mpPaymentId) {
  const mpPayment = await mp.getPayment(mpPaymentId);
  const result = await pool.query(
    `UPDATE payments SET status = $1, atualizado_em = NOW()
     WHERE mp_payment_id = $2
     RETURNING id, status`,
    [mpPayment.status, String(mpPaymentId)]
  );
  const row = result.rows[0];
  if (row && row.status === 'approved') await activatePremium(row.id);
  return row;
}

// GET /api/payments/config — dados públicos para o checkout no frontend
router.get('/config', requireAuth, (req, res) => {
  res.json({
    publicKey: process.env.MP_PUBLIC_KEY || null,
    valorCentavos: mp.PREMIUM_PRICE_CENTAVOS,
    plano: 'premium_mensal',
    dias: PREMIUM_DIAS,
  });
});

// POST /api/payments/pix — cria pagamento Pix e retorna QR code
router.post('/pix', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const mpPayment = await mp.createPixPayment({
      email: req.user.email,
      externalReference: `user:${userId}`,
    });

    const inserted = await pool.query(
      `INSERT INTO payments (user_id, mp_payment_id, metodo, valor_centavos, status)
       VALUES ($1, $2, 'pix', $3, $4)
       RETURNING id`,
      [userId, String(mpPayment.id), mp.PREMIUM_PRICE_CENTAVOS, mpPayment.status]
    );

    const tx = mpPayment.point_of_interaction?.transaction_data || {};
    res.status(201).json({
      paymentId: inserted.rows[0].id,
      mpPaymentId: String(mpPayment.id),
      status: mpPayment.status,
      valorCentavos: mp.PREMIUM_PRICE_CENTAVOS,
      qrCode: tx.qr_code || null,
      qrCodeBase64: tx.qr_code_base64 || null,
      expiraEm: mpPayment.date_of_expiration || null,
    });
  } catch (err) {
    console.error('POST /payments/pix error:', err.message);
    res.status(502).json({ error: 'Erro ao criar pagamento Pix' });
  }
});

// POST /api/payments/card — paga com cartão (token gerado pelo SDK no frontend)
router.post('/card', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { token, paymentMethodId, issuerId, installments } = req.body;

  if (!token || !paymentMethodId) {
    return res.status(400).json({ error: 'token e paymentMethodId são obrigatórios' });
  }

  try {
    const mpPayment = await mp.createCardPayment({
      email: req.user.email,
      token,
      paymentMethodId,
      issuerId,
      installments: parseInt(installments) || 1,
      externalReference: `user:${userId}`,
    });

    const inserted = await pool.query(
      `INSERT INTO payments (user_id, mp_payment_id, metodo, valor_centavos, status)
       VALUES ($1, $2, 'cartao', $3, $4)
       RETURNING id`,
      [userId, String(mpPayment.id), mp.PREMIUM_PRICE_CENTAVOS, mpPayment.status]
    );

    if (mpPayment.status === 'approved') {
      await activatePremium(inserted.rows[0].id);
    }

    res.status(201).json({
      paymentId: inserted.rows[0].id,
      mpPaymentId: String(mpPayment.id),
      status: mpPayment.status,
      statusDetail: mpPayment.status_detail || null,
      valorCentavos: mp.PREMIUM_PRICE_CENTAVOS,
    });
  } catch (err) {
    console.error('POST /payments/card error:', err.message);
    res.status(502).json({ error: 'Erro ao processar pagamento com cartão' });
  }
});

// GET /api/payments/:id/status — polling (usado pelo fluxo Pix)
router.get('/:id/status', requireAuth, async (req, res) => {
  const paymentId = parseInt(req.params.id);
  if (!paymentId) return res.status(400).json({ error: 'id inválido' });

  try {
    const result = await pool.query(
      'SELECT id, user_id, mp_payment_id, status, ativado_em FROM payments WHERE id = $1',
      [paymentId]
    );
    const payment = result.rows[0];
    if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });
    if (payment.user_id !== req.user.userId) return res.status(403).json({ error: 'Acesso negado' });

    // Pendente: consulta o Mercado Pago para pegar o status mais recente
    if (payment.status !== 'approved' && payment.mp_payment_id) {
      const synced = await syncPaymentStatus(payment.mp_payment_id).catch((err) => {
        console.error('sync payment error:', err.message);
        return null;
      });
      if (synced) payment.status = synced.status;
    } else if (payment.status === 'approved' && !payment.ativado_em) {
      await activatePremium(payment.id);
    }

    res.json({ paymentId: payment.id, status: payment.status });
  } catch (err) {
    console.error('GET /payments/:id/status error:', err.message);
    res.status(500).json({ error: 'Erro ao consultar pagamento' });
  }
});

// POST /api/payments/webhook — notificações do Mercado Pago (sem auth: chamado pelo MP)
router.post('/webhook', async (req, res) => {
  // Responde 200 sempre — o MP reenvia em caso de erro e não deve receber 4xx/5xx por dados que não tratamos
  res.status(200).json({ received: true });

  const mpPaymentId = req.body?.data?.id;
  const type = req.body?.type || req.body?.topic;
  // 'order'/'orders_v2': notificações da Orders API; 'payment' mantido por compatibilidade
  if (!['payment', 'order', 'orders_v2'].includes(type) || !mpPaymentId) return;

  try {
    await syncPaymentStatus(mpPaymentId);
  } catch (err) {
    console.error('webhook sync error:', err.message);
  }
});

module.exports = router;
