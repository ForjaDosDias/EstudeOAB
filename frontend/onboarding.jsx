/* global React */
const { useState: useStateOnb, useEffect: useEffectOnb } = React;

/* =========================================================
   Onboarding em 3 telas.

   O fluxo antigo (RegisterFlow, 4 etapas) pedia nome, e-mail e senha de 8
   caracteres logo na primeira tela — fricção máxima antes de entregar valor.
   Aqui o aluno vê a proposta, escolhe o que QUER focar e vê a trilha montada;
   a conta só é pedida no último clique.

   ⚠️ A lógica inverteu em 2026-08-08. Antes era exclusão ("escolha até 2 que
   você NÃO quer"); agora é inclusão ("escolha o que você QUER focar"), sem
   teto. Quem mexer aqui precisa saber: `areas_foco = []` significa TODAS, não
   "nenhuma" — é o que o botão "quero estudar todas as matérias" grava.
   ========================================================= */

// Quantas disciplinas já vêm marcadas. Não são fixas: são as N de maior
// incidência, calculadas pelo servidor. Tela em branco obrigaria o aluno a
// decidir antes de saber o que pesa na prova.
const PRE_SELECIONADAS = 5;

// Abaixo disso a tela 3 avisa que a trilha ficou curta. Não bloqueia: focar 1
// disciplina é escolha legítima, só merece um aviso antes de virar surpresa.
const TRILHA_CURTA = 10;

const FRASES_MONTAGEM = [
  'Lendo a incidência dos últimos exames…',
  'Ordenando seus temas pelo que mais cai…',
  'Montando sua trilha…',
];

// A tela de montagem espera a resposta real do servidor, mas nunca some antes
// deste tempo — resposta instantânea pisca e o aluno não lê o que aconteceu.
const MONTAGEM_MIN_MS = 1600;

