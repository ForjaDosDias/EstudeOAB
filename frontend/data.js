/* Configuração estática de áreas — único dado permanente aqui */

const AREAS = {
  civil:    { id: 'civil',    label: 'Direito Civil',         icon: '⚖️',  pillClass: 'area-pill-civil' },
  const:    { id: 'const',    label: 'Constitucional',        icon: '🏛',  pillClass: 'area-pill-const' },
  penal:    { id: 'penal',    label: 'Penal',                 icon: '⚠️',  pillClass: 'area-pill-penal' },
  trabalho: { id: 'trabalho', label: 'Trabalhista',           icon: '👷',  pillClass: 'area-pill-trabalho' },
  adm:      { id: 'adm',      label: 'Administrativo',        icon: '📋',  pillClass: 'area-pill-adm' },
  etica:    { id: 'etica',    label: 'Ética Profissional',    icon: '🤝',  pillClass: 'area-pill-etica' },
  trib:     { id: 'trib',     label: 'Tributário',            icon: '💰',  pillClass: 'area-pill-trib' },
};

function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('oab_token');
  return fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)));
}

window.AppData  = { AREAS };
window.apiFetch = apiFetch;
