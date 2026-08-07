const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

/**
 * Coleta de eventos de produto.
 *
 * SEM requireAuth de propósito: o evento mais valioso do funil — "abriu o site
 * e desistiu no onboarding" — acontece antes de existir conta. Exigir token
 * aqui deixaria cego exatamente o trecho que se quer medir.
 *
 * Sendo público, precisa das três travas abaixo. Elas não são zelo excessivo:
 * a API não tem rate limit em lugar nenhum hoje, e este é o endpoint mais
 * exposto do sistema.
 */

// 1. Allowlist. Endpoint público sem lista fechada vira depósito de lixo — e
//    pior, lixo que ninguém percebe até o painel mentir.
const EVENTOS = new Set([
  'onboarding_visto',   // tela 1 do onboarding renderizou
  'foco_escolhido',     // saiu da tela 2 · props: { materias: N }
  'trilha_vista',       // tela 3 renderizou
  'conta_iniciada',     // abriu o formulário de cadastro
  'conta_criada',       // POST /auth/register deu certo
  'email_verificado',   // clicou no link do e-mail
  'sessao_iniciada',    // começou a responder questões
  'sessao_concluida',   // terminou a sessão
]);

// 2. Teto de props. Sem isso, um POST de 10 MB de JSONB por requisição.
const MAX_PROPS_BYTES = 2048;

// 3. Rate limit por anon_id, em memória. Janela deslizante simples: o volume
//    aqui é de um punhado de eventos por sessão de uso, e qualquer coisa acima
//    disso é script. ponytail: Map em memória, some no restart e não é
//    compartilhado entre réplicas — trocar por Redis se um dia houver mais de
//    um processo.
const LIMITE_POR_MINUTO = 40;
const janelas = new Map();

function excedeuLimite(anonId) {
  const agora = Date.now();
  const marcas = (janelas.get(anonId) || []).filter((t) => agora - t < 60_000);
  marcas.push(agora);
  janelas.set(anonId, marcas);

  // Poda preguiçosa: sem isso o Map cresce para sempre com visitantes antigos.
  if (janelas.size > 5000) {
    for (const [k, v] of janelas) if (!v.length || agora - v[v.length - 1] > 60_000) janelas.delete(k);
  }
  return marcas.length > LIMITE_POR_MINUTO;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// O token é opcional: se vier e for válido, o evento fica ligado à conta; se
// vier podre, o evento entra anônimo em vez de dar 401. Métrica não é lugar de
// barrar o usuário.
function userIdOpcional(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), JWT_SECRET).userId || null;
  } catch {
    return null;
  }
}

function objetoSeguro(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

// POST /api/events
router.post('/', async (req, res) => {
  const { anon_id: anonId, nome } = req.body || {};

  if (!UUID_RE.test(String(anonId || ''))) {
    return res.status(400).json({ error: 'anon_id inválido' });
  }
  if (!EVENTOS.has(nome)) {
    return res.status(400).json({ error: 'Evento desconhecido' });
  }

  const props = objetoSeguro(req.body.props);
  const utm = objetoSeguro(req.body.utm);
  if (JSON.stringify(props).length > MAX_PROPS_BYTES) {
    return res.status(413).json({ error: 'props grande demais' });
  }

  if (excedeuLimite(anonId)) {
    return res.status(429).json({ error: 'Muitos eventos' });
  }

  try {
    await pool.query(
      'INSERT INTO eventos (anon_id, user_id, nome, props, utm) VALUES ($1, $2, $3, $4, $5)',
      [anonId, userIdOpcional(req), nome, props, utm]
    );
    // 204: o navegador não usa a resposta para nada, e o corpo vazio deixa
    // claro que este endpoint não devolve dado nenhum.
    res.status(204).end();
  } catch (err) {
    console.error('POST /events error:', err.message);
    // Falha de métrica não é falha do usuário: 202 e segue o baile. Devolver
    // 500 faria o front logar erro numa chamada que não afeta nada do produto.
    res.status(202).end();
  }
});

module.exports = router;
module.exports.EVENTOS = EVENTOS;
