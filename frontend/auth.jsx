/* global React */
const { useState, useEffect } = React;

const API = '/api';

/* =========================================================
   Splash Screen
   ========================================================= */
function SplashScreen({ onStart, onLogin, onEmailNotVerified, onForgotPassword }) {
  const [showLogin, setShowLogin] = useState(false);

  if (showLogin) {
    return (
      <LoginScreen
        onBack={() => setShowLogin(false)}
        onLogin={onLogin}
        onEmailNotVerified={onEmailNotVerified}
        onForgotPassword={onForgotPassword}
      />
    );
  }

  return (
    <div className="splash-wrap fade-in">
      <div className="splash-bg-shape splash-bg-bordo" />
      <div className="splash-bg-shape splash-bg-amarelo" />
      <div className="splash-content">
        <div className="splash-mark">
          <div className="splash-mark-circle">
            <span className="splash-mark-letter">A</span>
          </div>
          <div>
            <div className="splash-brand">Aprovado OAB</div>
            <div className="splash-eyebrow">Plataforma de estudo</div>
          </div>
        </div>

        <h1 className="splash-title">
          Da primeira leitura<br/>
          ao <em>«passar na Ordem».</em>
        </h1>
        <p className="splash-sub">
          Mais de 8.000 questões comentadas, simulados oficiais e plano de estudo adaptativo.
          Estude 20 minutos por dia e veja seu desempenho crescer questão a questão.
        </p>

        <div className="splash-cta-row">
          <button className="btn btn-cta btn-lg" onClick={onStart}>
            Criar conta grátis
          </button>
          <button className="btn btn-ghost btn-lg" onClick={() => setShowLogin(true)}>
            Já tenho conta
          </button>
        </div>

        <div className="splash-stats">
          <div><span className="splash-stat-num">8.240</span><span className="splash-stat-label">questões</span></div>
          <div><span className="splash-stat-num">12</span><span className="splash-stat-label">edições da prova</span></div>
          <div><span className="splash-stat-num">72%</span><span className="splash-stat-label">aprovação dos ativos</span></div>
        </div>
      </div>

      <div className="splash-preview">
        <div className="splash-preview-glow" />
        <SplashPreviewCard />
      </div>
    </div>
  );
}

/* =========================================================
   Login Screen
   ========================================================= */
function LoginScreen({ onBack, onLogin, onEmailNotVerified, onForgotPassword }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.status === 403 && data.code === 'EMAIL_NOT_VERIFIED') {
        onEmailNotVerified(email, data.tokenExpired);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Erro ao fazer login');
      onLogin(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap fade-in">
      <div className="splash-bg-shape splash-bg-bordo" />
      <div className="splash-bg-shape splash-bg-amarelo" />

      <div className="login-box">
        <button className="reg-back" onClick={onBack} style={{ marginBottom: 24 }}>← Voltar</button>

        <div className="splash-mark" style={{ marginBottom: 32 }}>
          <div className="splash-mark-circle" style={{ width: 40, height: 40 }}>
            <span className="splash-mark-letter" style={{ fontSize: 18 }}>A</span>
          </div>
          <div>
            <div className="splash-brand" style={{ fontSize: 18 }}>Aprovado OAB</div>
            <div className="splash-eyebrow">Acesse sua conta</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="reg-form">
          <div className="input-group">
            <label className="input-label">E-mail</label>
            <input
              className="input-field"
              type="email"
              placeholder="voce@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="input-group">
            <label className="input-label">Senha</label>
            <input
              className="input-field"
              type="password"
              placeholder="Sua senha"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="login-error">
              <span>✕</span> {error}
            </div>
          )}

          <button
            className="btn btn-primary btn-lg"
            type="submit"
            disabled={loading || !email || !password}
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? 'Entrando…' : 'Entrar →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="btn-link" onClick={onForgotPassword} style={{ fontSize: 13 }}>
            Esqueceu a senha?
          </button>
        </div>

        <p className="login-footer-text">
          Não tem conta?{' '}
          <button className="btn-link" onClick={onBack}>Criar conta grátis</button>
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   Email verificação pendente (após login bloqueado)
   ========================================================= */