function OnboardingFlow({ onCancel, onComplete, onEmailPending }) {
  const [tela, setTela] = useStateOnb(1);
  const [foco, setFoco] = useStateOnb([]);
  const [catalogo, setCatalogo] = useStateOnb(null); // disciplinas + incidência, do servidor
  const [preview, setPreview] = useStateOnb(null);
  const [criandoConta, setCriandoConta] = useStateOnb(false);
  const [aberta, setAberta] = useStateOnb(null); // disciplina expandida na tela 3

  const { areaInfo } = window.AppData;

  // Catálogo real: quais disciplinas existem e quanto cada uma cai. Sai do
  // /preview sem foco, que já devolve tudo ordenado por incidência — evita um
  // endpoint novo só para listar chips.
  useEffectOnb(() => {
    if (tela !== 2 || catalogo) return;
    window.apiFetch('/trilhas/preview')
      .then((d) => {
        const lista = d.disciplinas || [];
        setCatalogo(lista);
        // Pré-seleção: as de maior incidência já marcadas. O aluno tira o que
        // não quer e soma as que caem menos, em vez de começar do zero.
        setFoco((atual) => (atual.length ? atual : lista.slice(0, PRE_SELECIONADAS).map((x) => x.disciplina)));
      })
      .catch(() => setCatalogo([]));
  }, [tela, catalogo]);

  // O preview roda sem token — é justamente o ponto do fluxo em que ainda não
  // existe conta. Se esta chamada passar a exigir auth, a tela 3 fica vazia.
  useEffectOnb(() => {
    if (tela !== 'montando') return;
    let vivo = true;
    const inicio = Date.now();
    const qs = foco.length ? `?foco=${encodeURIComponent(foco.join(','))}` : '';

    window.apiFetch(`/trilhas/preview${qs}`)
      .then((d) => d)
      .catch(() => ({ disciplinas: [], total_temas: 0 }))
      .then((d) => {
        const espera = Math.max(0, MONTAGEM_MIN_MS - (Date.now() - inicio));
        setTimeout(() => {
          if (!vivo) return;
          setPreview(d);
          setTela(3);
        }, espera);
      });

    return () => { vivo = false; };
  }, [tela, foco]);

  const alternar = (id) =>
    setFoco((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

  const marcarTodas = () => setFoco((catalogo || []).map((d) => d.disciplina));

  // ── Tela 1 — o que o app faz ─────────────────────────────────────────────
  if (tela === 1) {
    return (
      <div className="onb-wrap fade-up">
        <div className="onb-card onb-card-hero">
          <div className="onb-logo">⚖️</div>
          <h1 className="onb-title">Aprovado na <em>OAB</em></h1>
          <div className="onb-tagline">Estude apenas o que você precisa!</div>

          <p className="onb-pitch">
            Somos um aplicativo gratuito que te ajuda a estudar para a prova da OAB de modo
            inteligente.
          </p>
          <p className="onb-pitch">
            Utilizando I.A relacionamos o que estatisticamente cai nas provas com o seu
            conhecimento.
          </p>
          <p className="onb-pitch onb-pitch-forte">
            Você não precisa saber de tudo para passar na OAB. Você precisa apenas passar na prova!
          </p>

          <button className="btn-primary onb-cta" onClick={() => setTela(2)}>Comece agora</button>
          <button className="btn btn-quiet onb-secundario" onClick={onCancel}>Já tenho conta</button>
        </div>
      </div>
    );
  }

  // ── Tela 2 — o que o aluno QUER focar ────────────────────────────────────
  if (tela === 2) {
    const lista = catalogo || [];
    const todasMarcadas = lista.length > 0 && foco.length === lista.length;

    return (
      <div className="onb-wrap fade-up">
        <div className="onb-card">
          <button className="onb-voltar" onClick={() => setTela(1)}>← Voltar</button>
          <h2 className="onb-h2">No que você quer focar?</h2>
          <p className="onb-sub">
            Já deixamos marcadas as {PRE_SELECIONADAS} matérias que mais caem no exame. Tire o que
            não quiser e some as outras — sua trilha é montada só com o que ficar aqui. A prática
            livre continua com todas as questões.
          </p>

          <button
            className={`onb-todas ${todasMarcadas ? 'is-on' : ''}`}
            onClick={marcarTodas}
            disabled={!lista.length}
          >
            Quero estudar todas as matérias
          </button>

          {!catalogo && <div className="onb-carregando">Carregando disciplinas…</div>}

          <div className="onb-chips">
            {lista.map((d) => {
              const a = areaInfo(d.disciplina);
              const ativa = foco.includes(d.disciplina);
              return (
                <button
                  key={d.disciplina}
                  className={`onb-chip ${ativa ? 'is-on' : ''}`}
                  style={ativa ? { background: a.cor, borderColor: a.cor } : { borderColor: a.cor, color: a.cor }}
                  onClick={() => alternar(d.disciplina)}
                >
                  <span className="onb-chip-dot" style={{ background: a.cor }} />
                  {a.label}
                  <span className="onb-chip-inc">{formatarIncidencia(d.incidencia_total)}/prova</span>
                </button>
              );
            })}
          </div>

          <div className="onb-contador">
            {foco.length === 0
              ? 'Escolha ao menos uma matéria para montar sua trilha.'
              : `${foco.length} de ${lista.length} matérias selecionadas`}
          </div>

          <button
            className="btn-primary onb-cta"
            disabled={foco.length === 0}
            onClick={() => setTela('montando')}
          >
            Montar minha trilha
          </button>
        </div>
      </div>
    );
  }

  // ── Tela de montagem ─────────────────────────────────────────────────────
  if (tela === 'montando') return <TelaMontando />;

  // ── Tela 3 — trilha pronta, por disciplina ───────────────────────────────
  const disciplinas = preview?.disciplinas || [];
  const totalTemas = preview?.total_temas || 0;
  const curta = totalTemas > 0 && totalTemas < TRILHA_CURTA;

  return (
    <div className="onb-wrap fade-up">
      <div className="onb-card onb-card-largo">
        <button className="onb-voltar" onClick={() => setTela(2)}>← Ajustar matérias</button>
        <h2 className="onb-h2">Pronto! Sua trilha está montada.</h2>
        <p className="onb-sub">
          {totalTemas} temas nas matérias que você escolheu, do que mais cai para o que cai menos.
        </p>

        <div className="trilha-estacoes">
          {disciplinas.map((d, i) => {
            const a = areaInfo(d.disciplina);
            const aberto = aberta === d.disciplina;
            return (
              <div key={d.disciplina} className="trilha-estacao">
                <div className="trilha-parada">
                  <window.Shell.DisciplinaBolinha
                    area={d.disciplina}
                    pct={d.pct}
                    ativa={aberto}
                    onClick={() => setAberta(aberto ? null : d.disciplina)}
                  />
                  <div className="trilha-parada-label">{a.label}</div>
                  <div className="trilha-parada-sub">{d.total_temas} temas</div>
                </div>
                {i < disciplinas.length - 1 && <div className="trilha-conector" />}
              </div>
            );
          })}
        </div>

        {aberta && <TemasDaDisciplina disc={disciplinas.find((d) => d.disciplina === aberta)} />}

        {curta && (
          <div className="onb-aviso">
            Sua trilha tem só {totalTemas} temas — dá para incluir mais matérias e ganhar
            cobertura. <button className="onb-link" onClick={() => setTela(2)}>Ajustar</button>
          </div>
        )}

        {criandoConta ? (
          <ContaForm
            foco={foco}
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

/* Uma casa decimal, vírgula: "2,3 questões" lê melhor que "2.30". */
function formatarIncidencia(n) {
  return `~${Number(n || 0).toFixed(1).replace('.', ',')}q`;
}

/* A espera é real (o preview está sendo montado), com piso de tempo para dar
   para ler. Trocar por um setTimeout puro seria mentira de interface. */
function TelaMontando() {
  const [i, setI] = useStateOnb(0);

  useEffectOnb(() => {
    const t = setInterval(() => setI((x) => (x + 1) % FRASES_MONTAGEM.length), 700);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="onb-wrap">
      <div className="onb-card onb-card-hero">
        <div className="onb-spinner" />
        <div className="onb-montando-txt">{FRASES_MONTAGEM[i]}</div>
      </div>
    </div>
  );
}

function TemasDaDisciplina({ disc }) {
  if (!disc) return null;
  return (
    <div className="trilha-temas fade-up">
      {disc.temas.map((t) => (
        <div key={t.tema_id} className="trilha-tema">
          <span className="trilha-tema-nome">{t.nome}</span>
          <span className="trilha-tema-inc">{formatarIncidencia(t.incidencia)}/prova</span>
        </div>
      ))}
    </div>
  );
}

/* Conta só no fim — as escolhas do onboarding vão junto no mesmo POST.
   O seletor de "questões por dia" saiu daqui em 2026-08-08 para encurtar o
   fluxo; a meta fica no default e é editável em Minha conta. A ideia virou o
   "modo desafio" (mais questões = mais moedas) — issue #26, não foi perda
   acidental. */
function ContaForm({ foco, onCancel, onComplete, onEmailPending }) {
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
          areas_foco: foco,
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
