/* global React, ReactDOM */
const { useState: useStateApp, useEffect: useEffectApp } = React;

function App() {
  // route: 'splash' | 'register' | 'app'
  const [route, setRoute]   = useStateApp('splash');
  // page (dentro do app autenticado): dashboard | practice | stats | review
  const [page, setPage]     = useStateApp('dashboard');
  const [user, setUser]     = useStateApp(null);
  const [toast, setToast]   = useStateApp(null);

  // Helpers
  const flashToast = (t) => {
    setToast(t);
    setTimeout(() => setToast(null), 4200);
  };

  // Demo: para facilitar revisão, permite trocar de rota via URL hash
  useEffectApp(() => {
    const apply = () => {
      const h = window.location.hash.replace('#','');
      if (['splash','register','dashboard','practice','stats','review'].includes(h)) {
        if (h === 'splash')   { setRoute('splash'); }
        else if (h === 'register') { setRoute('register'); }
        else {
          ensureDemoUser();
          setRoute('app');
          setPage(h);
        }
      }
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  const ensureDemoUser = () => {
    setUser(u => u || ({
      nome: 'Ana Beatriz Marques',
      email: 'ana@email.com',
      edicao: 'XLI',
      minutosDia: 30,
      areas: ['civil','const','etica','penal'],
      xp: window.AppData.STATS_OVERVIEW.xpTotal,
      streak: window.AppData.STATS_OVERVIEW.streak,
    }));
  };

  // Fluxo: splash → register → app
  const handleRegisterStart = () => setRoute('register');
  const handleLogin = () => {
    ensureDemoUser();
    setRoute('app');
    setPage('dashboard');
    flashToast({ kind: 'success', title: 'Bem-vinda de volta!', body: 'Login realizado com sucesso.' });
  };

  const handleRegisterComplete = (form) => {
    setUser({
      nome: form.nome,
      email: form.email,
      edicao: form.edicao,
      minutosDia: form.minutosDia,
      areas: form.areas,
      xp: 0,
      streak: 1,
    });
    setRoute('app');
    setPage('dashboard');
    flashToast({ kind: 'xp', title: '+50 XP de boas-vindas!', body: 'Conta criada · plano de estudo gerado.' });
  };

  const handleNavigate = (p) => setPage(p);
  const handlePracticeStart = () => setPage('practice');

  // RENDER
  if (route === 'splash') {
    return (
      <>
        <window.AuthFlow.SplashScreen onStart={handleRegisterStart} onLogin={handleLogin} />
        <DemoSwitcher route={route} page={page} setRoute={setRoute} setPage={setPage} ensureDemoUser={ensureDemoUser} />
      </>
    );
  }

  if (route === 'register') {
    return (
      <>
        <window.AuthFlow.RegisterFlow
          onCancel={() => setRoute('splash')}
          onComplete={handleRegisterComplete}
        />
        <DemoSwitcher route={route} page={page} setRoute={setRoute} setPage={setPage} ensureDemoUser={ensureDemoUser} />
      </>
    );
  }

  // route === 'app'
  return (
    <>
      <window.Shell.AppShell
        user={user}
        page={page}
        onNavigate={handleNavigate}
        onPracticeStart={handlePracticeStart}
      >
        {page === 'dashboard' && <window.Shell.Dashboard user={user} onPracticeStart={handlePracticeStart} onNavigate={handleNavigate} />}
        {page === 'practice'  && <window.Practice.PracticeFlow user={user} onExit={() => setPage('dashboard')} onNavigate={handleNavigate} />}
        {page === 'stats'     && <window.Stats.StatsPage onNavigate={handleNavigate} />}
        {page === 'review'    && <window.Stats.StatsPage onNavigate={handleNavigate} />}
      </window.Shell.AppShell>

      {toast && (
        <div className="toast-stack">
          <div className={`toast toast-${toast.kind} fade-up`}>
            <div className="toast-icon">{toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '✕' : '⚡'}</div>
            <div>
              <div className="toast-title">{toast.title}</div>
              <div className="toast-body">{toast.body}</div>
            </div>
          </div>
        </div>
      )}

      <DemoSwitcher route={route} page={page} setRoute={setRoute} setPage={setPage} ensureDemoUser={ensureDemoUser} />
    </>
  );
}

/* =========================================================
   Demo Switcher — atalho discreto para navegar entre jornadas
   (essencial em protótipos: o usuário consegue pular pra
    qualquer ponto da experiência sem refazer o fluxo)
   ========================================================= */
function DemoSwitcher({ route, page, setRoute, setPage, ensureDemoUser }) {
  const [open, setOpen] = useStateApp(false);
  const items = [
    { id: 'splash',    label: 'Splash',         hint: 'Tela de entrada' },
    { id: 'register',  label: 'Cadastro',       hint: 'Jornada multi-step' },
    { id: 'dashboard', label: 'Dashboard',      hint: 'Home autenticada' },
    { id: 'practice',  label: 'Responder',      hint: 'Sessão de questões' },
    { id: 'stats',     label: 'Estatísticas',   hint: 'Acertos + histórico' },
  ];
  const go = (id) => {
    if (id === 'splash')   { setRoute('splash'); }
    else if (id === 'register') { setRoute('register'); }
    else { ensureDemoUser(); setRoute('app'); setPage(id); }
    setOpen(false);
  };
  const current = route === 'app' ? page : route;

  return (
    <div className={`demo-switcher ${open ? 'is-open' : ''}`}>
      <button className="demo-switcher-toggle" onClick={() => setOpen(o => !o)} title="Navegar entre jornadas">
        <span className="demo-switcher-dot" />
        <span>{open ? 'Fechar' : 'Jornadas'}</span>
      </button>
      {open && (
        <div className="demo-switcher-panel fade-up">
          <div className="demo-switcher-head">
            <div className="demo-switcher-title">Atalhos do protótipo</div>
            <div className="demo-switcher-sub">Salte direto para qualquer tela. Em produção, este menu não aparece.</div>
          </div>
          {items.map(it => (
            <button key={it.id}
                    className={`demo-switcher-item ${current === it.id ? 'is-current' : ''}`}
                    onClick={() => go(it.id)}>
              <span className="demo-switcher-item-dot" />
              <div>
                <div className="demo-switcher-item-label">{it.label}</div>
                <div className="demo-switcher-item-hint">{it.hint}</div>
              </div>
              {current === it.id && <span className="demo-switcher-item-now">aqui</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<App />);
