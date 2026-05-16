/* global React */
const { useState, useEffect } = React;

/* =========================================================
   Tela inicial / splash — entrada do app
   ========================================================= */
function SplashScreen({ onStart, onLogin }) {
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
          ao <em>«passar na Ordem».»</em>
        </h1>
        <p className="splash-sub">
          Mais de 8.000 questões comentadas, simulados oficiais e plano de estudo adaptativo.
          Estude 20 minutos por dia e veja seu desempenho crescer questão a questão.
        </p>

        <div className="splash-cta-row">
          <button className="btn btn-cta btn-lg" onClick={onStart}>
            🎯 Criar conta grátis
          </button>
          <button className="btn btn-ghost btn-lg" onClick={onLogin}>
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

function SplashPreviewCard() {
  // mini-amostra de questão decorativa
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

function RegisterFlow({ onCancel, onComplete }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    nome: '', email: '', senha: '',
    edicao: 'XLI', faseAlvo: '1', dataProva: '',
    minutosDia: 30, areas: ['civil', 'const', 'etica'],
  });
  const update = (patch) => setForm(f => ({ ...f, ...patch }));

  const canAdvance = () => {
    if (step === 0) return form.nome.trim().length > 1 && /.+@.+\..+/.test(form.email) && form.senha.length >= 6;
    if (step === 1) return !!form.edicao;
    if (step === 2) return form.areas.length > 0;
    return true;
  };

  const goNext = () => {
    if (step < REGISTER_STEPS.length - 1) setStep(s => s + 1);
    else onComplete(form);
  };
  const goBack = () => step > 0 ? setStep(s => s - 1) : onCancel();

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
        </div>

        <div className="reg-footer">
          <button className="btn btn-quiet" onClick={goBack}>
            {step === 0 ? 'Cancelar' : '← Voltar'}
          </button>
          <button className="btn btn-primary btn-lg" disabled={!canAdvance()} onClick={goNext}>
            {step === REGISTER_STEPS.length - 1 ? 'Entrar na plataforma →' : 'Continuar →'}
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
      <p className="reg-sub">Em menos de um minuto sua conta está pronta. Você poderá completar o perfil depois.</p>

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
          <input className="input-field" type="password" placeholder="Mínimo 6 caracteres"
                 value={form.senha} onChange={e => update({ senha: e.target.value })} />
          <PasswordStrength value={form.senha} />
        </div>

        <div className="reg-divider"><span>ou</span></div>
        <div className="reg-oauth">
          <button className="reg-oauth-btn" type="button">
            <span className="reg-oauth-ic" style={{background:'#fff', color:'#444'}}>G</span>
            Continuar com Google
          </button>
          <button className="reg-oauth-btn" type="button">
            <span className="reg-oauth-ic" style={{background:'#000', color:'#fff'}}>⌘</span>
            Continuar com Apple
          </button>
        </div>

        <label className="reg-check">
          <input type="checkbox" defaultChecked />
          <span>Concordo com os <a>termos de uso</a> e <a>política de privacidade</a>.</span>
        </label>
      </div>
    </>
  );
}

function PasswordStrength({ value }) {
  const score = (() => {
    let s = 0;
    if (value.length >= 6) s++;
    if (value.length >= 10) s++;
    if (/[A-Z]/.test(value)) s++;
    if (/[0-9]/.test(value)) s++;
    if (/[^a-zA-Z0-9]/.test(value)) s++;
    return Math.min(s, 4);
  })();
  const labels = ['muito fraca', 'fraca', 'razoável', 'boa', 'excelente'];
  const colors = ['#c4607080','#a63f50','#fba93a','#4a9967','#2d7a50'];
  return (
    <div className="pwd-strength">
      <div className="pwd-bars">
        {[0,1,2,3].map(i => (
          <div key={i} className="pwd-bar" style={{ background: i < score ? colors[score] : 'var(--bege)' }} />
        ))}
      </div>
      <span className="pwd-strength-label" style={{color: value ? colors[score] : 'var(--text-muted)'}}>
        {value ? labels[score] : 'digite uma senha'}
      </span>
    </div>
  );
}

