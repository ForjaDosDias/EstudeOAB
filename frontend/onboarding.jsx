/* global React */
const { useState: useStateOnb, useEffect: useEffectOnb } = React;

/* =========================================================
   Onboarding em 3 telas.

   O fluxo antigo (RegisterFlow, 4 etapas) pedia nome, e-mail e senha de 8
   caracteres logo na primeira tela — fricção máxima antes de entregar valor.
   Aqui o aluno vê a proposta, escolhe o que NÃO quer estudar e vê a trilha
   montada; a conta só é pedida no último clique.
   ========================================================= */

const MAX_EXCLUIDAS = 2;
const METAS = [
  { valor: 5,  label: '5 questões',  sub: 'ritmo leve' },
  { valor: 10, label: '10 questões', sub: 'recomendado' },
  { valor: 20, label: '20 questões', sub: 'intensivo' },
];

function OnboardingFlow({ onCancel, onComplete, onEmailPending }) {
  const [tela, setTela] = useStateOnb(1);
  const [excluidas, setExcluidas] = useStateOnb([]);
  const [meta, setMeta] = useStateOnb(10);
  const [preview, setPreview] = useStateOnb(null);
  const [criandoConta, setCriandoConta] = useStateOnb(false);

  const { DISCIPLINAS, AREAS } = window.AppData;

  // O preview roda sem token — é justamente o ponto do fluxo em que ainda não
  // existe conta. Se esta chamada passar a exigir auth, a tela 3 fica vazia.
  useEffectOnb(() => {
    if (tela !== 3) return;
    const qs = excluidas.length ? `?excluir=${encodeURIComponent(excluidas.join(','))}` : '';
    window.apiFetch(`/trilhas/preview${qs}`)
      .then(setPreview)
      .catch(() => setPreview({ faixas: [], total_temas: 0 }));
  }, [tela, excluidas]);

  const alternar = (id) => {
    setExcluidas((atual) => {
      if (atual.includes(id)) return atual.filter((x) => x !== id);
      if (atual.length >= MAX_EXCLUIDAS) return atual; // trava no limite
      return [...atual, id];
    });
  };

  // ── Tela 1 — o que o app faz ─────────────────────────────────────────────
  if (tela === 1) {
    return (
      <div className="onb-wrap fade-up">
        <div className="onb-card onb-card-hero">
          <div className="onb-logo">⚖️</div>
          <h1 className="onb-title">Aprovado na <em>OAB</em></h1>
          <p className="onb-pitch">
            Gratuito e movido a IA. Cruzamos <strong>o que mais cai na prova</strong> com o que
            você já sabe, e montamos uma trilha que ataca só o que falta.
          </p>
          <ul className="onb-bullets">
            <li>📊 Incidência real dos últimos exames, tema a tema</li>
            <li>🎯 Você estuda o que pesa, não o programa inteiro</li>
            <li>🔥 Uma meta por dia — e uma sequência para não parar</li>
          </ul>
          <button className="btn-primary onb-cta" onClick={() => setTela(2)}>Comece agora</button>
          <button className="btn btn-quiet onb-secundario" onClick={onCancel}>Já tenho conta</button>
        </div>
      </div>
    );
  }

  // ── Tela 2 — o que o aluno NÃO quer estudar ──────────────────────────────
  if (tela === 2) {
    const nenhuma = excluidas.length === 0;
    return (
      <div className="onb-wrap fade-up">
        <div className="onb-card">
          <button className="onb-voltar" onClick={() => setTela(1)}>← Voltar</button>
          <h2 className="onb-h2">O que você prefere deixar de fora?</h2>
          <p className="onb-sub">
            Selecione até {MAX_EXCLUIDAS} disciplinas que você não quer estudar. Elas somem da sua
            trilha — mas continuam aparecendo na prática livre, porque ainda caem na prova.
          </p>

          <div className="onb-chips">
            {DISCIPLINAS.map((d) => {
              const ativa = excluidas.includes(d.id);
              const cheio = !ativa && excluidas.length >= MAX_EXCLUIDAS;
              return (
                <button
                  key={d.id}
                  className={`onb-chip ${ativa ? 'is-on' : ''} ${cheio ? 'is-off' : ''}`}
                  onClick={() => alternar(d.id)}
                  disabled={cheio}
                >
                  <span>{d.icon}</span> {d.label} {ativa && <span className="onb-x">✕</span>}
                </button>
              );
            })}
          </div>

          <div className="onb-contador">
            {nenhuma
              ? 'Nenhuma excluída — você vai estudar tudo.'
              : `${excluidas.length} de ${MAX_EXCLUIDAS} excluídas`}
          </div>

          <div className="onb-meta">
            <div className="onb-meta-titulo">Quantas questões por dia?</div>
            <div className="onb-meta-ops">
              {METAS.map((m) => (
                <button
                  key={m.valor}
                  className={`onb-meta-op ${meta === m.valor ? 'is-on' : ''}`}
                  onClick={() => setMeta(m.valor)}
                >
                  <strong>{m.label}</strong>
                  <span>{m.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <button className="btn-primary onb-cta" onClick={() => setTela(3)}>
            {nenhuma ? 'Quero estudar todas' : 'Comece agora'}
          </button>
        </div>
      </div>
    );
  }

  // ── Tela 3 — trilha pronta ───────────────────────────────────────────────
  return (
    <div className="onb-wrap fade-up">
      <div className="onb-card">
        <button className="onb-voltar" onClick={() => setTela(2)}>← Voltar</button>
        <h2 className="onb-h2">Pronto! Sua trilha está montada.</h2>
        <p className="onb-sub">
          {preview
            ? `${preview.total_temas} temas, ordenados pelo quanto cada um cai na prova.`
            : 'Montando sua trilha…'}
        </p>

        <div className="onb-mapa">
          {(preview?.faixas || []).map((f) => (
            <div key={f.faixa} className={`onb-faixa onb-faixa-${f.faixa}`}>
              <div className="onb-faixa-label">{f.label}</div>
              <div className="onb-faixa-grid">
                {f.disciplinas.map((d) => {
                  const a = AREAS[d.disciplina] || { label: d.disciplina, icon: '⚖️' };
                  return (
                    <div key={d.disciplina} className="onb-modulo" title={`${a.label} · ${d.temas} temas`}>
                      <span className="onb-modulo-icon">{a.icon}</span>
                      <span className="onb-modulo-n">{d.temas}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {excluidas.length > 0 && (
          <div className="onb-excluidas-nota">
            Fora da trilha: {excluidas.map((e) => (AREAS[e]?.label || e)).join(' e ')}
          </div>
        )}

        {criandoConta ? (
          <ContaForm
            excluidas={excluidas}
            meta={meta}
            onCancel={() => setCriandoConta(false)}
            onComplete={onComplete}
            onEmailPending={onEmailPending}
          />
        ) : (
          <div className="onb-ctas">
            <button className="btn btn-quiet" onClick={() => setTela(2)}>Ajustar trilha</button>
            <button className="btn-primary" onClick={() => setCriandoConta(true)}>
              Começar exercícios
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* Conta só no fim — as escolhas do onboarding vão junto no mesmo POST. */
function ContaForm({ excluidas, meta, onCancel, onComplete, onEmailPending }) {
  const [form, setForm] = useStateOnb({ nome: '', email: '', senha: '' });
  const [erro, setErro] = useStateOnb(null);
  const [enviando, setEnviando] = useStateOnb(false);

  const valido =
    form.nome.trim().length > 1 && /.+@.+\..+/.test(form.email) && form.senha.length >= 8;

  const enviar = async () => {
    setEnviando(true); setErro(null);
    try {
      const data = await window.apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          nome: form.nome.trim(),
          email: form.email.trim(),
          password: form.senha,
          areas_excluidas: excluidas,
          meta_questoes_dia: meta,
        }),
      });
      // O register hoje SEMPRE devolve { requiresVerification, email } — nunca
      // um token. O caminho de onComplete existe para o dia em que a verificação
      // deixar de ser obrigatória; hoje ele não é alcançado.
      if (data.requiresVerification) return onEmailPending?.(data.email);
      onComplete?.(data.user, data.token);
    } catch (e) {
      setErro(e?.error || 'Não foi possível criar sua conta.');
      setEnviando(false);
    }
  };

  return (
    <div className="onb-conta">
      <div className="onb-conta-titulo">Falta só criar sua conta</div>
      {erro && <div className="login-error"><span>✕</span> {erro}</div>}
      <input className="input" placeholder="Seu nome" value={form.nome}
             onChange={(e) => setForm({ ...form, nome: e.target.value })} />
      <input className="input" type="email" placeholder="seu@email.com" value={form.email}
             onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input className="input" type="password" placeholder="Senha (mín. 8 caracteres)" value={form.senha}
             onChange={(e) => setForm({ ...form, senha: e.target.value })} />
      <div className="onb-ctas">
        <button className="btn btn-quiet" onClick={onCancel} disabled={enviando}>Voltar</button>
        <button className="btn-primary" onClick={enviar} disabled={!valido || enviando}>
          {enviando ? 'Criando…' : 'Criar conta e começar'}
        </button>
      </div>
    </div>
  );
}

window.Onboarding = { OnboardingFlow };
