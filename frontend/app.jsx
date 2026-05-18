/* global React, ReactDOM */
const { useState: useStateApp, useEffect: useEffectApp } = React;

const API = '/api';
const TOKEN_KEY = 'oab_token';

function App() {
  const [route, setRoute]     = useStateApp('loading'); // loading | splash | register | app
  const [page, setPage]       = useStateApp('dashboard');
  const [user, setUser]       = useStateApp(null);
  const [token, setToken]     = useStateApp(null);
  const [toast, setToast]     = useStateApp(null);

  const flashToast = (t) => {
    setToast(t);
    setTimeout(() => setToast(null), 4200);
  };

  // Ao iniciar: verifica token salvo e valida com a API
  useEffectApp(() => {
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
    flashToast({ kind: 'xp', title: '+50 XP de boas-vindas!', body: 'Conta criada · plano de estudo gerado.' });
  };

  const handleNavigate = (p) => setPage(p);
  const handlePracticeStart = () => setPage('practice');

  // Tela de carregamento (verifica token)
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

  if (route === 'splash') {
    return (
      <window.AuthFlow.SplashScreen
        onStart={handleRegisterStart}
        onLogin={handleLogin}
      />
    );
  }

  if (route === 'register') {
    return (
      <window.AuthFlow.RegisterFlow
        onCancel={() => setRoute('splash')}
        onComplete={handleRegisterComplete}
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
      >
        {page === 'dashboard' && <window.Shell.Dashboard user={user} onPracticeStart={handlePracticeStart} onNavigate={handleNavigate} />}
        {page === 'practice'  && <window.Practice.PracticeFlow user={user} token={token} onUserUpdate={setUser} onExit={() => setPage('dashboard')} onNavigate={handleNavigate} />}
        {page === 'stats'     && <window.Stats.StatsPage onNavigate={handleNavigate} />}
        {page === 'review'    && <window.Stats.StatsPage onNavigate={handleNavigate} />}
        {page === 'admin'      && user?.role === 'admin' && <window.Admin.AdminPage token={token} onNavigate={handleNavigate} />}
        {page === 'moderation' && user?.role === 'admin' && <window.Moderation.ModerationPage onNavigate={handleNavigate} />}
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
