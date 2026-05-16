/* global React */
const { useState: useStateStats, useMemo: useMemoStats } = React;

/* =========================================================
   Estatísticas + revisão de questões respondidas
   ========================================================= */
function StatsPage({ onNavigate, openOnLoad }) {
  const { STATS_OVERVIEW, STATS_AREAS, AREAS, RESPOSTAS_HISTORICO, QUESTIONS } = window.AppData;
  const [filtroResultado, setFiltroResultado] = useStateStats('todos'); // todos | acertos | erros
  const [filtroArea, setFiltroArea]           = useStateStats('todas');
  const [reviewQ, setReviewQ]                 = useStateStats(openOnLoad || null);

  const filtradas = useMemoStats(() => RESPOSTAS_HISTORICO.filter(r => {
    if (filtroArea !== 'todas' && r.area !== filtroArea) return false;
    if (filtroResultado === 'acertos' && r.escolhida !== r.correta) return false;
    if (filtroResultado === 'erros'   && r.escolhida === r.correta) return false;
    return true;
  }), [filtroResultado, filtroArea]);

  // distribuição visual de acerto / erro por área (donut)
  const totalAcertos = STATS_AREAS.reduce((a, s) => a + s.acertos, 0);
  const totalRespond = STATS_AREAS.reduce((a, s) => a + s.respondidas, 0);
  const erros = totalRespond - totalAcertos;
  const naoFeitas = STATS_AREAS.reduce((a, s) => a + (s.total - s.respondidas), 0);

  return (
    <div className="stats fade-up">
      <header className="dash-top">
        <div>
          <div className="eyebrow">Análise · últimos 30 dias</div>
          <h1 className="page-h1">Suas estatísticas.</h1>
          <p className="page-sub">Veja em detalhe seu desempenho, identifique pontos fracos e revise qualquer questão respondida.</p>
        </div>
        <div className="dash-top-actions">
          <button className="btn btn-secondary">Exportar relatório</button>
          <button className="btn btn-cta" onClick={() => onNavigate('practice')}>⚡ Praticar agora</button>
        </div>
      </header>

      {/* KPIs */}
      <section className="dash-row dash-stats">
        <div className="stat-card accent-bordo">
          <div className="stat-label">Taxa de acerto</div>
          <div className="stat-value" style={{color:'var(--bordo)'}}>{STATS_OVERVIEW.acertosPct}%</div>
          <div className="stat-sub">média geral · {totalAcertos} acertos em {totalRespond} questões</div>
        </div>
        <div className="stat-card accent-azul">
          <div className="stat-label">Sessões</div>
          <div className="stat-value" style={{color:'var(--azul)'}}>{STATS_OVERVIEW.simuladosCompletos + 22}</div>
          <div className="stat-sub">22 livres · {STATS_OVERVIEW.simuladosCompletos} simulados</div>
        </div>
        <div className="stat-card accent-amarelo">
          <div className="stat-label">Tempo médio</div>
          <div className="stat-value" style={{color:'var(--amarelo-dark)'}}>1m 48s</div>
          <div className="stat-sub">por questão · ↓ 12s na semana</div>
        </div>
        <div className="stat-card accent-green">
          <div className="stat-label">Sequência</div>
          <div className="stat-value" style={{color:'var(--green-dark)'}}>{STATS_OVERVIEW.streak} <span style={{fontSize:'var(--text-md)'}}>dias</span></div>
          <div className="stat-sub">recorde pessoal: 21 dias</div>
        </div>
      </section>

      {/* Donut + barras por área */}
      <section className="dash-row dash-row-bottom">
        <div className="dash-card stats-mix">
          <div className="dash-card-head">
            <div>
              <h3 className="dash-card-title">Acertos e erros</h3>
              <p className="dash-card-sub">Distribuição entre questões já respondidas</p>
            </div>
          </div>
          <div className="stats-donut-row">
            <Donut acertos={totalAcertos} erros={erros} pendentes={naoFeitas} />
            <div className="stats-donut-legend">
              <div className="stats-legend-item">
                <span className="stats-legend-dot" style={{background:'var(--green)'}} />
                <div>
                  <div className="stats-legend-label">Acertos</div>
                  <div className="stats-legend-val">{totalAcertos}</div>
                </div>
              </div>
              <div className="stats-legend-item">
                <span className="stats-legend-dot" style={{background:'var(--bordo)'}} />
                <div>
                  <div className="stats-legend-label">Erros</div>
                  <div className="stats-legend-val">{erros}</div>
                </div>
              </div>
              <div className="stats-legend-item">
                <span className="stats-legend-dot" style={{background:'var(--bege-dark)'}} />
                <div>
                  <div className="stats-legend-label">Pendentes</div>
                  <div className="stats-legend-val">{naoFeitas}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dash-card stats-areas">
          <div className="dash-card-head">
            <div>
              <h3 className="dash-card-title">Desempenho por área</h3>
              <p className="dash-card-sub">7 áreas · ordenado por taxa de acerto</p>
            </div>
            <span className="chip chip-azul">{STATS_AREAS.length} áreas</span>
          </div>
          <div className="stats-areas-list">
            {[...STATS_AREAS].sort((a,b) => b.pct - a.pct).map(s => {
              const a = AREAS[s.area];
              const fillClass =
                s.pct >= 80 ? 'green-fill' :
                s.pct >= 65 ? 'amarelo-fill' :
                s.pct >= 50 ? '' : 'azul-fill';
              return (
                <div key={s.area} className="stats-area-row">
                  <div className="stats-area-head">
                    <span className={`area-pill ${a.pillClass}`}>{a.icon} {a.label}</span>
                    <div className="stats-area-meta">
                      <span><strong>{s.acertos}</strong>/{s.respondidas} acertos</span>
                      <span className="stats-area-pct">{s.pct}%</span>
                    </div>
                  </div>
                  <div className="progress-track" style={{marginBottom:0}}>
                    <div className={`progress-fill ${fillClass}`} style={{width: s.pct + '%'}} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Histórico de questões */}
      <section className="dash-card stats-history">
        <div className="dash-card-head">
          <div>
            <h3 className="dash-card-title">Histórico de questões</h3>
            <p className="dash-card-sub">Clique em uma questão para abrir o gabarito comentado.</p>
          </div>
          <div className="stats-history-count">
            {filtradas.length} questões
          </div>
        </div>

        <div className="stats-filters">
          <div className="stats-filter-group">
            <span className="stats-filter-label">Resultado</span>
            <div className="stats-seg">
              {[
                { id: 'todos',   label: 'Todas' },
                { id: 'acertos', label: '✓ Acertos' },
                { id: 'erros',   label: '✕ Erros' },
              ].map(f => (
                <button key={f.id}
                        className={`stats-seg-btn ${filtroResultado === f.id ? 'is-active' : ''}`}
                        onClick={() => setFiltroResultado(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="stats-filter-group">
            <span className="stats-filter-label">Área</span>
            <select className="select-field" value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={{width:'auto', padding:'8px 12px', fontSize:'var(--text-sm)'}}>
              <option value="todas">Todas as áreas</option>
              {Object.values(AREAS).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
        </div>

        <div className="stats-list">
          {filtradas.length === 0 && (
            <div className="stats-empty">
              <div className="stats-empty-ic">∅</div>
              <div className="stats-empty-title">Nenhuma questão encontrada</div>
              <div className="stats-empty-sub">Tente ajustar os filtros acima.</div>
            </div>
          )}
          {filtradas.map((r, i) => {
            const q = QUESTIONS.find(x => x.id === r.qId);
            const a = AREAS[r.area];
            const ok = r.escolhida === r.correta;
            const dt = new Date(r.data);
            const dtLabel = dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }) + ' · ' + dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
            return (
              <button key={i} className={`stats-list-row ${ok ? 'ok' : 'bad'}`} onClick={() => setReviewQ(q)}>
                <div className="stats-list-status">
                  <div className={`stats-list-status-ic ${ok ? 'ok' : 'bad'}`}>{ok ? '✓' : '✕'}</div>
                </div>
                <div className="stats-list-main">
                  <div className="stats-list-q">{q.enunciado}</div>
                  <div className="stats-list-meta">
                    <span className={`area-pill ${a.pillClass}`} style={{padding:'2px 8px', fontSize:'10px'}}>{a.icon} {a.label}</span>
                    <span className="stats-list-mono">{q.artigo}</span>
                    <span>· {r.sessao}</span>
                  </div>
                </div>
                <div className="stats-list-right">
                  <div className="stats-list-answer">
                    <span className={ok ? 'stats-letter ok' : 'stats-letter bad'}>{r.escolhida}</span>
                    {!ok && <><span className="stats-list-arrow">→</span><span className="stats-letter ok">{r.correta}</span></>}
                  </div>
                  <div className="stats-list-time">⏱ {r.tempo}s · {dtLabel}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {reviewQ && <ReviewModal q={reviewQ} onClose={() => setReviewQ(null)} />}
    </div>
  );
}

/* ---------- Donut SVG ---------- */
function Donut({ acertos, erros, pendentes }) {
  const total = acertos + erros + pendentes;
  const R = 70, C = 2 * Math.PI * R;
  const seg = (v) => (v / total) * C;
  let off = 0;
  const segs = [
    { value: acertos,   color: 'var(--green)' },
    { value: erros,     color: 'var(--bordo)' },
    { value: pendentes, color: 'var(--bege-dark)' },
  ];
  return (
    <div className="stats-donut-wrap">
      <svg viewBox="0 0 180 180" className="stats-donut">
        <g transform="translate(90,90) rotate(-90)">
          {segs.map((s, i) => {
            const len = seg(s.value);
            const el = (
              <circle key={i} r={R} cx="0" cy="0" fill="none" stroke={s.color}
                strokeWidth="22" strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-off} />
            );
            off += len;
            return el;
          })}
        </g>
        <text x="90" y="86" textAnchor="middle" fontFamily="Playfair Display" fontSize="34" fontWeight="700" fill="var(--azul-dark)">
          {Math.round(acertos / (acertos+erros) * 100)}%
        </text>
        <text x="90" y="106" textAnchor="middle" fontFamily="DM Mono" fontSize="10" fill="var(--text-muted)" letterSpacing="0.1em">
          DE ACERTO
        </text>
      </svg>
    </div>
  );
}

/* ---------- Review Modal ---------- */
function ReviewModal({ q, onClose }) {
  const { AREAS } = window.AppData;
  const area = AREAS[q.area];
  // simular qual foi a resposta do usuário olhando o histórico
  const histReg = window.AppData.RESPOSTAS_HISTORICO.find(r => r.qId === q.id);
  const escolhida = histReg ? histReg.escolhida : null;
  const acertou = escolhida === q.correta;

  return (
    <div className="modal-backdrop fade-in" onClick={onClose}>
      <div className="modal-panel fade-up" onClick={e => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <div className="eyebrow">Revisão</div>
            <h2 className="modal-title">Questão {q.id.toUpperCase()}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </header>

        <div className="modal-meta-row">
          <span className={`area-pill ${area.pillClass}`}>{area.icon} {area.label}</span>
          <span className="chip chip-azul">{q.banca} · {q.edicao}</span>
          <span className="chip chip-neutral">Dificuldade: {q.dificuldade}</span>
          <span className="qcard-area-mono" style={{marginLeft:'auto'}}>{q.artigo}</span>
        </div>

        <div className="modal-question">{q.enunciado}</div>

        <div className="qcard-options" style={{marginBottom:24}}>
          {q.opcoes.map(o => {
            let state = 'dimmed';
            if (o.letra === q.correta) state = 'correct';
            else if (o.letra === escolhida) state = 'wrong';
            return (
              <div key={o.letra} className={`qcard-option ${state}`}>
                <div className="option-letter">{o.letra}</div>
                <div className="option-text">{o.texto}</div>
                {o.letra === q.correta && <span className="option-state">✓ gabarito</span>}
                {o.letra === escolhida && o.letra !== q.correta && <span className="option-state">sua resposta</span>}
              </div>
            );
          })}
        </div>

        <div className={`qcard-feedback ${acertou ? 'is-correct' : 'is-wrong'}`}>
          <div className="qcard-feedback-head">
            <span className="qcard-feedback-ic">{acertou ? '✓' : '✕'}</span>
            <div>
              <div className="qcard-feedback-title">Gabarito comentado</div>
              <div className="qcard-feedback-sub">
                Resposta correta: letra <strong>{q.correta}</strong>
                {escolhida && <> · Você marcou <strong>{escolhida}</strong></>}
              </div>
            </div>
          </div>
          <p className="qcard-feedback-body">{q.explicacao}</p>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost">🔖 Salvar para revisão</button>
          <button className="btn btn-quiet">Ver legislação completa</button>
          <button className="btn btn-primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

window.Stats = { StatsPage };
