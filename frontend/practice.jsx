/* global React */
const { useState: useStatePractice, useEffect: useEffectPractice, useMemo: useMemoPractice } = React;

/* =========================================================
   Jornada de prática — setup → questionário → resultado
   ========================================================= */
function PracticeFlow({ user, onExit, onNavigate }) {
  const { QUESTIONS } = window.AppData;
  const [phase, setPhase] = useStatePractice('setup'); // setup | run | result
  const [config, setConfig] = useStatePractice({
    modo: 'rapida', // rapida | simulado | personalizado
    areas: ['civil', 'const', 'etica'],
    total: 5,
  });
  const [session, setSession] = useStatePractice(null);

  const startSession = () => {
    const list = QUESTIONS.slice(0, config.total);
    setSession({
      questoes: list,
      respostas: [], // {qId, escolhida, correta, tempo}
      idx: 0,
    });
    setPhase('run');
  };

  const finishSession = () => setPhase('result');

  if (phase === 'setup')  return <PracticeSetup user={user} config={config} setConfig={setConfig} onStart={startSession} onExit={onExit} />;
  if (phase === 'run')    return <PracticeRunner session={session} setSession={setSession} onFinish={finishSession} onExit={onExit} />;
  if (phase === 'result') return <PracticeResult session={session} onRetry={() => setPhase('setup')} onExit={onExit} onNavigate={onNavigate} />;
  return null;
}

/* ---------- Setup ---------- */
function PracticeSetup({ user, config, setConfig, onStart, onExit }) {
  const { AREAS } = window.AppData;
  const modos = [
    { id: 'rapida',        label: 'Sessão rápida',  meta: '5 questões · ~10 min', icon: '⚡' },
    { id: 'simulado',      label: 'Simulado',       meta: '80 questões · 4h',     icon: '🎯' },
    { id: 'personalizado', label: 'Personalizado',  meta: 'Você escolhe tudo',     icon: '⚙' },
  ];
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
                    onClick={() => setConfig(c => ({ ...c, modo: m.id }))}>
              <div className="practice-mode-ic">{m.icon}</div>
              <div className="practice-mode-label">{m.label}</div>
              <div className="practice-mode-meta">{m.meta}</div>
            </button>
          ))}
        </div>

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

        <div className="practice-setup-summary">
          <div>
            <div className="stat-label">Sua sessão</div>
            <div className="practice-summary-line">
              <strong>{config.total} questões</strong>
              <span>· {config.areas.length} áreas</span>
              <span>· ≈ {config.total * 2} min</span>
              <span className="chip chip-amarelo">+{config.total * 15} XP esperados</span>
            </div>
          </div>
          <button className="btn btn-cta btn-lg" onClick={onStart} disabled={config.areas.length === 0}>
            Começar →
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
  const [escolhida, setEscolhida] = useStatePractice(null);
  const [confirmada, setConfirmada] = useStatePractice(false);
  const [tempo, setTempo] = useStatePractice(0);

  useEffectPractice(() => {
    setEscolhida(null); setConfirmada(false); setTempo(0);
  }, [session.idx]);

  useEffectPractice(() => {
    if (confirmada) return;
    const t = setInterval(() => setTempo(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [confirmada, session.idx]);

  const confirmar = () => {
    if (!escolhida) return;
    setConfirmada(true);
    setSession(s => ({
      ...s,
      respostas: [...s.respostas, { qId: q.id, escolhida, correta: q.correta, tempo, area: q.area }],
    }));
  };

  const avancar = () => {
    if (session.idx + 1 >= total) onFinish();
    else setSession(s => ({ ...s, idx: s.idx + 1 }));
  };

  const area = AREAS[q.area];
  const tempoFmt = `${String(Math.floor(tempo/60)).padStart(2,'0')}:${String(tempo%60).padStart(2,'0')}`;
  const acertou = confirmada && escolhida === q.correta;

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
                ? (resp.escolhida === resp.correta ? 'done' : 'wrong')
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
              <span className="qcard-tag">{q.banca} · {q.edicao}</span>
              <span className="qcard-num">Q. {session.idx + 1} / {total}</span>
            </div>
            <span className={`area-pill ${area.pillClass}`} style={{padding:'4px 10px'}}>
              {area.icon} {area.label}
            </span>
          </div>

          <div className="qcard-body">
            <div className="qcard-area-mono">{q.artigo}</div>
            <p className="qcard-enunciado">{q.enunciado}</p>

            <div className="qcard-options">
              {q.opcoes.map(o => {
                let state = '';
                if (confirmada) {
                  if (o.letra === q.correta) state = 'correct';
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
                    {confirmada && o.letra === q.correta && <span className="option-state">✓ gabarito</span>}
                    {confirmada && o.letra === escolhida && o.letra !== q.correta && <span className="option-state">sua resposta</span>}
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
                      Gabarito: letra <strong>{q.correta}</strong> · {q.artigo}
                    </div>
                  </div>
                  {acertou && <span className="chip chip-amarelo">+15 XP</span>}
                </div>
                <p className="qcard-feedback-body">{q.explicacao}</p>
                <div className="qcard-feedback-actions">
                  <button className="btn btn-ghost btn-sm">🔖 Salvar para revisão</button>
                  <button className="btn btn-quiet btn-sm">Ver legislação</button>
                </div>
              </div>
            )}
          </div>

          <div className="qcard-footer-bar">
            <div className="qcard-footer-meta">
              <span className="chip chip-neutral">Dificuldade: {q.dificuldade}</span>
              {confirmada && (
                <span className={`chip ${acertou ? 'chip-green' : 'chip-bordo'}`}>
                  ⏱ Respondida em {tempo}s
                </span>
              )}
            </div>
            {!confirmada ? (
              <button className="btn btn-primary btn-lg" disabled={!escolhida} onClick={confirmar}>
                Confirmar resposta →
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
function PracticeResult({ session, onRetry, onExit, onNavigate }) {
  const { AREAS, QUESTIONS } = window.AppData;
  const total = session.respostas.length;
  const acertos = session.respostas.filter(r => r.escolhida === r.correta).length;
  const pct = Math.round(acertos / total * 100);
  const tempoTotal = session.respostas.reduce((acc, r) => acc + r.tempo, 0);
  const xp = acertos * 15 + (acertos === total ? 30 : 0);

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
              <div className="practice-result-big" style={{color:'var(--amarelo)'}}>+{xp}</div>
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
        <p className="dash-card-sub">Toque para abrir o gabarito comentado e revisar com calma.</p>
        <div className="practice-result-list">
          {session.respostas.map((r, i) => {
            const q = QUESTIONS.find(x => x.id === r.qId);
            const ok = r.escolhida === r.correta;
            const area = AREAS[q.area];
            return (
              <div key={i} className={`practice-result-row ${ok ? 'ok' : 'bad'}`}>
                <div className="practice-result-row-num">{i + 1}</div>
                <div className="practice-result-row-icon">{ok ? '✓' : '✕'}</div>
                <div className="practice-result-row-main">
                  <div className="practice-result-row-q">{q.enunciado}</div>
                  <div className="practice-result-row-meta">
                    <span className={`area-pill ${area.pillClass}`} style={{padding:'2px 8px', fontSize:'10px'}}>{area.icon} {area.label}</span>
                    <span>Sua resposta: <strong>{r.escolhida}</strong></span>
                    <span>Gabarito: <strong>{r.correta}</strong></span>
                    <span>⏱ {r.tempo}s</span>
                  </div>
                </div>
                <button className="btn btn-quiet btn-sm">Revisar →</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

window.Practice = { PracticeFlow };
