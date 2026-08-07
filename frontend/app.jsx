/* global React, ReactDOM */
const { useState: useStateApp, useEffect: useEffectApp } = React;

const API = '/api';
const TOKEN_KEY = 'oab_token';

function App() {
  // route: loading | splash | register | app | verify-email | reset-password | email-pending | forgot-password
  const [route, setRoute]               = useStateApp('loading');
  const [page, setPage]                 = useStateApp('dashboard');
  const [user, setUser]                 = useStateApp(null);
  const [token, setToken]               = useStateApp(null);
  const [toast, setToast]               = useStateApp(null);
  const [urlToken, setUrlToken]         = useStateApp(null);
  const [emailPending, setEmailPending] = useStateApp({ email: '', tokenExpired: false });
  const [adWatched, setAdWatched]       = useStateApp(false);
  const [theme, setTheme]               = useStateApp(localStorage.getItem('oab_theme') || 'light');

  const isPremium = user?.plan === 'premium' || user?.role === 'admin';

  // Tema escuro é recurso Premium — aplica só quando o plano permite
  useEffectApp(() => {
    const dark = theme === 'dark' && isPremium;
    document.body.classList.toggle('theme-dark', dark);
    localStorage.setItem('oab_theme', theme);
  }, [theme, isPremium]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  const refreshUser = () => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) return;
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${saved}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setUser)
      .catch(() => {});
  };

  const goPremium = () => setPage('premium');

  const handleUpgraded = () => {
    refreshUser();
    setPage('dashboard');
    flashToast({ kind: 'xp', title: 'Bem-vindo ao Premium! ✨', body: 'Stats, trilhas e tema desbloqueados — e zero anúncios.' });
  };

  const flashToast = (t) => {
    setToast(t);
    setTimeout(() => setToast(null), 4200);
  };

  // Ao iniciar: verifica rotas de e-mail (links dos e-mails) antes do token
  useEffectApp(() => {
    const path = window.location.pathname;

    if (path === '/verificar-email') {
      const params = new URLSearchParams(window.location.search);
      setUrlToken(params.get('token'));
      setRoute('verify-email');
      return;
    }

    if (path === '/redefinir-senha') {
      const params = new URLSearchParams(window.location.search);
      setUrlToken(params.get('token'));
      setRoute('reset-password');
      return;
    }

    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) { setRoute('splash'); return; }

    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${saved}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(userData => {
        setToken(saved);
        setUser(userData);
        setRoute('app');
        setPage('dashboard');
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setRoute('splash');
      });
  }, []);

  const doLogin = (userData, newToken) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(userData);
    setRoute('app');
    setPage('dashboard');
  };

  const doLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setRoute('splash');
    flashToast({ kind: 'success', title: 'Até logo!', body: 'Sessão encerrada.' });
  };

  const handleRegisterStart = () => setRoute('register');

  const handleLogin = (userData, newToken) => {
    doLogin(userData, newToken);
    flashToast({ kind: 'success', title: 'Bem-vindo(a) de volta!', body: 'Login realizado com sucesso.' });
  };

  const handleRegisterComplete = (userData, newToken) => {
    doLogin(userData, newToken);
    flashToast({ kind: 'xp', title: '+50 XP de boas-vindas!', body: 'Conta criada · verifique seu e-mail para garantir o acesso.' });
  };

  const handleEmailNotVerified = (email, tokenExpired) => {
    setEmailPending({ email, tokenExpired });
    setRoute('email-pending');
  };

  const handleNavigate = (p) => setPage(p);
  const handlePracticeStart = () => { setAdWatched(false); setPage('practice'); };

  // Tela de carregamento
  if (route === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>A</div>
          <div style={{ fontSize: 14 }}>Carregando…</div>
        </div>
      </div>
    );
  }

  if (route === 'verify-email') {
    return (
      <window.AuthFlow.VerifyEmailScreen
        token={urlToken}
        onGoToLogin={() => {
          window.history.replaceState({}, '', '/');
          setRoute('splash');
        }}
      />
    );
  }

  if (route === 'reset-password') {
    return (
      <window.AuthFlow.ResetPasswordScreen
        token={urlToken}
        onGoToLogin={() => {
          window.history.replaceState({}, '', '/');
          setRoute('splash');
        }}
      />
    );
  }

  if (route === 'email-pending') {
    return (
      <window.AuthFlow.EmailVerifyPendingScreen
        email={emailPending.email}
        tokenExpired={emailPending.tokenExpired}
        onBack={() => setRoute('splash')}
      />
    );
  }

  if (route === 'forgot-password') {
    return (
      <window.AuthFlow.ForgotPasswordScreen
        onBack={() => setRoute('splash')}
      />
    );
  }

  if (route === 'splash') {
    return (
      <window.AuthFlow.SplashScreen
        onStart={handleRegisterStart}
        onLogin={handleLogin}
        onEmailNotVerified={handleEmailNotVerified}
        onForgotPassword={() => setRoute('forgot-password')}
      />
    );
  }

  // O onboarding em 3 telas substituiu o RegisterFlow de 4 etapas em 07/08/2026.
  // O RegisterFlow continua no código e alcançável por `route === 'register-legado'`
  // até o fluxo novo se provar em produção — não vale apagar o caminho que funciona
  // antes de o substituto rodar com gente de verdade.
  if (route === 'register') {
    return (
      <window.Onboarding.OnboardingFlow
        onCancel={() => setRoute('splash')}
        onComplete={handleRegisterComplete}
        onEmailPending={(email) => { setEmailPending({ email, tokenExpired: false }); setRoute('email-pending'); }}
      />
    );
  }

  if (route === 'register-legado') {
    return (
      <window.AuthFlow.RegisterFlow
        onCancel={() => setRoute('splash')}
        onComplete={handleRegisterComplete}
        onEmailPending={(email) => { setEmailPending({ email, tokenExpired: false }); setRoute('email-pending'); }}
      />
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
        onLogout={doLogout}
        onUserUpdate={setUser}
        onUpgrade={goPremium}
        onToggleTheme={toggleTheme}
        theme={theme}
      >
        {page === 'dashboard' && <window.Shell.Dashboard user={user} onPracticeStart={handlePracticeStart} onNavigate={handleNavigate} />}
        {page === 'premium'   && <window.Premium.PremiumPage user={user} onUpgraded={handleUpgraded} onBack={() => setPage('dashboard')} />}
        {page === 'practice'  && (!isPremium && !adWatched
          ? <window.Premium.AdVideoGate onDone={() => setAdWatched(true)} onUpgrade={goPremium} />
          : <window.Practice.PracticeFlow user={user} token={token} onUserUpdate={setUser} onExit={() => setPage('dashboard')} onNavigate={handleNavigate} onUpgrade={goPremium} />)}
        {page === 'trilha'    && <window.Trilha.TrilhaPage user={user} onExit={() => setPage('dashboard')} onNavigate={handleNavigate} onUpgrade={goPremium} onUserUpdate={setUser} />}
        {(page === 'stats' || page === 'review') && (isPremium
          ? <window.Stats.StatsPage onNavigate={handleNavigate} />
          : (
            <div style={{ padding: 64, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Estatísticas são Premium</div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
                Acompanhe sua evolução por área, streak e plano de estudos personalizado.
              </div>
              <button className="btn-primary" onClick={goPremium}>Desbloquear estatísticas</button>
            </div>
          ))}
        {page === 'admin'      && user?.role === 'admin' && <window.Admin.AdminPage token={token} onNavigate={handleNavigate} />}
        {page === 'admin'     && user?.role !== 'admin' && (
          <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Acesso restrito</div>
            <div>Esta área é exclusiva para administradores.</div>
          </div>
        )}
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
    </>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<App />);
