const crypto = require('crypto');

// Integração direta com o Mercado Pago via Orders API (/v1/orders) — Checkout
// Transparente. A API clássica /v1/payments rejeita as credenciais de teste do
// painel atual ("Unauthorized use of live credentials"); a Orders API aceita
// credenciais de teste e de produção. Pix e Cartão com liquidação D+0 — a
// liberação imediata do saldo é configurada na conta Mercado Pago (Seu negócio
// > Configurações > Prazos de liberação); a API usada aqui é compatível.
//
// As funções retornam o shape legado que as rotas consomem (id, status
// approved/pending/rejected/cancelled, QR em point_of_interaction), traduzido
// da resposta da Orders API.
const MP_BASE_URL = process.env.MP_BASE_URL || 'https://api.mercadopago.com';

const PREMIUM_PRICE_CENTAVOS = parseInt(process.env.PREMIUM_PRICE_CENTAVOS || '2990');

function accessToken() {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error('MP_ACCESS_TOKEN environment variable is required');
  return token;
}

async function mpRequest(method, path, body) {
  const res = await fetch(`${MP_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.errors?.[0]?.message || data.error || `Mercado Pago respondeu ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.mpResponse = data;
    throw err;
  }
  return data;
}

// A Orders API usa valores decimais em string ("29.90")
function valorDecimal(centavos) {
  return (centavos / 100).toFixed(2);
}

// Status da order → status legado que rotas/frontend esperam
function normalizeStatus(orderStatus) {
  if (orderStatus === 'processed') return 'approved';
  if (orderStatus === 'failed') return 'rejected';
  if (orderStatus === 'expired' || orderStatus === 'canceled' || orderStatus === 'cancelled') return 'cancelled';
  return 'pending'; // created | action_required | processing | at_terminal…
}

function toLegacyPayment(order) {
  const payment = order?.transactions?.payments?.[0] || {};
  const pm = payment.payment_method || {};
  return {
    id: order.id,
    status: normalizeStatus(order.status),
    status_detail: order.status_detail || null,
    date_of_expiration: payment.date_of_expiration || null,
    point_of_interaction: {
      transaction_data: {
        qr_code: pm.qr_code || null,
        qr_code_base64: pm.qr_code_base64 || null,
      },
    },
  };
}

async function createOrder({ email, valorCentavos, externalReference, paymentMethod }) {
  return mpRequest('POST', '/v1/orders', {
    type: 'online',
    processing_mode: 'automatic',
    external_reference: externalReference,
    total_amount: valorDecimal(valorCentavos),
    payer: { email },
    transactions: {
      payments: [{ amount: valorDecimal(valorCentavos), payment_method: paymentMethod }],
    },
  });
}

// Cria pagamento Pix — retorna QR code + copia-e-cola
async function createPixPayment({ email, valorCentavos = PREMIUM_PRICE_CENTAVOS, externalReference }) {
  const order = await createOrder({
    email,
    valorCentavos,
    externalReference,
    paymentMethod: { id: 'pix', type: 'bank_transfer' },
  });
  return toLegacyPayment(order);
}

// Cria pagamento com cartão — token gerado no frontend pelo SDK MercadoPago.js
async function createCardPayment({
  email,
  token,
  paymentMethodId,
  issuerId, // aceito por compatibilidade; a Orders API resolve o emissor pelo token
  installments = 1,
  valorCentavos = PREMIUM_PRICE_CENTAVOS,
  externalReference,
}) {
  try {
    const order = await createOrder({
      email,
      valorCentavos,
      externalReference,
      paymentMethod: {
        id: paymentMethodId,
        type: 'credit_card',
        token,
        installments,
      },
    });
    return toLegacyPayment(order);
  } catch (err) {
    // Cartão recusado vem como erro da Orders API (errors[].code === 'failed'),
    // não como order com status — traduz para o status legado 'rejected'
    const failed = err.mpResponse?.errors?.some((e) => e.code === 'failed');
    if (failed) {
      return {
        id: err.mpResponse.id || null,
        status: 'rejected',
        status_detail: err.mpResponse.errors[0]?.details?.[0] || 'rejected',
      };
    }
    throw err;
  }
}

async function getPayment(mpOrderId) {
  const order = await mpRequest('GET', `/v1/orders/${mpOrderId}`);
  return toLegacyPayment(order);
}

module.exports = {
  createPixPayment,
  createCardPayment,
  getPayment,
  PREMIUM_PRICE_CENTAVOS,
};