function EmailVerifyPendingScreen({ email, tokenExpired, onBack, onResent }) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleResend = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao reenviar');
      setSent(true);
      if (onResent) onResent();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap fade-in">
      <div className="splash-bg-shape splash-bg-bordo" />
      <div className="splash-bg-shape splash-bg-amarelo" />

      <div className="login-box" style={{ textAlign: 'center' }}>
        <div className="email-pending-icon">✉</div>

        <h2 className="reg-title" style={{ marginBottom: 12 }}>
          {sent ? 'Novo e-mail enviado!' : 'Confirme seu e-mail'}
        </h2>

        {sent ? (
          <p className="reg-sub">
            Enviamos um novo link de verificação para{' '}
            <strong className="email-highlight">{email}</strong>.
            Verifique sua caixa de entrada e a pasta de spam.
          </p>
        ) : (
          <p className="reg-sub">
            Enviamos um link de verificação para{' '}
            <strong className="email-highlight">{email}</strong>.
            Clique no link para liberar seu acesso.
          </p>
        )}

        {!sent && tokenExpired && (
          <div style={{ marginTop: 8, marginBottom: 4 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              O link expirou. Clique abaixo para receber um novo.
            </p>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              onClick={handleResend}
              disabled={loading}
            >
              {loading ? 'Enviando…' : 'Reenviar e-mail de verificação'}
            </button>
          </div>
        )}

        {error && (
          <div className="login-error" style={{ marginTop: 12 }}>
            <span>✕</span> {error}
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <button className="btn-link" onClick={onBack} style={{ fontSize: 13 }}>
            ← Tentar fazer login novamente
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Esqueceu a senha
   ========================================================= */
function ForgotPasswordScreen({ onBack }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao processar');
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap fade-in">
      <div className="splash-bg-shape splash-bg-bordo" />
      <div className="splash-bg-shape splash-bg-amarelo" />

      <div className="login-box">
        <button className="reg-back" onClick={onBack} style={{ marginBottom: 24 }}>← Voltar</button>

        <div className="splash-mark" style={{ marginBottom: 32 }}>
          <div className="splash-mark-circle" style={{ width: 40, height: 40 }}>
            <span className="splash-mark-letter" style={{ fontSize: 18 }}>A</span>
          </div>
          <div>
            <div className="splash-brand" style={{ fontSize: 18 }}>Aprovado OAB</div>
            <div className="splash-eyebrow">Recuperar senha</div>
          </div>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div className="email-pending-icon">✉</div>
            <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 12 }}>E-mail enviado!</h3>
            <p className="reg-sub">
              Se <strong className="email-highlight">{email}</strong> estiver cadastrado,
              você receberá um link para redefinir sua senha. Verifique também a pasta de spam.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              O link expira em 1 hora.
            </p>
            <button className="btn-link" onClick={onBack} style={{ marginTop: 24, display: 'block', fontSize: 13 }}>
              ← Voltar para o login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="reg-form">
            <p className="reg-sub" style={{ marginBottom: 24, marginTop: 0 }}>
              Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.
            </p>
            <div className="input-group">
              <label className="input-label">E-mail</label>
              <input
                className="input-field"
                type="email"
                placeholder="voce@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>

            {error && (
              <div className="login-error">
                <span>✕</span> {error}
              </div>
            )}

            <button
              className="btn btn-primary btn-lg"
              type="submit"
              disabled={loading || !email}
              style={{ width: '100%', marginTop: 8 }}
            >
              {loading ? 'Enviando…' : 'Enviar link de recuperação →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Verificar e-mail (acessado pelo link no e-mail)
   ========================================================= */
function VerifyEmailScreen({ token, onGoToLogin }) {
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setErrorMsg('Link inválido. Nenhum token encontrado.');
      setStatus('error');
      return;
    }
    fetch(`${API}/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          if (data.code === 'TOKEN_EXPIRED') throw new Error('O link expirou. Faça login para solicitar um novo.');
          if (data.code === 'TOKEN_USED')    throw new Error('Este link já foi utilizado. Faça login normalmente.');
          throw new Error(data.error || 'Link inválido.');
        }
        setStatus('success');
        window.track('email_verificado');
      })
      .catch(err => {
        setErrorMsg(err.message);
        setStatus('error');
      });
  }, [token]);

  return (
    <div className="login-wrap fade-in">
      <div className="splash-bg-shape splash-bg-bordo" />
      <div className="splash-bg-shape splash-bg-amarelo" />

      <div className="login-box" style={{ textAlign: 'center' }}>
        <div className="splash-mark" style={{ justifyContent: 'center', marginBottom: 32 }}>
          <div className="splash-mark-circle" style={{ width: 40, height: 40 }}>
            <span className="splash-mark-letter" style={{ fontSize: 18 }}>A</span>
          </div>
          <div>
            <div className="splash-brand" style={{ fontSize: 18 }}>Aprovado OAB</div>
          </div>
        </div>

        {status === 'loading' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
            <p className="reg-sub">Verificando seu e-mail…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="email-pending-icon" style={{ color: 'var(--green-dark)' }}>✓</div>
            <h2 className="reg-title" style={{ marginBottom: 12 }}>E-mail confirmado!</h2>
            <p className="reg-sub">Sua conta está ativa. Você já pode fazer login e começar a estudar.</p>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 24 }}
              onClick={onGoToLogin}
            >
              Ir para o login →
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠</div>
            <h2 className="reg-title" style={{ marginBottom: 12 }}>Não foi possível confirmar</h2>
            <p className="reg-sub" style={{ color: 'var(--text-muted)' }}>{errorMsg}</p>
            <button
              className="btn btn-ghost btn-lg"
              style={{ width: '100%', marginTop: 24 }}
              onClick={onGoToLogin}
            >
              ← Voltar para o login
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Redefinir senha (acessado pelo link no e-mail)
   ========================================================= */
function ResetPasswordScreen({ token, onGoToLogin }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  if (!token) {
    return (
      <div className="login-wrap fade-in">
        <div className="login-box" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠</div>
          <p className="reg-sub">Link inválido. Solicite um novo link de redefinição de senha.</p>
          <button className="btn btn-ghost btn-lg" style={{ marginTop: 16 }} onClick={onGoToLogin}>← Voltar para o login</button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'TOKEN_EXPIRED') throw new Error('O link expirou. Solicite um novo pela tela de login.');
        if (data.code === 'TOKEN_USED')    throw new Error('Este link já foi utilizado. Faça login ou solicite outro.');
        throw new Error(data.error || 'Erro ao redefinir senha');
      }
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap fade-in">
      <div className="splash-bg-shape splash-bg-bordo" />
      <div className="splash-bg-shape splash-bg-amarelo" />

      <div className="login-box">
        <div className="splash-mark" style={{ marginBottom: 32 }}>
          <div className="splash-mark-circle" style={{ width: 40, height: 40 }}>
            <span className="splash-mark-letter" style={{ fontSize: 18 }}>A</span>
          </div>
          <div>
            <div className="splash-brand" style={{ fontSize: 18 }}>Aprovado OAB</div>
            <div className="splash-eyebrow">Nova senha</div>
          </div>
        </div>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div className="email-pending-icon" style={{ color: 'var(--green-dark)' }}>✓</div>
            <h2 className="reg-title" style={{ marginBottom: 12 }}>Senha redefinida!</h2>
            <p className="reg-sub">Sua nova senha foi salva com sucesso. Agora você pode fazer login.</p>
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 24 }}
              onClick={onGoToLogin}
            >
              Ir para o login →
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="reg-form">
            <p className="reg-sub" style={{ marginBottom: 24, marginTop: 0 }}>
              Escolha uma nova senha para sua conta.
            </p>
            <div className="input-group">
              <label className="input-label">Nova senha</label>
              <input
                className="input-field"
                type="password"
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
                required
              />
              <PasswordStrength value={password} />
            </div>
            <div className="input-group">
              <label className="input-label">Confirmar nova senha</label>
              <input
                className="input-field"
                type="password"
                placeholder="Repita a senha"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="login-error">
                <span>✕</span> {error}
              </div>
            )}

            <button
              className="btn btn-primary btn-lg"
              type="submit"
              disabled={loading || password.length < 8 || !confirm}
              style={{ width: '100%', marginTop: 8 }}
            >
              {loading ? 'Salvando…' : 'Salvar nova senha →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function SplashPreviewCard() {
  return (
    <div className="splash-card">
      <div className="splash-card-header">
        <span className="splash-card-tag">FGV · OAB XXXIX</span>
        <span className="splash-card-num">Q. 12 / 80</span>
      </div>
      <div className="splash-card-body">
        <div className="splash-card-area">Direito Civil · Responsabilidade</div>
        <div className="splash-card-q">A responsabilidade civil de Marcos perante Ana é classificada como…</div>
        <div className="splash-card-opt">
          <div className="splash-card-letter">A</div>
          <div>Objetiva, independente de culpa…</div>
        </div>
        <div className="splash-card-opt splash-card-opt-active">
          <div className="splash-card-letter">B</div>
          <div>Subjetiva, dependente de dolo ou culpa</div>
        </div>
        <div className="splash-card-opt">
          <div className="splash-card-letter">C</div>
          <div>Objetiva por risco da atividade…</div>
        </div>
      </div>
      <div className="splash-card-foot">
        <span>⏱ 02:14</span>
        <span className="chip chip-amarelo">+15 XP</span>
      </div>
    </div>
  );
}

/* =========================================================
   Jornada de cadastro multi-step
   ========================================================= */
const REGISTER_STEPS = [
  { id: 'identidade', label: 'Você' },
  { id: 'objetivo',   label: 'Objetivo' },
  { id: 'rotina',     label: 'Rotina' },
  { id: 'pronto',     label: 'Pronto' },
];

function RegisterFlow({ onCancel, onComplete, onEmailPending }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    nome: '', email: '', senha: '',
    edicao: 'XLI', faseAlvo: '1', dataProva: '',
    minutosDia: 30, area_segunda_fase: 'civil',
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (patch) => setForm(f => ({ ...f, ...patch }));

  const canAdvance = () => {
    if (submitting) return false;
    if (step === 0) return form.nome.trim().length > 1 && /.+@.+\..+/.test(form.email) && form.senha.length >= 8;
    if (step === 1) return !!form.edicao;
    if (step === 2) return !!form.area_segunda_fase;
    return true;
  };

  const goNext = async () => {
    setError(null);
    // Último passo: chama a API
    if (step === REGISTER_STEPS.length - 1) {
      setSubmitting(true);
      try {
        const res = await fetch(`${API}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome:             form.nome,
            email:            form.email,
            password:         form.senha,
            edicao:           form.edicao,
            minutosDia:       form.minutosDia,
            area_segunda_fase: form.area_segunda_fase,
            dataProva:        form.dataProva || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao criar conta');
        if (data.requiresVerification) { onEmailPending(data.email); return; }
        onComplete(data.user, data.token);
      } catch (err) {
        setError(err.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setStep(s => s + 1);
  };

  const goBack = () => {
    setError(null);
    if (step > 0) setStep(s => s - 1);
    else onCancel();
  };

  return (
    <div className="reg-wrap fade-in">
      <header className="reg-topbar">
        <button className="reg-back" onClick={goBack}>← Voltar</button>
        <div className="reg-brand">
          <div className="reg-brand-mark">A</div>
          <span>Aprovado OAB</span>
        </div>
        <div className="reg-skip">Etapa {step + 1} de {REGISTER_STEPS.length}</div>
      </header>

      <div className="reg-steps">
        {REGISTER_STEPS.map((s, i) => (
          <div key={s.id} className={`reg-step ${i === step ? 'is-current' : ''} ${i < step ? 'is-done' : ''}`}>
            <div className="reg-step-dot">{i < step ? '✓' : i + 1}</div>
            <span className="reg-step-label">{s.label}</span>
          </div>
        ))}
      </div>

      <main className="reg-main">
        <div className="reg-card fade-up" key={step}>
          {step === 0 && <StepIdentidade form={form} update={update} />}
          {step === 1 && <StepObjetivo form={form} update={update} />}
          {step === 2 && <StepRotina form={form} update={update} />}
          {step === 3 && <StepPronto form={form} />}
          {error && (
            <div className="login-error" style={{ marginTop: 16 }}>
              <span>✕</span> {error}
            </div>
          )}
        </div>

        <div className="reg-footer">
          <button className="btn btn-quiet" onClick={goBack} disabled={submitting}>
            {step === 0 ? 'Cancelar' : '← Voltar'}
          </button>
          <button
            className="btn btn-primary btn-lg"
            disabled={!canAdvance()}
            onClick={goNext}
          >
            {submitting
              ? 'Criando conta…'
              : step === REGISTER_STEPS.length - 1
                ? 'Entrar na plataforma →'
                : 'Continuar →'}
          </button>
        </div>
      </main>
    </div>
  );
}

function StepIdentidade({ form, update }) {
  return (
    <>
      <div className="eyebrow">Passo 01</div>
      <h2 className="reg-title">Vamos começar pelo essencial</h2>
      <p className="reg-sub">Em menos de um minuto sua conta está pronta. Você poderá ajustar seu plano de estudos depois nas configurações.</p>

      <div className="reg-form">
        <div className="input-group">
          <label className="input-label">Nome completo</label>
          <input className="input-field" placeholder="Ex.: Ana Beatriz Marques"
                 value={form.nome} onChange={e => update({ nome: e.target.value })} />
        </div>
        <div className="input-group">
          <label className="input-label">E-mail</label>
          <input className="input-field" type="email" placeholder="voce@email.com"
                 value={form.email} onChange={e => update({ email: e.target.value })} />
          <div className="input-hint">Será usado para login e recuperação de senha.</div>
        </div>
        <div className="input-group">
          <label className="input-label">Senha</label>
          <input className="input-field" type="password" placeholder="Mínimo 8 caracteres"
                 value={form.senha} onChange={e => update({ senha: e.target.value })} />
          <PasswordStrength value={form.senha} />
        </div>

        <label className="reg-check">
          <input type="checkbox" defaultChecked />
          <span>Concordo com os <span title="Em breve" style={{textDecoration:'underline', cursor:'help', color:'var(--text-muted)'}}>termos de uso</span> e <span title="Em breve" style={{textDecoration:'underline', cursor:'help', color:'var(--text-muted)'}}>política de privacidade</span>.</span>
        </label>
      </div>
    </>
  );
}

function PasswordStrength({ value }) {
  const score = (() => {
    let s = 0;
    if (value.length >= 8)  s++;
    if (value.length >= 12) s++;
    if (/[A-Z]/.test(value)) s++;
    if (/[0-9]/.test(value)) s++;
    if (/[^a-zA-Z0-9]/.test(value)) s++;
    return Math.min(s, 4);
  })();
  const labels = ['muito fraca', 'fraca', 'razoável', 'boa', 'excelente'];
  const colors = ['#c4607080', '#a63f50', '#fba93a', '#4a9967', '#2d7a50'];
  return (
    <div className="pwd-strength">
      <div className="pwd-bars">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="pwd-bar" style={{ background: i < score ? colors[score] : 'var(--bege)' }} />
        ))}
      </div>
      <span className="pwd-strength-label" style={{ color: value ? colors[score] : 'var(--text-muted)' }}>
        {value ? labels[score] : 'digite uma senha'}
      </span>
    </div>
  );
}

function StepObjetivo({ form, update }) {
  const edicoes = [
    { id: 'XL',     label: 'XL Exame · Próximo',   data: 'Set/2026', destaque: true },
    { id: 'XLI',    label: 'XLI Exame',             data: 'Jan/2027' },
    { id: 'XLII',   label: 'XLII Exame',            data: 'Mai/2027' },
    { id: 'aberto', label: 'Sem prazo definido',    data: 'Estudo livre' },
  ];
  return (
    <>
      <div className="eyebrow">Passo 02</div>
      <h2 className="reg-title">Para qual exame você está estudando?</h2>
      <p className="reg-sub">Com a data da prova, ajustamos o tempo de estudo recomendado e a dificuldade das questões.</p>

      <div className="reg-options">
        {edicoes.map(e => (
          <button key={e.id} type="button"
                  className={`reg-opt ${form.edicao === e.id ? 'is-active' : ''}`}
                  onClick={() => update({ edicao: e.id })}>
            <div className="reg-opt-radio">{form.edicao === e.id && <span />}</div>
            <div className="reg-opt-text">
              <div className="reg-opt-label">
                {e.label}
                {e.destaque && <span className="chip chip-amarelo" style={{ marginLeft: 8 }}>🔥 mais escolhido</span>}
              </div>
              <div className="reg-opt-meta">{e.data}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="reg-pair">
        <div className="input-group">
          <label className="input-label">Fase alvo</label>
          <select className="select-field" value={form.faseAlvo} onChange={e => update({ faseAlvo: e.target.value })}>
            <option value="1">1ª Fase — Objetiva</option>
            <option value="2">2ª Fase — Prático-profissional</option>
            <option value="ambas">Estou estudando para as duas</option>
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Data aproximada da prova (opcional)</label>
          <input type="date" className="input-field" value={form.dataProva}
                 onChange={e => update({ dataProva: e.target.value })} />
        </div>
      </div>
    </>
  );
}

const AREAS_SEGUNDA_FASE = [
  { id: 'civil',       label: 'Direito Civil' },
  { id: 'penal',       label: 'Direito Penal' },
  { id: 'trabalho',    label: 'Direito do Trabalho' },
  { id: 'trib',        label: 'Direito Tributário' },
  { id: 'adm',         label: 'Direito Administrativo' },
  { id: 'const',       label: 'Direito Constitucional' },
  { id: 'empresarial', label: 'Direito Empresarial' },
];

function recomendarMinutos(dataProva) {
  if (!dataProva) return 30;
  const dias = Math.ceil((new Date(dataProva) - Date.now()) / 864e5);
  if (dias > 180) return 30;
  if (dias > 90)  return 45;
  if (dias > 30)  return 60;
  return 90;
}

function StepRotina({ form, update }) {
  const minutos = [15, 30, 45, 60, 90];
  const recomendado = recomendarMinutos(form.dataProva);

  // Pré-seleciona o tempo recomendado quando o passo abre
  useEffect(() => {
    update({ minutosDia: recomendado });
  }, []);

  return (
    <>
      <div className="eyebrow">Passo 03</div>
      <h2 className="reg-title">Como será sua rotina?</h2>
      <p className="reg-sub">Configuramos seu plano com base nessas escolhas. Você pode mudar tudo depois.</p>

      <div className="reg-section-title">Tempo diário disponível</div>
      <div className="reg-chips">
        {minutos.map(m => (
          <button key={m} type="button"
                  className={`reg-chip-btn ${form.minutosDia === m ? 'is-active' : ''}`}
                  onClick={() => update({ minutosDia: m })}>
            {m} min
            {m === recomendado && form.dataProva && (
              <span className="chip chip-amarelo" style={{marginLeft:6, fontSize:10, padding:'1px 6px'}}>recomendado</span>
            )}
          </button>
        ))}
      </div>
      {form.dataProva && (
        <div style={{fontSize:'var(--text-sm)', color:'var(--text-muted)', marginTop:8}}>
          Com a sua prova em {new Date(form.dataProva).toLocaleDateString('pt-BR', {day:'2-digit', month:'short', year:'numeric'})}, recomendamos {recomendado} min/dia.
        </div>
      )}

      <div className="reg-section-title" style={{ marginTop: 24 }}>
        Área da 2ª fase escolhida
      </div>
      <div className="reg-areas">
        {AREAS_SEGUNDA_FASE.map(a => (
          <button key={a.id} type="button"
                  className={`reg-area ${form.area_segunda_fase === a.id ? 'is-active' : ''}`}
                  onClick={() => update({ area_segunda_fase: a.id })}>
            <span className="reg-area-ic">{form.area_segunda_fase === a.id ? '●' : '○'}</span>
            <span className="reg-area-label">{a.label}</span>
            {form.area_segunda_fase === a.id && <span className="reg-area-check">✓</span>}
          </button>
        ))}
      </div>
    </>
  );
}

function StepPronto({ form }) {
  const areaLabel = AREAS_SEGUNDA_FASE.find(a => a.id === form.area_segunda_fase)?.label || form.area_segunda_fase;
  return (
    <div className="reg-pronto">
      <div className="reg-pronto-mark"><span>✓</span></div>
      <div className="eyebrow">Tudo pronto</div>
      <h2 className="reg-title">Bem-vindo(a), {form.nome.split(' ')[0] || 'Estudante'}.</h2>
      <p className="reg-sub" style={{ maxWidth: 520, margin: '0 auto' }}>
        Montamos seu plano de estudos com base nas suas escolhas. Você verá ele logo na sua dashboard.
      </p>

      <div className="reg-pronto-resume">
        <div>
          <div className="stat-label">Exame alvo</div>
          <div className="reg-pronto-val">{form.edicao}</div>
        </div>
        <div>
          <div className="stat-label">Rotina</div>
          <div className="reg-pronto-val">{form.minutosDia} min/dia</div>
        </div>
        <div>
          <div className="stat-label">2ª Fase</div>
          <div className="reg-pronto-val">{areaLabel}</div>
        </div>
      </div>
    </div>
  );
}

window.AuthFlow = {
  SplashScreen,
  RegisterFlow,
  EmailVerifyPendingScreen,
  ForgotPasswordScreen,
  VerifyEmailScreen,
  ResetPasswordScreen,
};
