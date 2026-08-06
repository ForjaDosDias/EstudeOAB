/* global React */
const { useState: useStateTrilha, useEffect: useEffectTrilha, useCallback: useCallbackTrilha } = React;

// Rótulo das faixas de incidência (ordem de progressão da trilha)
const FAIXA_INFO = {
  alta:    { titulo: 'Alta incidência',      sub: 'cai 1,5 ou mais por prova',  cor: 'var(--bordo)' },
  media:   { titulo: 'Incidência média',     sub: 'cai ~1 por prova',           cor: 'var(--amarelo-dark)' },
  pontual: { titulo: 'Incidência pontual',   sub: 'aparece em alguns exames',   cor: 'var(--text-muted)' },
};

// O AppData.AREAS cobre só as 7 áreas antigas; o banco tem 13. Este mapa
// completa os rótulos que faltam (ramos processuais e transversais).
const AREA_EXTRA = {
  'proc civil':       { label: 'Proc. Civil',    icon: '⚖️' },
  'proc penal':       { label: 'Proc. Penal',    icon: '🔍' },
  'proc trab':        { label: 'Proc. Trabalho', icon: '👷' },
  'trib e proc trib': { label: 'Tributário',     icon: '💰' },
  'empresarial':      { label: 'Empresarial',    icon: '🏢' },
  'human':            { label: 'Direitos Humanos', icon: '🕊️' },
  'outros':           { label: 'Complementares', icon: '📚' },
};

/* =========================================================
   Trilha por incidência — o aluno domina o que mais cai antes
   de gastar tempo no que cai pouco. Uma disciplina só abre na
   faixa seguinte quando a anterior estiver concluída.
   ========================================================= */
function TrilhaPage({ user, onExit, onNavigate, onUpgrade, onUserUpdate }) {
  const [phase,   setPhase]   = useStateTrilha('pick'); // pick | map | run | result
  const [trilha,  setTrilha]  = useStateTrilha(null);
  const [faixas,  setFaixas]  = useStateTrilha(null);
  const [loading, setLoading] = useStateTrilha(false);
  const [erro,    setErro]    = useStateTrilha(null);
  const [session, setSession] = useStateTrilha(null);

  const { AREAS } = window.AppData;
  const rotuloArea = (id) =>
    AREAS[id] || AREA_EXTRA[id] || { label: id, icon: '⚖️', pillClass: 'area-pill-civil' };

  const carregarMapa = useCallbackTrilha((slug) => {
    setLoading(true); setErro(null);
    return window.apiFetch(`/trilhas/${slug}/mapa`)
      .then((d) => { setFaixas(d.faixas); setTrilha(d.trilha); })
      .catch((e) => setErro(e?.error || 'Erro ao carregar a trilha.'))
      .finally(() => setLoading(false));
  }, []);

  const escolherTrilha = (t) => { setTrilha(t); setPhase('map'); carregarMapa(t.slug); };

  const iniciarTema = async (tema) => {
    setErro(null);
    try {
      const data = await window.apiFetch(`/trilhas/${trilha.slug}/tema/${tema.tema_id}/questoes?total=10`);
      if (!data.questoes || data.questoes.length === 0) {
        setErro('Esse tema ainda não tem questões cadastradas.');
        return;
      }
      const sess = await window.apiFetch('/sessions', {
        method: 'POST',
        body: JSON.stringify({
          modo: 'personalizado',
          areas: [tema.disciplina],
          total_questoes: data.questoes.length,
        }),
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
        setErro('Tema bloqueado — conclua esta disciplina na faixa anterior primeiro.');
      } else {
        setErro(e?.error || 'Erro ao iniciar o tema.');
      }
    }
  };

  const voltarAoMapa = () => { setSession(null); setPhase('map'); carregarMapa(trilha.slug); };

  // ── Rodando um tema pelo runner de prática (registra respostas) ────────────
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
            <p className="page-sub">
              Os temas aparecem na ordem em que mais caem na prova. Domine os de alta
              incidência e a disciplina libera a faixa seguinte.
            </p>
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

  // ── Mapa da trilha (faixa de incidência → disciplina → temas) ──────────────
  return (
    <div className="practice-setup fade-up">
      <div className="practice-setup-header">
        <div>
          <div className="eyebrow">Trilha · {trilha?.nome}</div>
          <h1 className="page-h1">O que mais cai, primeiro.</h1>
          <p className="page-sub">{trilha?.descricao}</p>
        </div>
        <button className="btn btn-quiet" onClick={() => { setPhase('pick'); setFaixas(null); }}>
          ← Trocar de trilha
        </button>
      </div>

      {erro && <div className="login-error" style={{ marginBottom: 16 }}><span>✕</span> {erro}</div>}
      {loading && <div style={{ color: 'var(--text-muted)' }}>Carregando trilha…</div>}

      {!loading && faixas && faixas.length === 0 && (
        <div className="practice-setup-card" style={{ color: 'var(--text-muted)' }}>
          Ainda não há questões classificadas por tema nesta trilha.
        </div>
      )}

      {!loading && faixas && faixas.map((f) => {
        const info = FAIXA_INFO[f.faixa] || { titulo: f.label, sub: '', cor: 'var(--text-muted)' };
        return (
          <div key={f.faixa} style={{ marginBottom: 26 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 12px' }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: info.cor }}>{info.titulo}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{info.sub}</span>
            </div>

            {f.disciplinas.map((disc) => {
              const area = rotuloArea(disc.disciplina);
              return (
                <div key={disc.disciplina} className="practice-setup-card" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <span className={`area-pill ${area.pillClass || 'area-pill-civil'}`} style={{ padding: '4px 10px' }}>
                      {area.icon} {area.label}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {disc.temas.length} tema{disc.temas.length > 1 ? 's' : ''} · ~{disc.incidencia_total} questões/prova
                    </span>
                    {disc.bloqueado && (
                      <span className="chip chip-neutral" style={{ marginLeft: 'auto' }}>
                        🔒 conclua a faixa anterior
                      </span>
                    )}
                    {!disc.bloqueado && disc.concluida && (
                      <span className="chip chip-neutral" style={{ marginLeft: 'auto', color: 'var(--green-dark)' }}>
                        ✓ concluída
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {disc.temas.map((t) => {
                      const selo = t.bloqueado ? '🔒' : t.concluido ? '✓' : '▶';
                      return (
                        <button
                          key={t.tema_id}
                          onClick={() => !t.bloqueado && iniciarTema(t)}
                          disabled={t.bloqueado}
                          className="card"
                          style={{
                            flex: '1 1 210px', minWidth: 210, textAlign: 'left', padding: 13,
                            cursor: t.bloqueado ? 'not-allowed' : 'pointer',
                            opacity: t.bloqueado ? 0.55 : 1,
                            border: `1px solid ${t.concluido ? 'var(--green-dark)' : 'var(--border-strong)'}`,
                            borderRadius: 12, background: 'var(--bg-surface)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{t.nome}</span>
                            <span style={{ fontSize: 15 }}>{selo}</span>
                          </div>
                          <div className="progress-track" style={{ marginBottom: 6 }}>
                            <div className="progress-fill" style={{ width: `${t.pct}%`, background: info.cor }} />
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            cai ~{t.incidencia}/prova ·{' '}
                            {t.concluido
                              ? `concluído (${t.pct}%)`
                              : t.bloqueado
                                ? 'bloqueado'
                                : `${t.respondidas}/${t.min_necessario} p/ concluir`}
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
      })}
    </div>
  );
}

window.Trilha = { TrilhaPage };
