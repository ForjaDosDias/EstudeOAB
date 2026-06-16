/* global React */
const { useState: useStateTrilha, useEffect: useEffectTrilha, useCallback: useCallbackTrilha } = React;

// Rótulos dos tiers de dificuldade (ordem de progressão dentro da disciplina)
const DIF_INFO = {
  baixa: { label: 'Fácil',   cor: 'var(--green-dark)' },
  media: { label: 'Médio',   cor: 'var(--amarelo-dark)' },
  alta:  { label: 'Difícil', cor: 'var(--bordo)' },
};

/* =========================================================
   Trilha gamificada — disciplinas por incidência, checkpoints
   por dificuldade com desbloqueio sequencial por disciplina.
   ========================================================= */
function TrilhaPage({ user, onExit, onNavigate, onUpgrade, onUserUpdate }) {
  const [phase,   setPhase]   = useStateTrilha('pick'); // pick | map | run | result
  const [trilha,  setTrilha]  = useStateTrilha(null);
  const [mapa,    setMapa]    = useStateTrilha(null);    // disciplinas[]
  const [loading, setLoading] = useStateTrilha(false);
  const [erro,    setErro]    = useStateTrilha(null);
  const [session, setSession] = useStateTrilha(null);

  const isPremium = user?.plan === 'premium' || user?.role === 'admin';
  const { AREAS } = window.AppData;

  const carregarMapa = useCallbackTrilha((slug) => {
    setLoading(true); setErro(null);
    return window.apiFetch(`/trilhas/${slug}/mapa`)
      .then((d) => { setMapa(d.disciplinas); setTrilha(d.trilha); })
      .catch((e) => setErro(e?.error || 'Erro ao carregar a trilha.'))
      .finally(() => setLoading(false));
  }, []);

  const escolherTrilha = (t) => { setTrilha(t); setPhase('map'); carregarMapa(t.slug); };

  const iniciarCheckpoint = async (area, dificuldade) => {
    setErro(null);
    try {
      const data = await window.apiFetch(`/trilhas/${trilha.slug}/checkpoint/${area}/${dificuldade}/questoes?total=10`);
      if (!data.questoes || data.questoes.length === 0) {
        setErro('Esse checkpoint ainda não tem questões cadastradas.');
        return;
      }
      const sess = await window.apiFetch('/sessions', {
        method: 'POST',
        body: JSON.stringify({ modo: 'personalizado', areas: [area], total_questoes: data.questoes.length }),
      });
      setSession({
        id: sess.id,
        questoes: data.questoes.map(window.Practice.formatarQuestao),
        respostas: [],
        idx: 0,
      });
      setPhase('run');
    } catch (e) {
      if (e?.code === 'CHECKPOINT_LOCKED') {
        setErro('Esse checkpoint está bloqueado — conclua o anterior desta disciplina primeiro.');
      } else {
        setErro(e?.error || 'Erro ao iniciar o checkpoint.');
      }
    }
  };

  const voltarAoMapa = () => { setSession(null); setPhase('map'); carregarMapa(trilha.slug); };

  // ── Gate Premium (mesma linguagem visual do resto do app) ──────────────────
  if (!isPremium) {
    return (
      <div style={{ padding: 64, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Trilha de estudos é Premium</div>
        <div style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
          Avance tema por tema, na ordem em que mais cai na prova, desbloqueando checkpoints conforme acerta.
        </div>
        <button className="btn-primary" onClick={onUpgrade}>Desbloquear a trilha</button>
      </div>
    );
  }

  // ── Rodando um checkpoint pelo runner de prática (registra respostas) ──────
  if (phase === 'run' && session) {
    return (
      <window.Practice.PracticeRunner
        session={session}
        setSession={setSession}
        onFinish={() => setPhase('result')}
        onExit={voltarAoMapa}
      />
    );
  }
  if (phase === 'result' && session) {
    return (
      <window.Practice.PracticeResult
        session={session}
        onRetry={voltarAoMapa}
        onExit={voltarAoMapa}
        onNavigate={onNavigate}
        onUserUpdate={onUserUpdate}
      />
    );
  }

  // ── Escolha da trilha ──────────────────────────────────────────────────────
  if (phase === 'pick') {
    return (
      <div className="practice-setup fade-up">
        <div className="practice-setup-header">
          <div>
            <div className="eyebrow">Estudo guiado</div>
            <h1 className="page-h1">Sua trilha de aprovação.</h1>
            <p className="page-sub">Escolha uma trilha. As disciplinas aparecem na ordem em que mais caem na prova, e cada uma libera do fácil ao difícil conforme você acerta.</p>
          </div>
          <button className="btn btn-quiet" onClick={onExit}>← Voltar à dashboard</button>
        </div>
        <div className="practice-setup-card">
          <div className="reg-section-title">Trilhas disponíveis</div>
          <window.Premium.TrilhaPicker user={user} onUpgrade={onUpgrade} onPick={escolherTrilha} />
        </div>
      </div>
    );
  }

  // ── Mapa da trilha (disciplinas × checkpoints) ─────────────────────────────
  return (
    <div className="practice-setup fade-up">
      <div className="practice-setup-header">
        <div>
          <div className="eyebrow">Trilha · {trilha?.nome}</div>
          <h1 className="page-h1">Seus checkpoints.</h1>
          <p className="page-sub">{trilha?.descricao}</p>
        </div>
        <button className="btn btn-quiet" onClick={() => { setPhase('pick'); setMapa(null); }}>← Trocar de trilha</button>
      </div>

      {erro && <div className="login-error" style={{ marginBottom: 16 }}><span>✕</span> {erro}</div>}
      {loading && <div style={{ color: 'var(--text-muted)' }}>Carregando trilha…</div>}

      {!loading && mapa && mapa.length === 0 && (
        <div className="practice-setup-card" style={{ color: 'var(--text-muted)' }}>
          Ainda não há questões cadastradas para as disciplinas desta trilha.
        </div>
      )}

      {!loading && mapa && mapa.map((disc, i) => {
        const area = AREAS[disc.area] || { label: disc.area, icon: '⚖️', pillClass: 'area-pill-civil' };
        return (
          <div key={disc.area} className="practice-setup-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span className="chip chip-neutral" style={{ fontFamily: 'var(--font-mono)' }}>#{i + 1}</span>
              <span className={`area-pill ${area.pillClass}`} style={{ padding: '4px 10px' }}>{area.icon} {area.label}</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                cai ~{disc.incidencia_avg}/prova · {disc.total_questoes} questões
              </span>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {disc.checkpoints.map((cp) => {
                const info = DIF_INFO[cp.dificuldade] || { label: cp.dificuldade, cor: 'var(--text-muted)' };
                const estado = cp.bloqueado ? 'bloqueado' : cp.concluido ? 'concluido' : 'aberto';
                const selo = cp.bloqueado ? '🔒' : cp.concluido ? '✓' : '▶';
                return (
                  <button
                    key={cp.dificuldade}
                    onClick={() => !cp.bloqueado && iniciarCheckpoint(disc.area, cp.dificuldade)}
                    disabled={cp.bloqueado}
                    className="card"
                    style={{
                      flex: '1 1 150px', minWidth: 150, textAlign: 'left', padding: 14,
                      cursor: cp.bloqueado ? 'not-allowed' : 'pointer',
                      opacity: cp.bloqueado ? 0.55 : 1,
                      border: `1px solid ${cp.concluido ? 'var(--green-dark)' : 'var(--border-strong)'}`,
                      borderRadius: 12, background: 'var(--bg-surface)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: info.cor }}>{info.label}</span>
                      <span style={{ fontSize: 16 }}>{selo}</span>
                    </div>
                    <div className="progress-track" style={{ marginBottom: 6 }}>
                      <div className="progress-fill" style={{ width: `${cp.pct}%`, background: info.cor }} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {estado === 'concluido'
                        ? `Concluído · ${cp.pct}% de acerto`
                        : estado === 'bloqueado'
                          ? 'Conclua o tier anterior'
                          : `${cp.respondidas}/${cp.total} respondidas · ${cp.pct}%`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

window.Trilha = { TrilhaPage };
