/* global React */
const { useState: useStatePremium, useEffect: useEffectPremium, useRef: useRefPremium } = React;

// ── Página de upgrade Premium (Pix + Cartão via Mercado Pago) ─────────────────

const BENEFICIOS_PREMIUM = [
  { icon: '📊', titulo: 'Estatísticas completas', desc: 'Evolução por área, streak e plano de estudos personalizado.' },
  { icon: '🛤️', titulo: 'Trilhas de estudo', desc: 'Sequências guiadas pelas áreas que mais caem na prova.' },
  { icon: '🌙', titulo: 'Tema escuro', desc: 'Estude à noite sem cansar a vista.' },
  { icon: '🚫', titulo: 'Zero anúncios', desc: 'Nenhuma interrupção entre você e a aprovação.' },
];

function PremiumPage({ user, onUpgraded, onBack }) {
  const [config, setConfig]   = useStatePremium(null);
  const [tab, setTab]         = useStatePremium('pix'); // 'pix' | 'cartao'
  const [pix, setPix]         = useStatePremium(null);  // { paymentId, qrCode, qrCodeBase64 }
  const [busy, setBusy]       = useStatePremium(false);
  const [erro, setErro]       = useStatePremium(null);
  const [copiado, setCopiado] = useStatePremium(false);
  const pollRef = useRefPremium(null);

  const isPremium = user?.plan === 'premium' || user?.role === 'admin';

  useEffectPremium(() => {
    window.apiFetch('/payments/config').then(setConfig).catch(() => {});
    return () => clearInterval(pollRef.current);
  }, []);

  const preco = config ? (config.valorCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '…';

  const iniciarPix = async () => {
    setBusy(true); setErro(null);
    try {
      const data = await window.apiFetch('/payments/pix', { method: 'POST' });
      setPix(data);
      // polling do status até aprovar
      pollRef.current = setInterval(async () => {
        try {
          const st = await window.apiFetch(`/payments/${data.paymentId}/status`);
          if (st.status === 'approved') {
            clearInterval(pollRef.current);
            onUpgraded();
          }
        } catch { /* tenta de novo no próximo tick */ }
      }, 5000);
    } catch (e) {
      setErro(e?.error || 'Não foi possível gerar o Pix. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const copiarPix = () => {
    navigator.clipboard.writeText(pix.qrCode).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  };

  if (isPremium) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
        <h1 style={{ fontFamily: 'Playfair Display', marginBottom: 8 }}>Você já é Premium</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
          Estatísticas, trilhas, tema escuro e zero anúncios estão liberados na sua conta.
        </p>
        <button className="btn-primary" onClick={onBack}>Voltar ao painel</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
      <button className="btn-secondary" onClick={onBack} style={{ marginBottom: 20 }}>← Voltar</button>

      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'Playfair Display', marginBottom: 6 }}>Seja Premium</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>
          Tudo que o plano gratuito tem, mais as ferramentas que aceleram sua aprovação — <strong>{preco}/mês</strong>.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {BENEFICIOS_PREMIUM.map((b) => (
            <div key={b.titulo} className="card" style={{ display: 'flex', gap: 14, padding: 16, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 24 }}>{b.icon}</div>
              <div>
                <div style={{ fontWeight: 700 }}>{b.titulo}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{b.desc}</div>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            Pagamento único — 30 dias de acesso, renove quando quiser. Sem fidelidade.
          </div>
        </div>

        <div className="card" style={{ flex: '1 1 340px', padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>Forma de pagamento</div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className={tab === 'pix' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('pix')}>Pix</button>
            <button className={tab === 'cartao' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('cartao')}>Cartão</button>
          </div>

          {erro && <div className="toast toast-error" style={{ marginBottom: 12 }}>{erro}</div>}

          {tab === 'pix' && !pix && (
            <button className="btn-primary" disabled={busy} onClick={iniciarPix} style={{ width: '100%' }}>
              {busy ? 'Gerando Pix…' : `Pagar ${preco} com Pix`}
            </button>
          )}

          {tab === 'pix' && pix && (
            <div style={{ textAlign: 'center' }}>
              {pix.qrCodeBase64 && (
                <img
                  src={`data:image/png;base64,${pix.qrCodeBase64}`}
                  alt="QR Code Pix"
                  style={{ width: 220, height: 220, margin: '0 auto 12px', display: 'block' }}
                />
              )}
              <button className="btn-secondary" onClick={copiarPix} style={{ width: '100%', marginBottom: 8 }}>
                {copiado ? '✓ Copiado!' : 'Copiar código Pix copia-e-cola'}
              </button>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Aguardando pagamento… a tela atualiza sozinha após a confirmação.
              </div>
            </div>
          )}

          {tab === 'cartao' && (
            <CardForm config={config} onErro={setErro} onAprovado={onUpgraded} />
          )}
        </div>
      </div>
    </div>
  );
}

// Formulário de cartão — tokeniza com o SDK MercadoPago.js v2
function CardForm({ config, onErro, onAprovado }) {
  const [sdkPronto, setSdkPronto] = useStatePremium(!!window.MercadoPago);
  const [busy, setBusy]           = useStatePremium(false);
  const [form, setForm] = useStatePremium({
    numero: '', nome: '', validade: '', cvv: '', cpf: '',
  });

  useEffectPremium(() => {
    if (window.MercadoPago) return;
    const s = document.createElement('script');
    s.src = 'https://sdk.mercadopago.com/js/v2';
    s.onload = () => setSdkPronto(true);
    document.body.appendChild(s);
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const pagar = async () => {
    if (!config?.publicKey) {
      onErro('Pagamento com cartão indisponível no momento. Use o Pix.');
      return;
    }
    setBusy(true); onErro(null);
    try {
      const mp = new window.MercadoPago(config.publicKey);
      const [mes, ano] = form.validade.split('/').map((v) => v.trim());
      const cardToken = await mp.createCardToken({
        cardNumber: form.numero.replace(/\s/g, ''),
        cardholderName: form.nome,
        cardExpirationMonth: mes,
        cardExpirationYear: ano?.length === 2 ? `20${ano}` : ano,
        securityCode: form.cvv,
        identificationType: 'CPF',
        identificationNumber: form.cpf.replace(/\D/g, ''),
      });

      const metodos = await mp.getPaymentMethods({ bin: form.numero.replace(/\s/g, '').slice(0, 6) });
      const metodo = metodos?.results?.[0];

      const result = await window.apiFetch('/payments/card', {
        method: 'POST',
        body: JSON.stringify({
          token: cardToken.id,
          paymentMethodId: metodo?.id,
          issuerId: metodo?.issuer?.id,
          installments: 1,
        }),
      });

      if (result.status === 'approved') onAprovado();
      else onErro('Pagamento não aprovado. Verifique os dados do cartão.');
    } catch (e) {
      onErro(e?.error || 'Erro ao processar o cartão. Confira os dados.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input className="input" placeholder="Número do cartão" value={form.numero} onChange={set('numero')} />
      <input className="input" placeholder="Nome impresso no cartão" value={form.nome} onChange={set('nome')} />
      <div style={{ display: 'flex', gap: 10 }}>
        <input className="input" placeholder="MM/AA" value={form.validade} onChange={set('validade')} style={{ flex: 1 }} />
        <input className="input" placeholder="CVV" value={form.cvv} onChange={set('cvv')} style={{ flex: 1 }} />
      </div>
      <input className="input" placeholder="CPF do titular" value={form.cpf} onChange={set('cpf')} />
      <button className="btn-primary" disabled={busy || !sdkPronto} onClick={pagar}>
        {busy ? 'Processando…' : 'Pagar com cartão'}
      </button>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
        Processado com segurança pelo Mercado Pago.
      </div>
    </div>
  );
}

// ── Anúncio em vídeo 30s skippable (usuários Free) ────────────────────────────

function AdVideoGate({ onDone, onUpgrade }) {
  const [adConfig, setAdConfig] = useStatePremium(null);
  const [restante, setRestante] = useStatePremium(30);

  useEffectPremium(() => {
    window.apiFetch('/ads/config')
      .then((cfg) => {
        if (!cfg.adsEnabled) { onDone(); return; }
        setAdConfig(cfg);
        setRestante(cfg.duracaoS);
      })
      .catch(() => onDone()); // anúncio nunca bloqueia o estudo
  }, []);

  useEffectPremium(() => {
    if (!adConfig) return;
    const t = setInterval(() => setRestante((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [adConfig]);

  // injeta o bloco do AdSense quando configurado
  useEffectPremium(() => {
    if (!adConfig?.clientId) return;
    if (!document.querySelector('script[src*="adsbygoogle"]')) {
      const s = document.createElement('script');
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adConfig.clientId}`;
      s.async = true;
      s.crossOrigin = 'anonymous';
      document.head.appendChild(s);
    }
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* noop */ }
  }, [adConfig]);

  if (!adConfig) return null;

  const podePular = restante <= adConfig.duracaoS - adConfig.pulavelAposS;

  return (
    <div className="modal-overlay" style={{ zIndex: 999 }}>
      <div className="modal" style={{ maxWidth: 560, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Publicidade</div>

        <div style={{ background: 'var(--azul-dark, #161929)', borderRadius: 12, aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, overflow: 'hidden' }}>
          {adConfig.clientId && adConfig.slotId ? (
            <ins
              className="adsbygoogle"
              style={{ display: 'block', width: '100%', height: '100%' }}
              data-ad-client={adConfig.clientId}
              data-ad-slot={adConfig.slotId}
              data-ad-format="video"
            />
          ) : (
            <div style={{ color: '#f5f0eb', padding: 24 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>▶</div>
              <div>Seu estudo é patrocinado por anúncios no plano gratuito.</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          {restante > 0 && !podePular && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pode pular em {adConfig.duracaoS - adConfig.pulavelAposS - (adConfig.duracaoS - restante)}s…</span>
          )}
          {(podePular || restante === 0) && (
            <button className="btn-primary" onClick={onDone}>
              {restante === 0 ? 'Continuar' : `Pular anúncio (${restante}s restantes)`}
            </button>
          )}
          <button className="btn-secondary" onClick={onUpgrade}>Remover anúncios — seja Premium</button>
        </div>
      </div>
    </div>
  );
}

// ── Badge de moedas (sidebar) ─────────────────────────────────────────────────

function CoinsBadge({ user }) {
  if (!user) return null;
  return (
    <div title="Suas moedas — ganhe ao logar, responder questões e comentar"
         style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 20, background: 'rgba(224,138,16,.12)', color: 'var(--amarelo-dark)', fontWeight: 700, fontSize: 13 }}>
      <span>🪙</span>
      <span>{(user.coins ?? 0).toLocaleString('pt-BR')}</span>
    </div>
  );
}

// ── Seletor de trilhas (Premium) ──────────────────────────────────────────────

function TrilhaPicker({ user, onPick, onUpgrade }) {
  const [trilhas, setTrilhas] = useStatePremium(null);
  const isPremium = user?.plan === 'premium' || user?.role === 'admin';

  useEffectPremium(() => {
    if (!isPremium) return;
    window.apiFetch('/trilhas').then((d) => setTrilhas(d.trilhas)).catch(() => setTrilhas([]));
  }, [isPremium]);

  if (!isPremium) {
    return (
      <div className="card" style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 22, marginBottom: 6 }}>🔒</div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Trilhas de estudo são Premium</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Estude com sequências guiadas pelas áreas que mais caem na prova.
        </div>
        <button className="btn-primary" onClick={onUpgrade}>Desbloquear trilhas</button>
      </div>
    );
  }

  if (!trilhas) return <div style={{ color: 'var(--text-muted)' }}>Carregando trilhas…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {trilhas.map((t) => (
        <button key={t.slug} className="card" onClick={() => onPick(t)}
                style={{ textAlign: 'left', padding: 14, cursor: 'pointer', border: '1px solid var(--border-strong)', borderRadius: 12, background: 'var(--bg-surface)' }}>
          <div style={{ fontWeight: 700 }}>{t.nome}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t.descricao} · {t.total_questoes} questões</div>
        </button>
      ))}
    </div>
  );
}

window.Premium = { PremiumPage, AdVideoGate, CoinsBadge, TrilhaPicker };
