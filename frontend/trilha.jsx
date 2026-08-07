/* global React */
const { useState: useStateTrilha, useEffect: useEffectTrilha, useCallback: useCallbackTrilha } = React;

// Rótulo da faixa de incidência. Deixou de ser a seção de primeiro nível em
// 2026-08-08 — virou etiqueta dentro do subtema. A progressão não mudou: os de
// alta incidência continuam vindo antes e travando os seguintes.
//
// ⚠️ VOCABULÁRIO: na interface, "matéria" é o nível de cima (as 13 de
// `area_direito`) e "subtema" é o de baixo (os 79 da tabela `temas`, que são as
// unidades de estudo). O banco chama o nível de baixo de `tema` — a interface
// não pode, porque o aluno lê "tema" como a matéria inteira.
const FAIXA_INFO = {
  alta:    { titulo: 'alta incidência',    cor: 'var(--bordo)' },
  media:   { titulo: 'incidência média',   cor: 'var(--amarelo-dark)' },
  pontual: { titulo: 'incidência pontual', cor: 'var(--text-muted)' },
};

// A trilha do próprio aluno, montada com as disciplinas que ele escolheu focar
// no onboarding. Não existe na tabela `trilhas` — o servidor resolve o slug.
const SLUG_PESSOAL = 'minha';

/* =========================================================
   Trilha por disciplina — o aluno escolhe a matéria e, dentro dela, domina o
   que mais cai antes de gastar tempo no que cai pouco. Um tema só abre quando
   os de incidência maior da MESMA disciplina estiverem concluídos.
   ========================================================= */
function TrilhaPage({ user, onExit, onNavigate, onUpgrade, onUserUpdate }) {
  const [phase,   setPhase]   = useStateTrilha('map'); // map | pick | run | result
  const [trilha,  setTrilha]  = useStateTrilha(null);
  const [discs,   setDiscs]   = useStateTrilha(null);
  const [aberta,  setAberta]  = useStateTrilha(null);
  const [loading, setLoading] = useStateTrilha(false);
  const [erro,    setErro]    = useStateTrilha(null);
  const [session, setSession] = useStateTrilha(null);

  const { areaInfo } = window.AppData;

  const carregarMapa = useCallbackTrilha((slug) => {
    setLoading(true); setErro(null);
    return window.apiFetch(`/trilhas/${slug}/mapa`)
      .then((d) => { setDiscs(d.disciplinas); setTrilha(d.trilha); })
      .catch((e) => setErro(e?.error || 'Erro ao carregar a trilha.'))
      .finally(() => setLoading(false));
  }, []);

  // Entra direto na trilha do aluno. O catálogo continua acessível em "trocar
  // de trilha" — mas a trilha dele é o padrão, não uma opção escondida.
  useEffectTrilha(() => { carregarMapa(SLUG_PESSOAL); }, [carregarMapa]);

  const escolherTrilha = (t) => { setAberta(null); setPhase('map'); carregarMapa(t.slug); };

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
        setErro('Bloqueado — conclua os subtemas de maior incidência desta matéria primeiro.');
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

  // ── Catálogo de trilhas prontas ───────────────────────────────────────────
  if (phase === 'pick') {
    return (
      <div className="practice-setup fade-up">
        <div className="practice-setup-header">
          <div>
            <div className="eyebrow">Estudo guiado</div>
            <h1 className="page-h1">Trilhas prontas.</h1>
            <p className="page-sub">
              Conjuntos fechados de matérias, para quando você quiser fugir do seu foco.
            </p>
          </div>
          <button className="btn btn-quiet" onClick={() => escolherTrilha({ slug: SLUG_PESSOAL })}>
            ← Voltar à minha trilha
          </button>
        </div>
        <div className="practice-setup-card">
          <div className="reg-section-title">Trilhas disponíveis</div>
          <window.Premium.TrilhaPicker user={user} onUpgrade={onUpgrade} onPick={escolherTrilha} />
        </div>
      </div>
    );
  }

  // ── Mapa: disciplina → temas ──────────────────────────────────────────────
  const discAberta = (discs || []).find((d) => d.disciplina === aberta);

  return (
    <div className="practice-setup fade-up">
      <div className="practice-setup-header">
        <div>
          <div className="eyebrow">Trilha · {trilha?.nome}</div>
          <h1 className="page-h1">Suas matérias, o que mais cai primeiro.</h1>
          <p className="page-sub">{trilha?.descricao}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-quiet" onClick={() => setPhase('pick')}>Trilhas prontas</button>
          <button className="btn btn-quiet" onClick={onExit}>← Dashboard</button>
        </div>
      </div>

      {erro && <div className="login-error" style={{ marginBottom: 16 }}><span>✕</span> {erro}</div>}
      {loading && <div style={{ color: 'var(--text-muted)' }}>Carregando trilha…</div>}

      {!loading && discs && discs.length === 0 && (
        <div className="practice-setup-card" style={{ color: 'var(--text-muted)' }}>
          Ainda não há questões cadastradas nas matérias que você escolheu.
          {' '}Você pode incluir outras em <strong>Minha conta</strong>.
        </div>
      )}

      {!loading && discs && discs.length > 0 && (
        <div className="practice-setup-card">
          <div className="trilha-estacoes">
            {discs.map((d, i) => {
              const a = areaInfo(d.disciplina);
              const estado = d.bloqueado ? 'bloqueada' : d.pct === 100 ? 'concluida' : 'aberta';
              return (
                <div key={d.disciplina} className="trilha-estacao">
                  <div className="trilha-parada">
                    <window.Shell.DisciplinaBolinha
                      area={d.disciplina}
                      pct={d.pct}
                      estado={estado}
                      ativa={aberta === d.disciplina}
                      onClick={() => setAberta(aberta === d.disciplina ? null : d.disciplina)}
                    />
                    <div className="trilha-parada-label">{a.label}</div>
                    <div className="trilha-parada-sub">{d.concluidos}/{d.total_temas} subtemas</div>
                    <div className="trilha-parada-barra">
                      <div className="trilha-parada-barra-fill"
                           style={{ width: `${d.pct}%`, background: a.cor }} />
                    </div>
                  </div>
                  {i < discs.length - 1 && <div className="trilha-conector" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {discAberta && (
        <div className="practice-setup-card fade-up" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontWeight: 800, color: areaInfo(discAberta.disciplina).cor }}>
              {areaInfo(discAberta.disciplina).label}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {discAberta.total_temas} subtemas · ~{discAberta.incidencia_total} questões/prova
            </span>
            <button className="btn btn-quiet" style={{ marginLeft: 'auto', padding: '4px 10px' }}
                    onClick={() => setAberta(null)}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {discAberta.temas.map((t) => {
              const info = FAIXA_INFO[t.faixa] || FAIXA_INFO.pontual;
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
                    <span style={{ color: info.cor, fontWeight: 700 }}>{info.titulo}</span>
                    {' · '}cai ~{t.incidencia}/prova ·{' '}
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
      )}
    </div>
  );
}

window.Trilha = { TrilhaPage };
