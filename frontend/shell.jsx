/* global React */
const { useState: useStateShell, useEffect: useEffectShell } = React;

/* =========================================================
   App Shell — sidebar + topbar do app autenticado
   ========================================================= */
function AppShell({ user, page, onNavigate, onPracticeStart, onLogout, children }) {
  const [showUserMenu, setShowUserMenu] = useStateShell(false);

  const navItems = [
    { id: 'dashboard', label: 'Início',       icon: '◆' },
    { id: 'practice',  label: 'Praticar',     icon: '▶' },
    { id: 'stats',     label: 'Estatísticas', icon: '◇' },
    ...(user?.role === 'admin' ? [{ id: 'admin', label: 'Admin', icon: '⚙' }] : []),
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-mark">A</div>
          <div>
            <div className="sidebar-brand-name">Aprovado OAB</div>
            <div className="sidebar-brand-meta">{user?.edicao || 'OAB'} · {user?.minutosDia || 30}min/dia</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button key={item.id}
                    className={`sidebar-item ${page === item.id ? 'is-active' : ''}`}
                    onClick={() => onNavigate(item.id)}>
              <span className="sidebar-item-ic">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <button className="sidebar-cta" onClick={onPracticeStart}>
          <span>⚡</span>
          <div>
            <div>Iniciar sessão</div>
            <span>{user?.minutosDia || 30} min · 10 questões</span>
          </div>
        </button>

        <div className="sidebar-user" style={{ position: 'relative' }}>
          <div className="sidebar-avatar">{(user?.nome?.[0] || 'E').toUpperCase()}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.nome?.split(' ')[0] || 'Estudante'}</div>
            <div className="sidebar-user-meta">⚡ {user?.xp || 0} XP · 🔥 {user?.streak || 0}d</div>
          </div>
          <button className="sidebar-user-more" onClick={() => setShowUserMenu(m => !m)}>⋯</button>
          {showUserMenu && (
            <div className="sidebar-user-popup fade-up">
              <button className="sidebar-user-popup-item logout" onClick={() => { setShowUserMenu(false); onLogout?.(); }}>
                Sair da conta
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="shell-main" onClick={() => setShowUserMenu(false)}>
        {children}
      </main>
    </div>
  );
}

/* =========================================================
   Dashboard
   ========================================================= */
function Dashboard({ user, onPracticeStart, onNavigate }) {
  const { AREAS } = window.AppData;
  const firstName = (user?.nome || 'Estudante').split(' ')[0];

  const [overview, setOverview] = useStateShell(null);
  const [areas,    setAreas]    = useStateShell([]);
  const [spark,    setSpark]    = useStateShell([0,0,0,0,0,0,0]);
  const [loading,  setLoading]  = useStateShell(true);

  useEffectShell(() => {
    setLoading(true);
    Promise.all([
      window.apiFetch('/stats/overview'),
      window.apiFetch('/stats/areas'),
      window.apiFetch('/stats/last-7-days'),
    ])
      .then(([ov, ar, sp]) => { setOverview(ov); setAreas(ar); setSpark(sp); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const meta     = overview?.metaDiaria || { feito: 0, alvo: 1 };
  const metaPct  = Math.round((meta.feito / Math.max(meta.alvo, 1)) * 100);
  const topAreas = [...areas].sort((a, b) => b.pct - a.pct).slice(0, 4);

  const diasParaProva = (() => {
    if (!user?.dataProva) return null;
    const diff = Math.ceil((new Date(user.dataProva) - Date.now()) / 864e5);
    return diff > 0 ? diff : null;
  })();

  return (
    <div className="dash fade-up">
      <header className="dash-top">
        <div>
          <div className="eyebrow">{saudacao()} · {new Date().toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' })}</div>
          <h1 className="page-h1">Olá, {firstName}.</h1>
          <p className="page-sub">
            {diasParaProva
              ? <>Faltam <strong>{diasParaProva} dias</strong> para o próximo exame. </>
              : ''}
            Hoje sua meta é {meta.alvo} questões.
          </p>
        </div>
        <div className="dash-top-actions">
          <button className="btn btn-cta btn-lg" onClick={onPracticeStart}>⚡ Continuar estudo</button>
        </div>
      </header>

      <section className="dash-row dash-row-hero">
        <div className="dash-continue">
          <div className="dash-continue-stripe" />
          <div className="dash-continue-body">
            <div className="eyebrow" style={{color:'var(--amarelo)'}}>Sua próxima sessão</div>
            <h2 className="dash-continue-title">Sessão de prática</h2>
            <p className="dash-continue-sub">10 questões · ≈ {user?.minutosDia || 30} min · adaptado ao seu desempenho</p>
            <div className="dash-continue-meta">
              <span className="chip chip-amarelo">+150 XP esperados</span>
              <span className="chip chip-neutral">Dificuldade média</span>
            </div>
            <div className="dash-continue-cta">
              <button className="btn btn-primary btn-lg" onClick={onPracticeStart}>Começar agora →</button>
              <button className="btn btn-ghost" onClick={onPracticeStart}>Personalizar sessão</button>
            </div>
          </div>
        </div>

        <div className="streak-card">
          <div className="streak-eyebrow">Sequência atual</div>
          <div className="streak-number">{user?.streak || 0}</div>
          <div className="streak-label">dias consecutivos de estudo</div>
          <div className="streak-days">
            {['seg','ter','qua','qui','sex','sáb','dom'].map((d, i) => {
              const today = new Date().getDay();
              const dayIndex = [1,2,3,4,5,6,0][i];
              const isPast  = dayIndex < today;
              const isToday = dayIndex === today;
              const cls = isPast ? 'done' : isToday ? 'today' : 'pending';
              return (
                <div key={d} className="streak-day">
                  <div className={`streak-day-circle ${cls}`}>{cls === 'done' ? '✓' : cls === 'today' ? '●' : '–'}</div>
                  <div className="streak-day-name">{d}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="dash-row dash-stats">
        <div className="stat-card accent-bordo">
          <div className="stat-label">Acertos</div>
          <div className="stat-value" style={{color:'var(--bordo)'}}>{loading ? '—' : `${overview?.acertosPct ?? 0}%`}</div>
          <div className="stat-sub">Média geral</div>
        </div>
        <div className="stat-card accent-azul">
          <div className="stat-label">Questões</div>
          <div className="stat-value" style={{color:'var(--azul)'}}>{loading ? '—' : (overview?.questoesRespondidas ?? 0).toLocaleString('pt-BR')}</div>
          <div className="stat-sub">Respondidas no total</div>
        </div>
        <div className="stat-card accent-amarelo">
          <div className="stat-label">XP Total</div>
          <div className="stat-value" style={{color:'var(--amarelo-dark)'}}>{loading ? '—' : (overview?.xpTotal ?? 0).toLocaleString('pt-BR')}</div>
          <div className="stat-sub">+{overview?.xpHoje ?? 0} hoje</div>
        </div>
        <div className="stat-card accent-green">
          <div className="stat-label">Meta diária</div>
          <div className="stat-value" style={{color:'var(--green-dark)'}}>
            {loading ? '—' : <>{meta.feito}<span style={{color:'var(--text-muted)', fontSize:'var(--text-lg)'}}>/{meta.alvo}</span></>}
          </div>
          <div className="stat-sub">{metaPct}% concluída hoje</div>
        </div>
      </section>

      <section className="dash-row dash-row-bottom">
        <div className="dash-card">
          <div className="dash-card-head">
            <div>
              <h3 className="dash-card-title">Desempenho por área</h3>
              <p className="dash-card-sub">Onde você está forte e onde precisa apertar.</p>
            </div>
            <button className="btn btn-quiet btn-sm" onClick={() => onNavigate('stats')}>Ver tudo →</button>
          </div>
          <div className="dash-areas-list">
            {loading && <div style={{color:'var(--text-muted)', fontSize:'var(--text-sm)'}}>Carregando…</div>}
            {!loading && topAreas.length === 0 && (
              <div style={{color:'var(--text-muted)', fontSize:'var(--text-sm)'}}>Nenhuma questão respondida ainda.</div>
            )}
            {topAreas.map(s => {
              const area = AREAS[s.area] || { label: s.area, icon: '⚖️', pillClass: 'area-pill-civil' };
              const fillClass = s.pct >= 80 ? 'green-fill' : s.pct >= 65 ? 'amarelo-fill' : s.pct >= 50 ? '' : 'azul-fill';
              return (
                <div key={s.area} className="dash-area-row">
                  <span className={`area-pill ${area.pillClass}`}>{area.icon} {area.label}</span>
                  <div className="dash-area-bar">
                    <div className="progress-track" style={{marginBottom:0}}>
                      <div className={`progress-fill ${fillClass}`} style={{width: s.pct + '%'}} />
                    </div>
                  </div>
                  <div className="dash-area-pct">{s.pct}%</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-head">
            <div>
              <h3 className="dash-card-title">Últimos 7 dias</h3>
              <p className="dash-card-sub">% de acertos por dia</p>
            </div>
          </div>
          <Sparkline data={spark} />
          <div className="dash-spark-labels">
            {['seg','ter','qua','qui','sex','sáb','dom'].map(d => <span key={d}>{d}</span>)}
          </div>
        </div>
      </section>
    </div>
  );
}

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function Sparkline({ data }) {
  const w = 360, h = 110, pad = 8;
  const max = Math.max(...data, 1) + 5;
  const min = Math.max(Math.min(...data) - 5, 0);
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    return [x, y];
  });
  const linePath = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const areaPath = linePath + ` L${pts[pts.length-1][0]},${h-pad} L${pts[0][0]},${h-pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="dash-sparkline">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--bordo)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--bordo)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkGrad)" />
      <path d={linePath} fill="none" stroke="var(--bordo)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="4" fill="var(--bg-surface)" stroke="var(--bordo)" strokeWidth="2" />
          <text x={p[0]} y={p[1] - 12} textAnchor="middle" fontSize="10" fontFamily="DM Mono" fill="var(--text-secondary)">{data[i]}%</text>
        </g>
      ))}
    </svg>
  );
}

window.Shell = { AppShell, Dashboard };
