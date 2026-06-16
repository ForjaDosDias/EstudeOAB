/* global React */
const { useState: useStatePractice, useEffect: useEffectPractice, useRef: useRefPractice } = React;

/* Helper — mapeia questão da API para o formato interno */
function formatarQuestao(q) {
  return {
    ...q,
    area: q.area_direito,
    opcoes: [
      { letra: 'A', texto: q.alternativa_a },
      { letra: 'B', texto: q.alternativa_b },
      { letra: 'C', texto: q.alternativa_c },
      { letra: 'D', texto: q.alternativa_d },
    ].filter(o => o.texto),
  };
}

/* =========================================================
   Jornada de prática — setup → questionário → resultado
   ========================================================= */
function PracticeFlow({ user, onUserUpdate, onExit, onNavigate, onUpgrade }) {
  const [phase,   setPhase]   = useStatePractice('setup');
  const [config,  setConfig]  = useStatePractice({ modo: 'rapida', areas: ['civil', 'const', 'etica'], total: 5 });
  const [session, setSession] = useStatePractice(null);
  const [loading, setLoading] = useStatePractice(false);
  const [erro,    setErro]    = useStatePractice(null);

  const startSession = async () => {
    setLoading(true);
    setErro(null);
    try {
      const data = await window.apiFetch('/sessions', {
        method: 'POST',
        body: JSON.stringify({ modo: config.modo, areas: config.areas, total_questoes: config.total }),
      });
      if (!data.questoes || data.questoes.length === 0) {
        setErro('Nenhuma questão encontrada para as áreas selecionadas. Peça ao administrador para importar questões.');
        return;
      }
      setSession({ id: data.id, questoes: data.questoes.map(formatarQuestao), respostas: [], idx: 0 });
      setPhase('run');
    } catch (err) {
      setErro(err.error || 'Erro ao iniciar sessão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const finishSession = () => setPhase('result');

  if (phase === 'setup')  return <PracticeSetup user={user} config={config} setConfig={setConfig} onStart={startSession} onExit={onExit} loading={loading} erro={erro} onUpgrade={onUpgrade} />;
  if (phase === 'run')    return <PracticeRunner session={session} setSession={setSession} onFinish={finishSession} onExit={onExit} />;
  if (phase === 'result') return <PracticeResult session={session} onRetry={() => { setSession(null); setPhase('setup'); }} onExit={onExit} onNavigate={onNavigate} onUserUpdate={onUserUpdate} />;
  return null;
}

/* ---------- Setup ---------- */
function PracticeSetup({ user, config, setConfig, onStart, onExit, loading, erro, onUpgrade }) {
  const [trilhaAtiva, setTrilhaAtiva] = useStatePractice(null);
  const { AREAS } = window.AppData;
  const TOTAIS_POR_MODO = { rapida: 5, simulado: 80 };

  const modos = [
    { id: 'rapida',        label: 'Sessão rápida',  meta: '5 questões · ~10 min', icon: '⚡' },
    { id: 'simulado',      label: 'Simulado',       meta: '80 questões · 4h',     icon: '🎯' },
    { id: 'personalizado', label: 'Personalizado',  meta: 'Você escolhe tudo',     icon: '⚙' },
  ];

  const selecionarModo = (id) => {
    setConfig(c => ({
      ...c,
      modo: id,
      total: TOTAIS_POR_MODO[id] ?? c.total, // personalizado mantém o total atual
    }));
  };

  const toggle = (id) => setConfig(c => ({ ...c, areas: c.areas.includes(id) ? c.areas.filter(a => a !== id) : [...c.areas, id] }));

  return (
    <div className="practice-setup fade-up">
      <div className="practice-setup-header">
        <div>
          <div className="eyebrow">Estudo livre</div>
          <h1 className="page-h1">Vamos praticar.</h1>
          <p className="page-sub">Escolha como você quer estudar agora. Mantém os bons hábitos com sessões curtas e diárias.</p>
        </div>
        <button className="btn btn-quiet" onClick={onExit}>← Voltar à dashboard</button>
      </div>

      <div className="practice-setup-card">
        <div className="reg-section-title">Modo de estudo</div>
        <div className="practice-modes">
          {modos.map(m => (
            <button key={m.id}
                    className={`practice-mode ${config.modo === m.id ? 'is-active' : ''}`}
                    onClick={() => selecionarModo(m.id)}>
              <div className="practice-mode-ic">{m.icon}</div>
              <div className="practice-mode-label">{m.label}</div>
              <div className="practice-mode-meta">{m.meta}</div>
            </button>
          ))}
        </div>

        {config.modo === 'personalizado' && (
          <div style={{marginTop:24}}>
            <div className="reg-section-title">Número de questões</div>
            <div style={{display:'flex', alignItems:'center', gap:16, marginTop:8}}>
              <input
                type="range" min="5" max="80" step="5"
                value={config.total}
                onChange={e => setConfig(c => ({ ...c, total: parseInt(e.target.value) }))}
                style={{flex:1, accentColor:'var(--bordo)'}}
              />
              <span style={{fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'var(--text-lg)', minWidth:40, textAlign:'right'}}>
                {config.total}
              </span>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:'var(--text-sm)', color:'var(--text-muted)', marginTop:4}}>
              <span>5 mín.</span><span>80 máx.</span>
            </div>
          </div>
        )}

        <div className="reg-section-title" style={{marginTop:32}}>Trilhas de estudo {trilhaAtiva && <span className="chip chip-amarelo">{trilhaAtiva.nome}</span>}</div>
        <window.Premium.TrilhaPicker
          user={user}
          onUpgrade={onUpgrade}
          onPick={(t) => {
            setTrilhaAtiva(t);
            setConfig(c => ({ ...c, areas: t.areas })); // filtra as áreas pela trilha escolhida
          }}
        />

        <div className="reg-section-title" style={{marginTop:32}}>Áreas</div>
        <div className="reg-areas">
          {Object.values(AREAS).map(a => {
            const active = config.areas.includes(a.id);
            return (
              <button key={a.id} className={`reg-area ${active ? 'is-active' : ''}`} onClick={() => toggle(a.id)}>
                <span className="reg-area-ic">{a.icon}</span>
                <span className="reg-area-label">{a.label}</span>
                <span className="reg-area-check">{active ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>

        {erro && (
          <div className="login-error" style={{marginTop:16}}>
            <span>✕</span> {erro}
          </div>
        )}

        <div className="practice-setup-summary">
          <div>
            <div className="stat-label">Sua sessão</div>
            <div className="practice-summary-line">
              <strong>{config.total} questões</strong>
              <span>· {config.areas.length} área{config.areas.length !== 1 ? 's' : ''}</span>
              <span>· ≈ {config.total * 2} min</span>
              <span className="chip chip-amarelo">+{config.total * 15} XP esperados</span>
            </div>
          </div>
          <button className="btn btn-cta btn-lg" onClick={onStart} disabled={config.areas.length === 0 || loading}>
            {loading ? 'Preparando sessão…' : 'Começar →'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Runner ---------- */
function PracticeRunner({ session, setSession, onFinish, onExit }) {
  const { AREAS } = window.AppData;
  const q = session.questoes[session.idx];
  const total = session.questoes.length;

  const [escolhida,           setEscolhida]           = useStatePractice(null);
  const [confirmada,          setConfirmada]          = useStatePractice(false);
  const [confirmando,         setConfirmando]         = useStatePractice(false);
  const [feedbackAPI,         setFeedbackAPI]         = useStatePractice(null);
  const [tempo,               setTempo]               = useStatePractice(0);
  const [commentCache,        setCommentCache]        = useStatePractice(new Map());
  const [comentariosAbertos,  setComentariosAbertos]  = useStatePractice(false);
  const [comentarios,         setComentarios]         = useStatePractice([]);
  const [loadingComentarios,  setLoadingComentarios]  = useStatePractice(false);
  const [novoComentario,      setNovoComentario]      = useStatePractice('');
  const [enviandoComentario,  setEnviandoComentario]  = useStatePractice(false);

  useEffectPractice(() => {
    setEscolhida(null); setConfirmada(false); setConfirmando(false); setFeedbackAPI(null); setTempo(0);
    setComentariosAbertos(false); setComentarios([]); setNovoComentario('');
  }, [session.idx]);

  useEffectPractice(() => {
    if (confirmada) return;
    const t = setInterval(() => setTempo(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [confirmada, session.idx]);

  const confirmar = async () => {
    if (!escolhida || confirmando) return;
    setConfirmando(true);
    try {
      const resp = await window.apiFetch('/answers', {
        method: 'POST',
        body: JSON.stringify({ session_id: session.id, question_id: q.id, escolhida, tempo_s: tempo }),
      });
      setFeedbackAPI(resp);
      setConfirmada(true);
      setSession(s => ({
        ...s,
        respostas: [...s.respostas, { qId: q.id, escolhida, correta: resp.correta, acertou: resp.acertou, tempo }],
      }));
    } catch (err) {
      alert('Erro ao registrar resposta: ' + (err.error || 'tente novamente'));
    } finally {
      setConfirmando(false);
    }
  };

  const avancar = () => {
    if (session.idx + 1 >= total) onFinish();
    else setSession(s => ({ ...s, idx: s.idx + 1 }));
  };

  const enviarComentario = async () => {
    if (!novoComentario.trim()) return;
    setEnviandoComentario(true);
    try {
      const novo = await window.apiFetch(`/question-comments/${q.id}`, {
        method: 'POST',
        body: JSON.stringify({ corpo: novoComentario.trim() }),
      });
      const lista = [...comentarios, novo];
      setComentarios(lista);
      setCommentCache(m => { const nm = new Map(m); nm.set(q.id, lista); return nm; });
      setNovoComentario('');
    } catch (err) {
      alert(err.error || 'Erro ao enviar comentário');
    } finally {
      setEnviandoComentario(false);
    }
  };

  const abrirComentarios = async () => {
    if (commentCache.has(q.id)) {
      setComentarios(commentCache.get(q.id));
      setComentariosAbertos(true);
      return;
    }
    setLoadingComentarios(true);
    setComentariosAbertos(true);
    try {
      const data = await window.apiFetch(`/question-comments/${q.id}`);
      const lista = data.comments || [];
      setCommentCache(m => { const nm = new Map(m); nm.set(q.id, lista); return nm; });
      setComentarios(lista);
    } catch { setComentarios([]); }
    finally { setLoadingComentarios(false); }
  };

  const area    = AREAS[q.area_direito] || { label: q.area_direito || 'Área', icon: '⚖️', pillClass: 'area-pill-civil' };
  const tempoFmt = `${String(Math.floor(tempo/60)).padStart(2,'0')}:${String(tempo%60).padStart(2,'0')}`;
  const acertou  = feedbackAPI?.acertou;
  const correta  = feedbackAPI?.correta;

  return (
    <div className="practice-run fade-in">
      <header className="practice-run-bar">
        <button className="btn btn-quiet btn-sm" onClick={onExit}>✕ Sair da sessão</button>
        <div className="practice-run-progress">
          <span className="practice-run-progress-text">Questão {session.idx + 1} / {total}</span>
          <div className="practice-run-dots">
            {session.questoes.map((_, i) => {
              const resp = session.respostas[i];
              const cls = resp
                ? (resp.acertou ? 'done' : 'wrong')
                : (i === session.idx ? 'current' : '');
              return <div key={i} className={`practice-run-dot ${cls}`} />;
            })}
          </div>
        </div>
        <div className="practice-run-timer">
          <div className="timer-dot" />
          <span>{tempoFmt}</span>
        </div>
      </header>

      <div className="practice-run-content">
        <div className="practice-question-card fade-up" key={q.id}>
          <div className="qcard-header">
            <div className="qcard-meta">
              <span className="qcard-tag">{q.banca || 'OAB'} · {q.edicao || ''}</span>
              <span className="qcard-num">Q. {session.idx + 1} / {total}</span>
              {q.corrigido_por_humano && (
                <span className="chip chip-green" style={{fontSize:11}}>✓ Verificado</span>
              )}
            </div>
            <span className={`area-pill ${area.pillClass}`} style={{padding:'4px 10px'}}>
              {area.icon} {area.label}
            </span>
          </div>

          <div className="qcard-body">
            <p className="qcard-enunciado">{q.enunciado}</p>
            {q.comando && <p style={{color:'var(--text-secondary)', marginBottom:16}}>{q.comando}</p>}

            <div className="qcard-options">
              {q.opcoes.map(o => {
                let state = '';
                if (confirmada) {
                  if (o.letra === correta)   state = 'correct';
                  else if (o.letra === escolhida) state = 'wrong';
                  else state = 'dimmed';
                } else if (escolhida === o.letra) {
                  state = 'selected';
                }
                return (
                  <button key={o.letra}
                          className={`qcard-option ${state}`}
                          onClick={() => !confirmada && setEscolhida(o.letra)}
                          disabled={confirmada}>
                    <div className="option-letter">{o.letra}</div>
                    <div className="option-text">{o.texto}</div>
                    {confirmada && o.letra === correta   && <span className="option-state">✓ gabarito</span>}
                    {confirmada && o.letra === escolhida && o.letra !== correta && <span className="option-state">sua resposta</span>}
                  </button>
                );
              })}
            </div>

            {confirmada && (
              <div className={`qcard-feedback fade-up ${acertou ? 'is-correct' : 'is-wrong'}`}>
                <div className="qcard-feedback-head">
                  <span className="qcard-feedback-ic">{acertou ? '✓' : '✕'}</span>
                  <div>
                    <div className="qcard-feedback-title">
                      {acertou ? 'Resposta correta!' : 'Quase lá — não foi dessa vez'}
                    </div>
                    <div className="qcard-feedback-sub">
                      Gabarito: letra <strong>{correta}</strong>
                    </div>
                  </div>
                  {acertou && <span className="chip chip-amarelo">+15 XP</span>}
                </div>

                <div style={{marginTop:12}}>
                  <button className="btn btn-quiet btn-sm" onClick={abrirComentarios}>
                    Comentários ({q.comment_count ?? 0})
                  </button>
                </div>

                {comentariosAbertos && (
                  <div style={{marginTop:12}}>
                    {loadingComentarios && (
                      <span style={{color:'var(--text-muted)', fontSize:'var(--text-sm)'}}>Carregando…</span>
                    )}
                    {!loadingComentarios && comentarios.length === 0 && (
                      <div style={{color:'var(--text-muted)', fontSize:'var(--text-sm)', marginBottom:10}}>Nenhum comentário ainda. Seja o primeiro!</div>
                    )}
                    {!loadingComentarios && comentarios.map(c => (
                      <div key={c.id} style={{borderTop:'1px solid rgba(255,255,255,0.12)', paddingTop:10, marginTop:10}}>
                        <div style={{fontSize:11, color:'var(--text-muted)', marginBottom:4}}>
                          {c.autor_nome || 'Usuário'} · {new Date(c.criado_em).toLocaleDateString('pt-BR')}
                        </div>
                        <div style={{fontSize:'var(--text-sm)'}}>{c.corpo}</div>
                      </div>
                    ))}
                    {!loadingComentarios && (
                      <div style={{display:'flex', gap:8, marginTop:12, borderTop:'1px solid rgba(255,255,255,0.12)', paddingTop:12}}>
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
            )}
          </div>

          <div className="qcard-footer-bar">
            <div className="qcard-footer-meta">
              {q.dificuldade && <span className="chip chip-neutral">Dificuldade: {q.dificuldade}</span>}
              {confirmada && (
                <span className={`chip ${acertou ? 'chip-green' : 'chip-bordo'}`}>
                  ⏱ Respondida em {tempo}s
                </span>
              )}
            </div>
            {!confirmada ? (
              <button className="btn btn-primary btn-lg" disabled={!escolhida || confirmando} onClick={confirmar}>
                {confirmando ? 'Registrando…' : 'Confirmar resposta →'}
              </button>
            ) : (
              <button className="btn btn-primary btn-lg" onClick={avancar}>
                {session.idx + 1 >= total ? 'Ver resultado →' : 'Próxima questão →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Result ---------- */
function PracticeResult({ session, onRetry, onExit, onNavigate, onUserUpdate }) {
  const { AREAS } = window.AppData;
  const [resultado,  setResultado]  = useStatePractice(null);
  const [concluindo, setConcluindo] = useStatePractice(true);

  useEffectPractice(() => {
    window.apiFetch(`/sessions/${session.id}/concluir`, { method: 'PATCH' })
      .then(r => {
        setResultado(r);
        // Atualiza XP/streak na sidebar sem forçar logout
        if (onUserUpdate) {
          window.apiFetch('/auth/me').then(onUserUpdate).catch(() => {});
        }
      })
      .catch(console.error)
      .finally(() => setConcluindo(false));
  }, []);

  const total      = session.respostas.length;
  const acertos    = resultado?.acertos    ?? session.respostas.filter(r => r.acertou).length;
  const xp         = resultado?.xp_ganho   ?? (acertos * 15 + (acertos === total ? 30 : 0));
  const tempoTotal = session.respostas.reduce((acc, r) => acc + r.tempo, 0);
  const pct        = total > 0 ? Math.round(acertos / total * 100) : 0;

  const msg =
    pct >= 80 ? 'Excelente sessão! Você está afiado.' :
    pct >= 60 ? 'Bom desempenho — continue assim.' :
    pct >= 40 ? 'Dá pra melhorar. Revise os erros com calma.' :
                'Hora de revisar a teoria antes da próxima.';

  return (
    <div className="practice-result fade-up">
      <div className="practice-result-hero">
        <div className="practice-result-hero-glow" />
        <div className="eyebrow" style={{color:'var(--amarelo)'}}>Sessão concluída</div>
        <h1 className="practice-result-title">{msg}</h1>

        <div className="practice-result-score">
          <div className="practice-result-circle">
            <svg viewBox="0 0 120 120" className="practice-result-svg">
              <circle cx="60" cy="60" r="52" stroke="rgba(245,240,235,.15)" strokeWidth="10" fill="none" />
              <circle cx="60" cy="60" r="52"
                stroke={pct >= 70 ? 'var(--amarelo)' : 'var(--bordo)'}
                strokeWidth="10" fill="none"
                strokeDasharray={`${pct * 3.27} 327`}
                strokeLinecap="round"
                transform="rotate(-90 60 60)" />
            </svg>
            <div className="practice-result-circle-inner">
              <div className="practice-result-pct">{pct}%</div>
              <div className="practice-result-pct-lbl">acerto</div>
            </div>
          </div>
          <div className="practice-result-numbers">
            <div>
              <div className="stat-label" style={{color:'rgba(245,240,235,.5)'}}>Acertos</div>
              <div className="practice-result-big">{acertos}<span>/{total}</span></div>
            </div>
            <div>
              <div className="stat-label" style={{color:'rgba(245,240,235,.5)'}}>XP ganhos</div>
              <div className="practice-result-big" style={{color:'var(--amarelo)'}}>
                {concluindo ? '…' : `+${xp}`}
              </div>
            </div>
            <div>
              <div className="stat-label" style={{color:'rgba(245,240,235,.5)'}}>Tempo total</div>
              <div className="practice-result-big">{Math.floor(tempoTotal/60)}<span>min {tempoTotal%60}s</span></div>
            </div>
          </div>
        </div>

        <div className="practice-result-cta">
          <button className="btn btn-cta btn-lg" onClick={onRetry}>⚡ Nova sessão</button>
          <button className="btn btn-ghost" style={{borderColor:'rgba(245,240,235,.3)', color:'#fff'}} onClick={() => onNavigate('stats')}>
            Ver estatísticas completas
          </button>
        </div>
      </div>

      <div className="practice-result-list-wrap">
        <h2 className="dash-card-title">Revisão das questões</h2>
        <p className="dash-card-sub">Confira o gabarito de cada questão respondida.</p>
        <div className="practice-result-list">
          {session.respostas.map((r, i) => {
            const q    = session.questoes.find(x => x.id === r.qId);
            const ok   = r.acertou;
            const area = AREAS[q?.area_direito] || { label: q?.area_direito || 'Área', icon: '⚖️', pillClass: 'area-pill-civil' };
            return (
              <div key={i} className={`practice-result-row ${ok ? 'ok' : 'bad'}`}>
                <div className="practice-result-row-num">{i + 1}</div>
                <div className="practice-result-row-icon">{ok ? '✓' : '✕'}</div>
                <div className="practice-result-row-main">
                  <div className="practice-result-row-q">{q?.enunciado}</div>
                  <div className="practice-result-row-meta">
                    <span className={`area-pill ${area.pillClass}`} style={{padding:'2px 8px', fontSize:'10px'}}>{area.icon} {area.label}</span>
                    <span>Sua resposta: <strong>{r.escolhida}</strong></span>
                    <span>Gabarito: <strong>{r.correta}</strong></span>
                    <span>⏱ {r.tempo}s</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// PracticeRunner/PracticeResult/formatarQuestao são reaproveitados pela trilha
// (trilha.jsx) para rodar um checkpoint pelo mesmo fluxo de respostas.
window.Practice = { PracticeFlow, PracticeRunner, PracticeResult, formatarQuestao };
