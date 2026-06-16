/* global React */
const { useState: useStateShell, useEffect: useEffectShell, useCallback: useCallbackShell } = React;

/* =========================================================
   App Shell — sidebar + topbar do app autenticado
   ========================================================= */
function AppShell({ user, page, onNavigate, onPracticeStart, onLogout, onUserUpdate, onUpgrade, onToggleTheme, theme, children }) {
  const [showUserMenu,    setShowUserMenu]    = useStateShell(false);
  const [showProfile,     setShowProfile]     = useStateShell(false);
  const [notifications,   setNotifications]   = useStateShell([]);
  const [naoLidas,        setNaoLidas]        = useStateShell(0);
  const [showNotifList,   setShowNotifList]   = useStateShell(false);

  useEffectShell(() => {
    window.apiFetch('/notifications')
      .then(d => { setNotifications(d.notifications || []); setNaoLidas(d.nao_lidas || 0); })
      .catch(() => {});
  }, []);

  const abrirNotificacoes = () => {
    setShowNotifList(true);
    setShowUserMenu(false);
    if (naoLidas > 0) {
      window.apiFetch('/notifications/read-all', { method: 'PATCH' })
        .then(() => setNaoLidas(0))
        .catch(() => {});
    }
  };

  const navItems = [
    { id: 'dashboard',  label: 'Início',       icon: '◆' },
    { id: 'practice',   label: 'Praticar',     icon: '▶' },
    { id: 'trilha',     label: 'Trilha',       icon: '🛤️' },
    { id: 'stats',      label: 'Estatísticas', icon: '◇' },
    ...(user?.role === 'admin' ? [
      { id: 'admin', label: 'Admin', icon: '⚙' },
    ] : []),
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px' }}>
          <window.Premium.CoinsBadge user={user} />
          <button
            title={user?.plan === 'premium' || user?.role === 'admin' ? 'Alternar tema' : 'Tema escuro é Premium'}
            onClick={() => (user?.plan === 'premium' || user?.role === 'admin') ? onToggleTheme?.() : onUpgrade?.()}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>
            {(user?.plan === 'premium' || user?.role === 'admin') ? (theme === 'dark' ? '☀' : '🌙') : '🌙🔒'}
          </button>
        </div>

        {user?.plan !== 'premium' && user?.role !== 'admin' && (
          <button className="sidebar-cta" onClick={onUpgrade}
                  style={{ background: 'linear-gradient(135deg, var(--amarelo), var(--amarelo-dark))' }}>
            <span>✨</span>
            <div>
              <div>Seja Premium</div>
              <span>stats · trilhas · sem anúncios</span>
            </div>
          </button>
        )}

        <div
          className="sidebar-user"
          style={{ position: 'relative' }}
          onClick={(e) => { e.stopPropagation(); setShowUserMenu(m => !m); setShowNotifList(false); }}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && setShowUserMenu(m => !m)}
        >
          <div className="sidebar-avatar" style={{position:'relative'}}>
            {(user?.nome?.[0] || 'E').toUpperCase()}
            {naoLidas > 0 && (
              <span style={{
                position:'absolute', top:-4, right:-4,
                background:'var(--bordo)', color:'#fff',
                borderRadius:'50%', width:16, height:16,
                fontSize:10, fontWeight:700,
                display:'flex', alignItems:'center', justifyContent:'center',
                lineHeight:1,
              }}>{naoLidas > 9 ? '9+' : naoLidas}</span>
            )}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.nome?.split(' ')[0] || 'Estudante'}</div>
            <div className="sidebar-user-meta">⚡ {user?.xp || 0} XP · 🔥 {user?.streak || 0}d</div>
          </div>
          <span className="sidebar-user-more">⋯</span>
          {showUserMenu && (
            <div className="sidebar-user-popup fade-up">
              {naoLidas > 0 && (
                <button className="sidebar-user-popup-item" onClick={(e) => { e.stopPropagation(); abrirNotificacoes(); }}>
                  🔔 {naoLidas} notificação{naoLidas !== 1 ? 'ões' : ''}
                </button>
              )}
              <button className="sidebar-user-popup-item" onClick={(e) => { e.stopPropagation(); setShowUserMenu(false); setShowProfile(true); }}>
                Editar perfil
              </button>
              <button className="sidebar-user-popup-item logout" onClick={(e) => { e.stopPropagation(); setShowUserMenu(false); onLogout?.(); }}>
                Sair da conta
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="shell-main" onClick={() => setShowUserMenu(false)}>
        {children}
      </main>

      {showProfile && (
        <UserProfilePanel
          user={user}
          onClose={() => setShowProfile(false)}
          onUserUpdate={onUserUpdate}
        />
      )}

      {showNotifList && (
        <NotificacoesPanel
          notifications={notifications}
          onClose={() => setShowNotifList(false)}
        />
      )}
    </div>
  );
}