function StepObjetivo({ form, update }) {
  const edicoes = [
    { id: 'XL',   label: 'XL Exame · Próximo',  data: 'Set/2026', destaque: true },
    { id: 'XLI',  label: 'XLI Exame',           data: 'Jan/2027' },
    { id: 'XLII', label: 'XLII Exame',          data: 'Mai/2027' },
    { id: 'aberto', label: 'Sem prazo definido', data: 'Estudo livre' },
  ];
  return (
    <>
      <div className="eyebrow">Passo 02</div>
      <h2 className="reg-title">Qual é o seu objetivo?</h2>
      <p className="reg-sub">Adaptamos o plano de estudo, a dificuldade e os simulados ao seu exame alvo.</p>

      <div className="reg-options">
        {edicoes.map(e => (
          <button key={e.id}
                  type="button"
                  className={`reg-opt ${form.edicao === e.id ? 'is-active' : ''}`}
                  onClick={() => update({ edicao: e.id })}>
            <div className="reg-opt-radio">{form.edicao === e.id && <span />}</div>
            <div className="reg-opt-text">
              <div className="reg-opt-label">{e.label}{e.destaque && <span className="chip chip-amarelo" style={{marginLeft:8}}>🔥 mais escolhido</span>}</div>
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

function StepRotina({ form, update }) {
  const { AREAS } = window.AppData;
  const minutos = [15, 30, 45, 60, 90];
  const toggleArea = (id) => {
    const next = form.areas.includes(id) ? form.areas.filter(a => a !== id) : [...form.areas, id];
    update({ areas: next });
  };
  return (
    <>
      <div className="eyebrow">Passo 03</div>
      <h2 className="reg-title">Como será sua rotina?</h2>
      <p className="reg-sub">Configuramos seu plano com base nessas escolhas. Você pode mudar tudo depois.</p>

      <div className="reg-section-title">Tempo diário disponível</div>
      <div className="reg-chips">
        {minutos.map(m => (
          <button key={m}
                  type="button"
                  className={`reg-chip-btn ${form.minutosDia === m ? 'is-active' : ''}`}
                  onClick={() => update({ minutosDia: m })}>
            {m} min
          </button>
        ))}
      </div>

      <div className="reg-section-title" style={{marginTop:24}}>
        Áreas de maior interesse <span className="reg-section-sub">· selecione 1 ou mais</span>
      </div>
      <div className="reg-areas">
        {Object.values(AREAS).map(a => {
          const active = form.areas.includes(a.id);
          return (
            <button key={a.id}
                    type="button"
                    className={`reg-area ${active ? 'is-active' : ''}`}
                    onClick={() => toggleArea(a.id)}>
              <span className="reg-area-ic">{a.icon}</span>
              <span className="reg-area-label">{a.label}</span>
              <span className="reg-area-check">{active ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function StepPronto({ form }) {
  const { AREAS } = window.AppData;
  const minutosLabel = form.minutosDia + ' min/dia';
  return (
    <div className="reg-pronto">
      <div className="reg-pronto-mark">
        <span>✓</span>
      </div>
      <div className="eyebrow">Tudo pronto</div>
      <h2 className="reg-title">Bem-vindo(a), {form.nome.split(' ')[0] || 'Estudante'}.</h2>
      <p className="reg-sub" style={{maxWidth:520, margin:'0 auto'}}>
        Montamos seu plano de estudos com base nas suas escolhas. Você verá ele logo na sua dashboard.
      </p>

      <div className="reg-pronto-resume">
        <div>
          <div className="stat-label">Exame alvo</div>
          <div className="reg-pronto-val">{form.edicao}</div>
        </div>
        <div>
          <div className="stat-label">Rotina</div>
          <div className="reg-pronto-val">{minutosLabel}</div>
        </div>
        <div>
          <div className="stat-label">Áreas</div>
          <div className="reg-pronto-val">{form.areas.length} selecionadas</div>
        </div>
      </div>

      <div className="reg-pronto-areas">
        {form.areas.map(id => (
          <span key={id} className={`area-pill ${AREAS[id].pillClass}`}>
            {AREAS[id].icon} {AREAS[id].label}
          </span>
        ))}
      </div>
    </div>
  );
}

window.AuthFlow = { SplashScreen, RegisterFlow };
