/* global React, ReactDOM */
const { useState: useStateStats, useEffect: useEffectStats } = React;

/* =========================================================
   Estatísticas + revisão de questões respondidas
   ========================================================= */
function StatsPage({ onNavigate }) {
  const { AREAS } = window.AppData;

  const [overview,        setOverview]        = useStateStats(null);
  const [areas,           setAreas]           = useStateStats([]);
  const [historico,       setHistorico]       = useStateStats([]);
  const [totalHistorico,  setTotalHistorico]  = useStateStats(0);
  const [filtroResultado, setFiltroResultado] = useStateStats('todos');
  const [filtroArea,      setFiltroArea]      = useStateStats('todas');
  const [reviewAnswer,    setReviewAnswer]    = useStateStats(null);
  const [commentCache,    setCommentCache]    = useStateStats(new Map());
  const [loadingStats,    setLoadingStats]    = useStateStats(true);
  const [loadingHist,     setLoadingHist]     = useStateStats(true);
  const [erro,            setErro]            = useStateStats(null);

  // Busca overview + areas uma única vez
  useEffectStats(() => {
    setLoadingStats(true);
    Promise.all([
      window.apiFetch('/stats/overview'),
      window.apiFetch('/stats/areas'),
    ])
      .then(([ov, ar]) => { setOverview(ov); setAreas(ar); })
      .catch(() => setErro('Erro ao carregar estatísticas.'))
      .finally(() => setLoadingStats(false));
  }, []);

  // Re-busca histórico quando filtros mudam
  useEffectStats(() => {
    setLoadingHist(true);
    const params = new URLSearchParams({ limit: 30, offset: 0 });
    if (filtroArea      !== 'todas') params.set('area',      filtroArea);
    if (filtroResultado !== 'todos') params.set('resultado', filtroResultado);

    window.apiFetch(`/answers/history?${params}`)
      .then(data => { setHistorico(data.answers); setTotalHistorico(data.total); })
      .catch(() => setErro('Erro ao carregar histórico.'))
      .finally(() => setLoadingHist(false));
  }, [filtroResultado, filtroArea]);

  const totalAcertos = areas.reduce((a, s) => a + s.acertos,    0);
  const totalRespond  = areas.reduce((a, s) => a + s.respondidas, 0);
  const erros         = totalRespond - totalAcertos;
  const naoFeitas     = areas.reduce((a, s) => a + (s.total - s.respondidas), 0);

  if (erro) {
    return (
      <div className="stats fade-up" style={{padding:64, textAlign:'center'}}>
        <div style={{fontSize:40, marginBottom:16}}>⚠</div>
        <div style={{fontSize:18, marginBottom:8}}>{erro}</div>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Tentar novamente</button>
      </div>
    );
  }

  return (
    <div className="stats fade-up">
      <header className="dash-top">
        <div>
          <div className="eyebrow">Análise · todos os períodos</div>
          <h1 className="page-h1">Suas estatísticas.</h1>
          <p className="page-sub">Veja em detalhe seu desempenho, identifique pontos fracos e revise qualquer questão respondida.</p>
        </div>
        <div className="dash-top-actions">
          <button className="btn btn-cta" onClick={() => onNavigate('practice')}>⚡ Praticar agora</button>
        </div>
      </header>

      {/* KPIs */}
      <section className="dash-row dash-stats">
        <div className="stat-card accent-bordo">
          <div className="stat-label">Taxa de acerto</div>
          <div className="stat-value" style={{color:'var(--bordo)'}}>{loadingStats ? '—' : `${overview?.acertosPct ?? 0}%`}</div>
          <div className="stat-sub">média geral · {totalAcertos} acertos em {totalRespond} questões</div>
        </div>
        <div className="stat-card accent-azul">
          <div className="stat-label">Sessões</div>
          <div className="stat-value" style={{color:'var(--azul)'}}>{loadingStats ? '—' : (overview?.sessoesCompletas ?? 0)}</div>
          <div className="stat-sub">sessões concluídas</div>
        </div>
        <div className="stat-card accent-amarelo">
          <div className="stat-label">Tempo de estudo</div>
          <div className="stat-value" style={{color:'var(--amarelo-dark)'}}>{loadingStats ? '—' : `${overview?.tempoEstudoH ?? 0}h`}</div>
          <div className="stat-sub">tempo total estimado</div>
        </div>
        <div className="stat-card accent-green">
          <div className="stat-label">Sequência</div>
          <div className="stat-value" style={{color:'var(--green-dark)'}}>{loadingStats ? '—' : <>{overview?.streak ?? 0} <span style={{fontSize:'var(--text-md)'}}>dias</span></>}</div>
          <div className="stat-sub">dias consecutivos</div>
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
          {loadingStats
            ? <div style={{color:'var(--text-muted)', padding:32}}>Carregando…</div>
            : totalRespond === 0
              ? <div style={{color:'var(--text-muted)', padding:32}}>Nenhuma questão respondida ainda.</div>
              : (
                <div className="stats-donut-row">
                  <Donut acertos={totalAcertos} erros={erros} pendentes={naoFeitas} />
                  <div className="stats-donut-legend">
                    <div className="stats-legend-item">
                      <span className="stats-legend-dot" style={{background:'var(--green)'}} />
                      <div><div className="stats-legend-label">Acertos</div><div className="stats-legend-val">{totalAcertos}</div></div>
                    </div>
                    <div className="stats-legend-item">
                      <span className="stats-legend-dot" style={{background:'var(--bordo)'}} />
                      <div><div className="stats-legend-label">Erros</div><div className="stats-legend-val">{erros}</div></div>
                    </div>
                    <div className="stats-legend-item">
                      <span className="stats-legend-dot" style={{background:'var(--bege-dark)'}} />
                      <div><div className="stats-legend-label">Pendentes</div><div className="stats-legend-val">{naoFeitas}</div></div>
                    </div>
                  </div>
                </div>
              )
          }
        </div>

        <div className="dash-card stats-areas">
          <div className="dash-card-head">
            <div>
              <h3 className="dash-card-title">Desempenho por área</h3>
              <p className="dash-card-sub">{areas.length} áreas · ordenado por taxa de acerto</p>
            </div>
            <span className="chip chip-azul">{areas.length} áreas</span>
          </div>
          <div className="stats-areas-list">
            {loadingStats && <div style={{color:'var(--text-muted)'}}>Carregando…</div>}
            {[...areas].sort((a,b) => b.pct - a.pct).map(s => {
              const a = AREAS[s.area] || { label: s.area, icon: '⚖️', pillClass: 'area-pill-civil' };
              const fillClass = s.pct >= 80 ? 'green-fill' : s.pct >= 65 ? 'amarelo-fill' : s.pct >= 50 ? '' : 'azul-fill';
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
          <div className="stats-history-count">{totalHistorico} questões</div>
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
          {loadingHist && <div style={{color:'var(--text-muted)', padding:24}}>Carregando…</div>}
          {!loadingHist && historico.length === 0 && (
            <div className="stats-empty">
              <div className="stats-empty-ic">∅</div>
              <div className="stats-empty-title">Nenhuma questão encontrada</div>
              <div className="stats-empty-sub">Tente ajustar os filtros acima.</div>
            </div>
          )}
          {historico.map((r, i) => {
            const a = AREAS[r.area_direito] || { label: r.area_direito, icon: '⚖️', pillClass: 'area-pill-civil' };
            const ok = r.acertou;
            const dt = new Date(r.respondida_em);
            const dtLabel = dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }) + ' · ' + dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
            return (
              <button key={i} className={`stats-list-row ${ok ? 'ok' : 'bad'}`} onClick={() => setReviewAnswer(r)}>
                <div className="stats-list-status">
                  <div className={`stats-list-status-ic ${ok ? 'ok' : 'bad'}`}>{ok ? '✓' : '✕'}</div>
                </div>
                <div className="stats-list-main">
                  <div className="stats-list-q">{r.enunciado}</div>
                  <div className="stats-list-meta">
                    <span className={`area-pill ${a.pillClass}`} style={{padding:'2px 8px', fontSize:'10px'}}>{a.icon} {a.label}</span>
                    {r.banca && <span className="stats-list-mono">{r.banca} · {r.edicao}</span>}
                  </div>
                </div>
                <div className="stats-list-right">
                  <div className="stats-list-answer">
                    <span className={ok ? 'stats-letter ok' : 'stats-letter bad'}>{r.escolhida}</span>
                    {!ok && <><span className="stats-list-arrow">→</span><span className="stats-letter ok">{r.correta}</span></>}
                  </div>
                  <div className="stats-list-time">⏱ {r.tempo_s}s · {dtLabel}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {reviewAnswer && (
        <ReviewModal
          answer={reviewAnswer}
          onClose={() => setReviewAnswer(null)}
          commentCache={commentCache}
          setCommentCache={setCommentCache}
        />
      )}
    </div>
  );
}

/* ---------- Donut SVG ---------- */
function Donut({ acertos, erros, pendentes }) {
  const total = acertos + erros + pendentes;
  if (total === 0) return null;
  const R = 70, C = 2 * Math.PI * R;
  const seg = (v) => (v / total) * C;
  let off = 0;
  const segs = [
    { value: acertos,   color: 'var(--green)' },
    { value: erros,     color: 'var(--bordo)' },
    { value: pendentes, color: 'var(--bege-dark)' },
  ];
  const pctAcerto = acertos + erros > 0 ? Math.round(acertos / (acertos + erros) * 100) : 0;
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
          {pctAcerto}%
        </text>
        <text x="90" y="106" textAnchor="middle" fontFamily="DM Mono" fontSize="10" fill="var(--text-muted)" letterSpacing="0.1em">
          DE ACERTO
        </text>
      </svg>
    </div>
  );
}

/* ---------- Review Modal ---------- */
function ReviewModal({ answer, onClose, commentCache, setCommentCache }) {
  const { AREAS } = window.AppData;
  const area = AREAS[answer.area_direito] || { label: answer.area_direito || 'Área', icon: '⚖️', pillClass: 'area-pill-civil' };
  const acertou = answer.acertou;

  const [comentariosAbertos,  setComentariosAbertos]  = useStateStats(false);
  const [comentarios,         setComentarios]         = useStateStats([]);
  const [loadingComentarios,  setLoadingComentarios]  = useStateStats(false);
  const [novoComentario,      setNovoComentario]      = useStateStats('');
  const [enviandoComentario,  setEnviandoComentario]  = useStateStats(false);

  const abrirComentarios = async () => {
    if (comentariosAbertos) { setComentariosAbertos(false); return; }
    const qId = answer.question_id;
    if (commentCache && commentCache.has(qId)) {
      setComentarios(commentCache.get(qId));
      setComentariosAbertos(true);
      return;
    }
    setLoadingComentarios(true);
    setComentariosAbertos(true);
    try {
      const data = await window.apiFetch(`/question-comments/${qId}`);
      const lista = data.comments || [];
      if (setCommentCache) setCommentCache(m => { const nm = new Map(m); nm.set(qId, lista); return nm; });
      setComentarios(lista);
    } catch { setComentarios([]); }
    finally { setLoadingComentarios(false); }
  };

  const enviarComentario = async () => {
    if (!novoComentario.trim()) return;
    setEnviandoComentario(true);
    try {
      const novo = await window.apiFetch(`/question-comments/${answer.question_id}`, {
        method: 'POST',
        body: JSON.stringify({ corpo: novoComentario.trim() }),
      });
      const lista = [...comentarios, novo];
      setComentarios(lista);
      if (setCommentCache) setCommentCache(m => { const nm = new Map(m); nm.set(answer.question_id, lista); return nm; });
      setNovoComentario('');
    } catch (err) {
      alert(err.error || 'Erro ao enviar comentário');
    } finally {
      setEnviandoComentario(false);
    }
  };

  const opcoes = [
    { letra: 'A', texto: answer.alternativa_a },
    { letra: 'B', texto: answer.alternativa_b },
    { letra: 'C', texto: answer.alternativa_c },
    { letra: 'D', texto: answer.alternativa_d },
  ].filter(o => o.texto);

  return ReactDOM.createPortal(
    <div className="modal-backdrop fade-in" onClick={onClose}>
      <div className="modal-panel fade-up" onClick={e => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <div className="eyebrow">Revisão</div>
            <h2 className="modal-title">{answer.banca} · {answer.edicao}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </header>

        <div className="modal-meta-row">
          <span className={`area-pill ${area.pillClass}`}>{area.icon} {area.label}</span>
          {answer.banca && <span className="chip chip-azul">{answer.banca} · {answer.edicao}</span>}
          {answer.dificuldade && <span className="chip chip-neutral">Dificuldade: {answer.dificuldade}</span>}
        </div>

        <div className="modal-question">{answer.enunciado}</div>

        {opcoes.length > 0 && (
          <div className="qcard-options" style={{marginBottom:24}}>
            {opcoes.map(o => {
              let state = 'dimmed';
              if (o.letra === answer.correta)  state = 'correct';
              else if (o.letra === answer.escolhida) state = 'wrong';
              return (
                <div key={o.letra} className={`qcard-option ${state}`}>
                  <div className="option-letter">{o.letra}</div>
                  <div className="option-text">{o.texto}</div>
                  {o.letra === answer.correta  && <span className="option-state">✓ gabarito</span>}
                  {o.letra === answer.escolhida && o.letra !== answer.correta && <span className="option-state">sua resposta</span>}
                </div>
              );
            })}
          </div>
        )}

        <div className={`qcard-feedback ${acertou ? 'is-correct' : 'is-wrong'}`}>
          <div className="qcard-feedback-head">
            <span className="qcard-feedback-ic">{acertou ? '✓' : '✕'}</span>
            <div>
              <div className="qcard-feedback-title">{acertou ? 'Resposta correta!' : 'Quase lá — não foi dessa vez'}</div>
              <div className="qcard-feedback-sub">
                Gabarito: letra <strong>{answer.correta}</strong>
                {answer.escolhida && <> · Você marcou <strong>{answer.escolhida}</strong></>}
              </div>
            </div>
          </div>
        </div>

        <div style={{marginTop:16}}>
          <button className="btn btn-quiet btn-sm" onClick={abrirComentarios}>
            {comentariosAbertos ? 'Fechar comentários' : `Comentários (${answer.comment_count ?? 0})`}
          </button>
          {comentariosAbertos && (
            <div style={{marginTop:12}}>
              {loadingComentarios && (
                <div style={{color:'var(--text-muted)', fontSize:'var(--text-sm)'}}>Carregando…</div>
              )}
              {!loadingComentarios && comentarios.length === 0 && (
                <div style={{color:'var(--text-muted)', fontSize:'var(--text-sm)', marginBottom:10}}>Nenhum comentário ainda. Seja o primeiro!</div>
              )}
              {!loadingComentarios && comentarios.map(c => (
                <div key={c.id} style={{borderTop:'1px solid var(--border)', paddingTop:10, marginTop:10}}>
                  <div style={{fontSize:11, color:'var(--text-muted)', marginBottom:4}}>
                    {c.autor_nome || 'Usuário'} · {new Date(c.criado_em).toLocaleDateString('pt-BR')}
                  </div>
                  <div style={{fontSize:'var(--text-sm)'}}>{c.corpo}</div>
                </div>
              ))}
              {!loadingComentarios && (
                <div style={{display:'flex', gap:8, marginTop:12, borderTop:'1px solid var(--border)', paddingTop:12}}>
                  <textarea
                    className="input-field"
                    rows={2}
                    placeholder="Adicionar comentário…"
                    value={novoComentario}
                    onChange={e => setNovoComentario(e.target.value)}
                    style={{flex:1, resize:'vertical', fontFamily:'inherit', fontSize:'var(--text-sm)'}}
                    disabled={enviandoComentario}
                  />
                  <button className="btn btn-primary btn-sm"
                          onClick={enviarComentario}
                          disabled={!novoComentario.trim() || enviandoComentario}
                          style={{alignSelf:'flex-end'}}>
                    {enviandoComentario ? '…' : 'Comentar'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

window.Stats = { StatsPage };