/* =========================================================
   Dashboard
   ========================================================= */
function Dashboard({ user, onPracticeStart, onNavigate }) {
  const { AREAS } = window.AppData;
  const firstName = (user?.nome || 'Estudante').split(' ')[0];

  const [overview,   setOverview]   = useStateShell(null);
  const [areas,      setAreas]      = useStateShell([]);
  const [spark,      setSpark]      = useStateShell([0,0,0,0,0,0,0]);
  const [proximaSessao, setProximaSessao] = useStateShell(null);
  const [loading,    setLoading]    = useStateShell(true);

  useEffectShell(() => {
    setLoading(true);
    Promise.all([
      window.apiFetch('/stats/overview'),
      window.apiFetch('/stats/areas'),
      window.apiFetch('/stats/last-7-days'),
      window.apiFetch('/stats/study-plan/next'),
    ])
      .then(([ov, ar, sp, prox]) => { setOverview(ov); setAreas(ar); setSpark(sp); setProximaSessao(prox); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const meta     = overview?.metaDiaria || { feito: 0, alvo: 1 };
  const metaPct  = Math.round((meta.feito / Math.max(meta.alvo, 1)) * 100);
  const topAreas = [...areas].sort((a, b) => b.pct - a.pct).slice(0, 4);

  const MENSAGENS_META = [
    'Meta batida! Você está construindo algo sólido, questão a questão.',
    'Parabéns! Cada questão de hoje é um passo a mais rumo à aprovação.',
    'Meta do dia concluída! Seu futuro aprovado agradece.',
    'Missão cumprida! Cada dia de consistência é um tijolo a mais na sua aprovação.',
    'Meta alcançada! Você honrou o compromisso que fez com você mesmo.',
    'Incrível! Continue assim e a aprovação é só questão de tempo.',
    'Meta do dia: feita! Descanse sabendo que hoje você evoluiu.',
    'Você bateu a meta! A aprovação começa exatamente com dias como este.',
    'Meta concluída! Cada dia assim te coloca mais perto do diploma.',
    'Excelente! Você demonstrou hoje que quer mesmo passar no OAB.',
    'Meta do dia superada! O hábito diário é sua maior arma.',
    'Que disciplina! Continue nesse ritmo e a aprovação vem naturalmente.',
    ...(user?.streak >= 2 ? [`Já são ${user.streak} dias seguidos! Você de ontem não chegaria onde o de hoje chegou.`] : []),
  ];
  const [msgIdx] = useStateShell(() => Math.floor(Math.random() * MENSAGENS_META.length));
  const metaBatida = meta.feito >= meta.alvo && meta.alvo > 0;
  const btnEstudo = metaBatida ? '⚡ Superar a meta' : meta.feito > 0 ? '⚡ Continuar estudo' : '⚡ Iniciar estudo';

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
            {metaBatida
              ? MENSAGENS_META[msgIdx]
              : <>{diasParaProva
                    ? <>Faltam <strong>{diasParaProva} dias</strong> para o próximo exame. </>
                    : ''}
                  Hoje sua meta é {meta.alvo} questões.</>}
          </p>
        </div>
        <div className="dash-top-actions">
          <button className="btn btn-cta btn-lg" onClick={onPracticeStart}>{btnEstudo}</button>
        </div>
      </header>

      <section className="dash-row dash-row-hero">
        <div className="dash-continue">
          <div className="dash-continue-stripe" />
          <div className="dash-continue-body">
            <div className="eyebrow" style={{color:'var(--amarelo)'}}>Sua próxima sessão</div>
            <h2 className="dash-continue-title">{proximaSessao?.titulo || 'Sessão de prática'}</h2>
            <p className="dash-continue-sub">{proximaSessao?.total || 10} questões · ≈ {proximaSessao?.minutos || user?.minutosDia || 30} min · adaptado ao seu desempenho</p>
            <div className="dash-continue-meta">
              <span className="chip chip-amarelo">+{proximaSessao?.xp_esperado || 150} XP esperados</span>
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

/* =========================================================
   Painel de perfil do usuário
   ========================================================= */
function UserProfilePanel({ user, onClose, onUserUpdate }) {
  const [nome,         setNome]         = useStateShell(user?.nome  || '');
  const [email,        setEmail]        = useStateShell(user?.email || '');
  const [dadosLoading, setDadosLoading] = useStateShell(false);
  const [dadosErro,    setDadosErro]    = useStateShell(null);
  const [dadosOk,      setDadosOk]      = useStateShell(false);

  const [senhaAtual,    setSenhaAtual]    = useStateShell('');
  const [novaSenha,     setNovaSenha]     = useStateShell('');
  const [confirma,      setConfirma]      = useStateShell('');
  const [senhaLoading,  setSenhaLoading]  = useStateShell(false);
  const [senhaErro,     setSenhaErro]     = useStateShell(null);
  const [senhaOk,       setSenhaOk]       = useStateShell(false);

  const dadosAlterado = nome.trim() !== (user?.nome || '') || email.trim() !== (user?.email || '');

  const saveDados = async () => {
    setDadosLoading(true);
    setDadosErro(null);
    setDadosOk(false);
    try {
      const res = await window.apiFetch('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ nome: nome.trim(), email: email.trim() }),
      });
      localStorage.setItem('oab_token', res.token);
      onUserUpdate?.(res.user);
      setDadosOk(true);
      setTimeout(() => setDadosOk(false), 3000);
    } catch (err) {
      setDadosErro(err.error || 'Erro ao salvar');
    } finally {
      setDadosLoading(false);
    }
  };

  const saveSenha = async () => {
    if (novaSenha !== confirma) { setSenhaErro('As senhas não coincidem'); return; }
    setSenhaLoading(true);
    setSenhaErro(null);
    setSenhaOk(false);
    try {
      const res = await window.apiFetch('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      localStorage.setItem('oab_token', res.token);
      setSenhaAtual(''); setNovaSenha(''); setConfirma('');
      setSenhaOk(true);
      setTimeout(() => setSenhaOk(false), 3000);
    } catch (err) {
      setSenhaErro(err.error || 'Erro ao alterar senha');
    } finally {
      setSenhaLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel profile-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Conta</div>
            <div className="modal-title">Minha conta</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="profile-section">
          <div className="profile-section-title">Dados pessoais</div>
          <div className="input-group">
            <label className="input-label">Nome</label>
            <input className="input-field" value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div className="input-group" style={{ marginTop: 12 }}>
            <label className="input-label">E-mail</label>
            <input className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          {dadosErro && (
            <div className="login-error" style={{ marginTop: 12 }}>
              <span>✕</span> {dadosErro}
            </div>
          )}
          <div className="profile-save-row">
            <button className="btn btn-primary" disabled={dadosLoading || !dadosAlterado} onClick={saveDados}>
              {dadosLoading ? 'Salvando…' : 'Salvar'}
            </button>
            {dadosOk && <span className="profile-ok">✓ Salvo com sucesso</span>}
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-section-title">Alterar senha</div>
          <div className="input-group">
            <label className="input-label">Senha atual</label>
            <input className="input-field" type="password" value={senhaAtual}
                   onChange={e => setSenhaAtual(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="input-group" style={{ marginTop: 12 }}>
            <label className="input-label">Nova senha</label>
            <input className="input-field" type="password" value={novaSenha}
                   onChange={e => setNovaSenha(e.target.value)} autoComplete="new-password" />
            <div className="input-hint">Mínimo 8 caracteres.</div>
          </div>
          <div className="input-group" style={{ marginTop: 12 }}>
            <label className="input-label">Confirmar nova senha</label>
            <input className="input-field" type="password" value={confirma}
                   onChange={e => setConfirma(e.target.value)} autoComplete="new-password" />
          </div>
          {senhaErro && (
            <div className="login-error" style={{ marginTop: 12 }}>
              <span>✕</span> {senhaErro}
            </div>
          )}
          <div className="profile-save-row">
            <button className="btn btn-primary" disabled={senhaLoading || !senhaAtual || !novaSenha || !confirma} onClick={saveSenha}>
              {senhaLoading ? 'Alterando…' : 'Alterar senha'}
            </button>
            {senhaOk && <span className="profile-ok">✓ Senha alterada</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Painel de notificações
   ========================================================= */
function NotificacoesPanel({ notifications, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel profile-panel" style={{maxWidth:440}} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Notificações</div>
            <div className="modal-title">Suas atualizações</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {notifications.length === 0 && (
          <div style={{padding:'32px 0', textAlign:'center', color:'var(--text-muted)'}}>
            <div style={{fontSize:32, marginBottom:8}}>🔔</div>
            <div>Nenhuma notificação por enquanto.</div>
          </div>
        )}

        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          {notifications.map(n => (
            <div key={n.id} style={{
              padding:'12px 16px', borderRadius:8,
              background: n.lida ? 'var(--bg-surface)' : 'var(--bege)',
              border:'1px solid var(--border)',
            }}>
              <div style={{fontWeight:600, marginBottom:4, fontSize:'var(--text-sm)'}}>
                {!n.lida && <span style={{display:'inline-block', width:8, height:8, borderRadius:'50%', background:'var(--bordo)', marginRight:6, verticalAlign:'middle'}} />}
                {n.titulo}
              </div>
              <div style={{fontSize:'var(--text-sm)', color:'var(--text-secondary)'}}>{n.mensagem}</div>
              <div style={{fontSize:11, color:'var(--text-muted)', marginTop:4}}>
                {new Date(n.created_at).toLocaleDateString('pt-BR', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

window.Shell = { AppShell, Dashboard };
