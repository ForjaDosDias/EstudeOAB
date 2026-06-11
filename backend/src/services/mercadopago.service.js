const crypto = require('crypto');

// Integração direta com a API do Mercado Pago (Checkout Transparente).
// Pix e Cartão com liquidação D+0 — a liberação imediata do saldo é
// configurada na conta Mercado Pago (Seu negócio > Configurações > Prazos
// de liberação); a API usada aqui é compatível com esse modo.
const MP_BASE_URL = process.env.MP_BASE_URL || 'https://api.mercadopago.com';

const PREMIUM_PRICE_CENTAVOS = parseInt(process.env.PREMIUM_PRICE_CENTAVOS || '2990');
const PREMIUM_DESCRIPTION = 'EstudeOAB Premium — assinatura mensal';

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
    const msg = data.message || data.error || `Mercado Pago respondeu ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.mpResponse = data;
    throw err;
  }
  return data;
}

// Cria pagamento Pix — retorna QR code + copia-e-cola
async function createPixPayment({ email, valorCentavos = PREMIUM_PRICE_CENTAVOS, externalReference }) {
  return mpRequest('POST', '/v1/payments', {
    transaction_amount: valorCentavos / 100,
    description: PREMIUM_DESCRIPTION,
    payment_method_id: 'pix',
    payer: { email },
    external_reference: externalReference,
    date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
}

// Cria pagamento com cartão — token gerado no frontend pelo SDK MercadoPago.js
async function createCardPayment({
  email,
  token,
  paymentMethodId,
  issuerId,
  installments = 1,
  valorCentavos = PREMIUM_PRICE_CENTAVOS,
  externalReference,
}) {
  return mpRequest('POST', '/v1/payments', {
    transaction_amount: valorCentavos / 100,
    description: PREMIUM_DESCRIPTION,
    token,
    payment_method_id: paymentMethodId,
    issuer_id: issuerId,
    installments,
    capture: true,
    payer: { email },
    external_reference: externalReference,
  });
}

async function getPayment(mpPaymentId) {
  return mpRequest('GET', `/v1/payments/${mpPaymentId}`);
}

module.exports = {
  createPixPayment,
  createCardPayment,
  getPayment,
  PREMIUM_PRICE_CENTAVOS,
};
