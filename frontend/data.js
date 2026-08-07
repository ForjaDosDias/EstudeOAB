/* Configuração estática de áreas — único dado permanente aqui */

// As chaves são os valores REAIS de questions.area_direito. São 13 no banco —
// este mapa tinha só 7, e uma delas (`trib`) sequer existe lá: o valor correto
// é `trib e proc trib`. Foi essa divergência que fez a Trilha Publicista
// prometer Tributário e devolver zero questões até 06/08/2026.
// `sigla` e `cor` (2026-08-08): a trilha passou a ser desenhada como bolinhas
// com o NOME da disciplina dentro, e não mais emojis. Emoji não diz qual
// matéria é — "⚖️" servia para Civil, Penal e o fallback ao mesmo tempo.
//
// As cores são 13 distintas de propósito: a bolinha só funciona como atalho
// visual se a mesma matéria tiver sempre a mesma cor. Ramo processual leva a
// variação clara do ramo material (Penal/Proc. Penal), para o parentesco ficar
// visível sem confundir.
const AREAS = {
  civil:              { id: 'civil',              label: 'Direito Civil',      sigla: 'CIVIL',   cor: '#2d7a50', icon: '⚖️', pillClass: 'area-pill-civil' },
  'proc civil':       { id: 'proc civil',         label: 'Processo Civil',     sigla: 'P.CIVIL', cor: '#4a9967', icon: '📑', pillClass: 'area-pill-civil' },
  const:              { id: 'const',              label: 'Constitucional',     sigla: 'CONST',   cor: '#25294f', icon: '🏛', pillClass: 'area-pill-const' },
  human:              { id: 'human',              label: 'Direitos Humanos',   sigla: 'HUM',     cor: '#5b6bb5', icon: '🕊️', pillClass: 'area-pill-const' },
  penal:              { id: 'penal',              label: 'Penal',              sigla: 'PENAL',   cor: '#a63f50', icon: '⚠️', pillClass: 'area-pill-penal' },
  'proc penal':       { id: 'proc penal',         label: 'Processo Penal',     sigla: 'P.PENAL', cor: '#c46774', icon: '🔍', pillClass: 'area-pill-penal' },
  trabalho:           { id: 'trabalho',           label: 'Trabalhista',        sigla: 'TRAB',    cor: '#e08a10', icon: '👷', pillClass: 'area-pill-trabalho' },
  'proc trab':        { id: 'proc trab',          label: 'Processo do Trabalho', sigla: 'P.TRAB', cor: '#f0ab52', icon: '🧰', pillClass: 'area-pill-trabalho' },
  adm:                { id: 'adm',                label: 'Administrativo',     sigla: 'ADM',     cor: '#6b4d8f', icon: '📋', pillClass: 'area-pill-adm' },
  etica:              { id: 'etica',              label: 'Ética Profissional', sigla: 'ÉTICA',   cor: '#1f7a7a', icon: '🤝', pillClass: 'area-pill-etica' },
  'trib e proc trib': { id: 'trib e proc trib',   label: 'Tributário',         sigla: 'TRIB',    cor: '#b5563a', icon: '💰', pillClass: 'area-pill-trib' },
  empresarial:        { id: 'empresarial',        label: 'Empresarial',        sigla: 'EMPRE',   cor: '#8a6a3f', icon: '🏢', pillClass: 'area-pill-adm' },
  outros:             { id: 'outros',             label: 'Complementares',     sigla: 'COMP',    cor: '#6b7280', icon: '📚', pillClass: 'area-pill-civil' },

  // Legado: `trib` não é um valor do banco, mas o cadastro antigo grava essa
  // string em `area_segunda_fase`. Mantido só para os lookups não quebrarem.
  trib:               { id: 'trib',               label: 'Tributário',         sigla: 'TRIB',    cor: '#b5563a', icon: '💰', pillClass: 'area-pill-trib' },
};

// Disciplinas oferecidas na tela de foco do onboarding — só valores reais,
// sem o alias legado.
const DISCIPLINAS = Object.values(AREAS).filter((a) => a.id !== 'trib');

// Fallback: disciplina que exista no banco e ainda não esteja no mapa acima
// aparece com a sigla derivada do próprio id, em cinza — some da tela é pior.
function areaInfo(id) {
  return AREAS[id] || {
    id,
    label: id,
    sigla: String(id).slice(0, 5).toUpperCase(),
    cor: '#6b7280',
    icon: '⚖️',
    pillClass: 'area-pill-civil',
  };
}

function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('oab_token');
  const isFormData = opts.body instanceof FormData;
  return fetch('/api' + path, {
    ...opts,
    headers: {
      // FormData: não setar Content-Type — o browser adiciona automaticamente
      // com o boundary correto para multipart/form-data
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)));
}

/* =========================================================
   Eventos de produto (08/08/2026).

   O onboarding roda ANTES de existir conta, então o funil não pode depender de
   token: quem abre o site e desiste na tela 2 é justamente o que se quer medir.
   O `anon_id` fica no localStorage e continua sendo enviado depois do cadastro
   — é ele que costura "abriu o site" a "criou conta".
   ========================================================= */
const ANON_KEY = 'oab_anon';
const UTM_KEY  = 'oab_utm';

function anonId() {
  let id = localStorage.getItem(ANON_KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
      // Safari antigo não tem randomUUID; sem fallback o funil sumiria para
      // esses visitantes sem ninguém notar.
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    localStorage.setItem(ANON_KEY, id);
  }
  return id;
}

// A UTM é lida uma vez, na primeira visita, e guardada: a pessoa chega pelo
// link do Instagram e só cria conta três telas depois, quando a query string
// já sumiu da URL.
function utmSalva() {
  const guardada = localStorage.getItem(UTM_KEY);
  if (guardada) { try { return JSON.parse(guardada); } catch { /* corrompida: relê */ } }

  const p = new URLSearchParams(location.search);
  const utm = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
    if (p.get(k)) utm[k.replace('utm_', '')] = p.get(k).slice(0, 60);
  }
  if (!utm.source && document.referrer && !document.referrer.includes(location.host)) {
    try { utm.source = new URL(document.referrer).hostname; } catch { /* referrer torto */ }
  }
  localStorage.setItem(UTM_KEY, JSON.stringify(utm));
  return utm;
}

function track(nome, props = {}) {
  try {
    const token = localStorage.getItem('oab_token');
    fetch('/api/events', {
      method: 'POST',
      keepalive: true, // sobrevive à navegação que o próprio clique dispara
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ anon_id: anonId(), nome, props, utm: utmSalva() }),
    }).catch(() => {});
  } catch {
    // Silêncio proposital: métrica que quebra a tela é pior que métrica nenhuma.
  }
}

window.AppData  = { AREAS, DISCIPLINAS, areaInfo };
window.track    = track;
window.apiFetch = apiFetch;
