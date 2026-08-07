/* Configuração estática de áreas — único dado permanente aqui */

// As chaves são os valores REAIS de questions.area_direito. São 13 no banco —
// este mapa tinha só 7, e uma delas (`trib`) sequer existe lá: o valor correto
// é `trib e proc trib`. Foi essa divergência que fez a Trilha Publicista
// prometer Tributário e devolver zero questões até 06/08/2026.
const AREAS = {
  civil:              { id: 'civil',              label: 'Direito Civil',      icon: '⚖️', pillClass: 'area-pill-civil' },
  'proc civil':       { id: 'proc civil',         label: 'Processo Civil',     icon: '📑', pillClass: 'area-pill-civil' },
  const:              { id: 'const',              label: 'Constitucional',     icon: '🏛', pillClass: 'area-pill-const' },
  human:              { id: 'human',              label: 'Direitos Humanos',   icon: '🕊️', pillClass: 'area-pill-const' },
  penal:              { id: 'penal',              label: 'Penal',              icon: '⚠️', pillClass: 'area-pill-penal' },
  'proc penal':       { id: 'proc penal',         label: 'Processo Penal',     icon: '🔍', pillClass: 'area-pill-penal' },
  trabalho:           { id: 'trabalho',           label: 'Trabalhista',        icon: '👷', pillClass: 'area-pill-trabalho' },
  'proc trab':        { id: 'proc trab',          label: 'Processo do Trabalho', icon: '🧰', pillClass: 'area-pill-trabalho' },
  adm:                { id: 'adm',                label: 'Administrativo',     icon: '📋', pillClass: 'area-pill-adm' },
  etica:              { id: 'etica',              label: 'Ética Profissional', icon: '🤝', pillClass: 'area-pill-etica' },
  'trib e proc trib': { id: 'trib e proc trib',   label: 'Tributário',         icon: '💰', pillClass: 'area-pill-trib' },
  empresarial:        { id: 'empresarial',        label: 'Empresarial',        icon: '🏢', pillClass: 'area-pill-adm' },
  outros:             { id: 'outros',             label: 'Complementares',     icon: '📚', pillClass: 'area-pill-civil' },

  // Legado: `trib` não é um valor do banco, mas o cadastro antigo grava essa
  // string em `area_segunda_fase`. Mantido só para os lookups não quebrarem.
  trib:               { id: 'trib',               label: 'Tributário',         icon: '💰', pillClass: 'area-pill-trib' },
};

// Disciplinas oferecidas na tela de exclusão do onboarding — só valores reais,
// sem o alias legado.
const DISCIPLINAS = Object.values(AREAS).filter((a) => a.id !== 'trib');

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

window.AppData  = { AREAS, DISCIPLINAS };
window.apiFetch = apiFetch;
