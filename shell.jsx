/* global React */
const { useState: useStateShell } = React;

/* =========================================================
   App Shell — sidebar + topbar do app autenticado
   ========================================================= */
function AppShell({ user, page, onNavigate, onPracticeStart, children }) {
  const navItems = [
    { id: 'dashboard', label: 'Início',        icon: '◆' },
    { id: 'practice',  label: 'Praticar',      icon: '▶' },
    { id: 'stats',     label: 'Estatísticas',  icon: '◇' },
    { id: 'review',    label: 'Histórico',     icon: '☷' },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-mark">A</div>
          <div>
            <div className="sidebar-brand-name">Aprovado OAB</div>
            <div className="sidebar-brand-meta">XLI · {user.minutosDia}min/dia</div>
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
            <span>{user.minutosDia} min · 10 questões</span>
          </div>
        </button>

        <div className="sidebar-user">
          <div className="sidebar-avatar">{(user.nome[0] || 'E').toUpperCase()}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user.nome.split(' ')[0]}</div>
            <div className="sidebar-user-meta">⚡ {user.xp} XP · 🔥 {user.streak}d</div>
          </div>
          <button className="sidebar-user-more">⋯</button>
        </div>
      </aside>

      <main className="shell-main">
        {children}
      </main>
    </div>
  );
}

/* =========================================================
   Dashboard
   ========================================================= */
function Dashboard({ user, onPracticeStart, onNavigate }) {
  const { STATS_OVERVIEW, STATS_AREAS, AREAS, SPARK_7D } = window.AppData;
  const meta = STATS_OVERVIEW.metaDiaria;
  const metaPct = Math.round(meta.feito / meta.alvo * 100);
  const firstName = user.nome.split(' ')[0] || 'Estudante';

  return (
    <div className="dash fade-up">
      <header className="dash-top">
        <div>
          <div className="eyebrow">{saudacao()} · sex, 15 mai</div>
          <h1 className="page-h1">Olá, {firstName}.</h1>
          <p className="page-sub">Faltam <strong>127 dias</strong> para o próximo exame. Hoje sua meta é {meta.alvo} questões.</p>
        </div>
        <div className="dash-top-actions">
          <button className="btn btn-secondary">Ver plano semanal</button>
          <button className="btn btn-cta btn-lg" onClick={onPracticeStart}>⚡ Continuar estudo</button>
        </div>
      </header>

      <section className="dash-row dash-row-hero">
        <div className="dash-continue">
          <div className="dash-continue-stripe" />
          <div className="dash-continue-body">
            <div className="eyebrow" style={{color:'var(--amarelo)'}}>Sua próxima sessão</div>
            <h2 className="dash-continue-title">Responsabilidade civil — bloco 2</h2>
            <p className="dash-continue-sub">10 questões · ≈ {user.minutosDia} min · adaptado ao seu desempenho</p>

            <div className="dash-continue-meta">
              <span className="chip chip-amarelo">+150 XP esperados</span>
              <span className="chip chip-azul">FGV · OAB recente</span>
              <span className="chip chip-neutral">Dificuldade média</span>
            </div>

            <div className="dash-continue-areas">
              <span className={`area-pill ${AREAS.civil.pillClass}`}>{AREAS.civil.icon} Direito Civil</span>
              <span className={`area-pill ${AREAS.const.pillClass}`}>{AREAS.const.icon} Constitucional</span>
            </div>

            <div className="dash-continue-cta">
              <button className="btn btn-primary btn-lg" onClick={onPracticeStart}>Começar agora →</button>
              <button className="btn btn-ghost">Personalizar sessão</button>
            </div>
          </div>
        </div>

        <div className="streak-card">
          <div className="streak-eyebrow">Sequência atual</div>
          <div className="streak-number">{user.streak}</div>
          <div className="streak-label">dias consecutivos de estudo</div>
          <div className="streak-days">
            {['seg','ter','qua','qui','sex','sáb','dom'].map((d, i) => {
              const cls = i < 4 ? 'done' : i === 4 ? 'today' : 'pending';
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
          <div className="stat-value" style={{color:'var(--bordo)'}}>{STATS_OVERVIEW.acertosPct}%</div>
          <div className="stat-sub">Média geral · ↑ 4pp na semana</div>
        </div>
        <div className="stat-card accent-azul">
          <div className="stat-label">Questões</div>
          <div className="stat-value" style={{color:'var(--azul)'}}>{STATS_OVERVIEW.questoesRespondidas.toLocaleString('pt-BR')}</div>
          <div className="stat-sub">Respondidas no total</div>
        </div>
        <div className="stat-card accent-amarelo">
          <div className="stat-label">XP Total</div>
          <div className="stat-value" style={{color:'var(--amarelo-dark)'}}>{STATS_OVERVIEW.xpTotal.toLocaleString('pt-BR')}</div>
          <div className="stat-sub">+{STATS_OVERVIEW.xpHoje} hoje</div>
        </div>
        <div className="stat-card accent-green">
          <div className="stat-label">Meta diária</div>
          <div className="stat-value" style={{color:'var(--green-dark)'}}>{meta.feito}<span style={{color:'var(--text-muted)', fontSize:'var(--text-lg)'}}>/{meta.alvo}</span></div>
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
            {STATS_AREAS.slice(0, 4).map(s => {
              const area = AREAS[s.area];
              const fillClass =
                s.pct >= 80 ? 'green-fill' :
                s.pct >= 65 ? 'amarelo-fill' :
                s.pct >= 50 ? '' : 'azul-fill';
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
            <span className="chip chip-green">↑ tendência boa</span>
          </div>
          <Sparkline data={SPARK_7D} />
          <div className="dash-spark-labels">
            {['sáb','dom','seg','ter','qua','qui','sex'].map(d => <span key={d}>{d}</span>)}
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
  const max = Math.max(...data) + 5;
  const min = Math.min(...data) - 5;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
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
