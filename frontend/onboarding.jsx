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

   ⚠️ VOCABULÁRIO: aqui só existe UM nível, a MATÉRIA (as 13 de `area_direito`).
   A aplicação tem um segundo nível — os 79 registros da tabela `subtemas`, que
   são as unidades de estudo dentro de cada matéria — e ele NÃO aparece no
   onboarding. Misturar os dois foi um erro real: escolher "Constitucional" e
   ler "4 temas" só faz sentido para quem já sabe que existe o nível de baixo.
   Nunca use a palavra "tema" nestas telas.
   ========================================================= */

// Quantas matérias já vêm marcadas. Não são fixas: são as N de maior
// incidência, calculadas pelo servidor. Tela em branco obrigaria o aluno a
// decidir antes de saber o que pesa na prova.
const PRE_SELECIONADAS = 5;

const FRASES_MONTAGEM = [
  'Lendo a incidência dos últimos exames…',
  'Ordenando seus assuntos pelo que mais cai…',
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

  const { areaInfo } = window.AppData;

  // Funil: sem estes eventos não há como saber em qual das 3 telas a pessoa
  // desiste — e é aqui, antes de existir conta, que a maioria some.
  useEffectOnb(() => { window.track('onboarding_visto'); }, []);

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
      .catch(() => ({ disciplinas: [] }))
      .then((d) => {
        const espera = Math.max(0, MONTAGEM_MIN_MS - (Date.now() - inicio));
        setTimeout(() => {
          if (!vivo) return;
          setPreview(d);
          setTela(3);
          window.track('trilha_vista', { materias: (d.disciplinas || []).length });
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
            onClick={() => {
              window.track('foco_escolhido', { materias: foco.length });
              setTela('montando');
            }}
          >
            Montar minha trilha
          </button>
        </div>
      </div>
    );
  }

  // ── Tela de montagem ─────────────────────────────────────────────────────
  if (tela === 'montando') return <TelaMontando />;

  // ── Tela 3 — trilha pronta ───────────────────────────────────────────────
  // Só as matérias escolhidas, na ordem em que caem. Nada de contagem de
  // subitens e nada de aviso de "trilha curta": focar em uma matéria só é
  // escolha legítima, e o onboarding não é lugar de discutir a escolha do
  // aluno — é lugar de confirmar que ela foi entendida.
  const disciplinas = preview?.disciplinas || [];

  return (
    <div className="onb-wrap fade-up">
      <div className="onb-card onb-card-largo">
        <button className="onb-voltar" onClick={() => setTela(2)}>← Ajustar matérias</button>
        <h2 className="onb-h2">Pronto! Sua trilha está montada.</h2>
        <p className="onb-sub">
          {disciplinas.length === 1
            ? 'Sua trilha, montada com a matéria que você escolheu.'
            : `Suas ${disciplinas.length} matérias, da que mais cai para a que menos cai na prova.`}
        </p>

        <div className="trilha-estacoes">
          {disciplinas.map((d, i) => {
            const a = areaInfo(d.disciplina);
            return (
              <div key={d.disciplina} className="trilha-estacao">
                <div className="trilha-parada">
                  <window.Shell.DisciplinaBolinha area={d.disciplina} />
                  <div className="trilha-parada-label">{a.label}</div>
                </div>
                {i < disciplinas.length - 1 && <div className="trilha-conector" />}
              </div>
            );
          })}
        </div>

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
            <button
              className="btn-primary"
              onClick={() => { window.track('conta_iniciada'); setCriandoConta(true); }}
            >
              Começar exercícios
            </button>
          </div>
        )}
      </div>
    </div>
  );
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
      window.track('conta_criada');
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
