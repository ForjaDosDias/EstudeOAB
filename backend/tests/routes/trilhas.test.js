jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../src/db');

const app = express();
app.use(express.json());
app.use('/api/trilhas', require('../../src/routes/trilhas'));

const JWT_SECRET = process.env.JWT_SECRET;

function token(userId = 1) {
  return jwt.sign({ userId, email: 'u@oab.com', role: 'user' }, JWT_SECRET);
}

const trilhaAreas = ['etica', 'civil', 'const'];

const fakeTrilha = {
  id: 1,
  slug: 'essencial-1a-fase',
  nome: 'Essencial 1ª Fase',
  descricao: 'As áreas de maior incidência no exame.',
  areas: trilhaAreas,
  ordem: 1,
  total_questoes: 87,
};

/**
 * Catálogo de subtemas com a incidência que o SQL calcula (questões / edições).
 * As faixas saem daqui: >= 1.5 alta · >= 1.0 média · resto pontual.
 *
 * `civil` só existe na faixa pontual de propósito — é o caso "faixa vazia não
 * bloqueia": disciplina que não aparece nas faixas anteriores não pode chegar
 * travada na sua.
 */
const subtemasRows = {
  rows: [
    { id: 10, nome: 'Controle de constitucionalidade', slug: 't10', disciplina: 'const', total: 6, incidencia: '2.0' },
    { id: 11, nome: 'Sigilo profissional',             slug: 't11', disciplina: 'etica', total: 5, incidencia: '1.67' },
    { id: 12, nome: 'Organização do Estado',           slug: 't12', disciplina: 'const', total: 3, incidencia: '1.0' },
    { id: 13, nome: 'Honorários advocatícios',         slug: 't13', disciplina: 'etica', total: 3, incidencia: '1.0' },
    { id: 14, nome: 'Negócios jurídicos',              slug: 't14', disciplina: 'civil', total: 1, incidencia: '0.33' },
  ],
};

// O aluno concluiu Sigilo profissional (5 respondidas, 4 certas = 80%);
// Controle de constitucionalidade está começado e ainda não concluído.
const perfRows = {
  rows: [
    { subtema_id: 11, respondidas: 5, acertos: 4 },
    { subtema_id: 10, respondidas: 2, acertos: 2 },
  ],
};

// O filtro de disciplina acontece no SQL (`WHERE t.disciplina = ANY($1)`). O
// mock precisa imitar isso, senão o teste de foco afirmaria algo que não
// consegue provar — devolveria as disciplinas de fora do foco de qualquer jeito.
function filtrar(subtemas, disciplinas) {
  if (!disciplinas) return subtemas;
  return { rows: subtemas.rows.filter((t) => disciplinas.includes(t.disciplina)) };
}

/** Trilha do catálogo: o foco do aluno NÃO recorta (ele pediu essa trilha). */
function mockMapaCatalogo(subtemas = subtemasRows, perf = perfRows) {
  pool.query
    .mockResolvedValueOnce({ rows: [fakeTrilha] }) // resolverTrilha
    .mockResolvedValueOnce(subtemas)               // incidência por subtema
    .mockResolvedValueOnce(perf);                  // progresso do aluno
}

/** Trilha pessoal (`minha`): as áreas vêm de users.areas_foco. */
function mockMapaPessoal(foco, subtemas = subtemasRows, perf = perfRows) {
  pool.query.mockResolvedValueOnce({ rows: [{ areas_foco: foco }] }); // focoDoUsuario
  if (!foco.length) {
    // foco vazio = todas: o servidor busca o universo de disciplinas ativas
    pool.query.mockResolvedValueOnce({
      rows: [...new Set(subtemas.rows.map((t) => t.disciplina))].map((disciplina) => ({ disciplina })),
    });
  }
  pool.query
    .mockResolvedValueOnce(filtrar(subtemas, foco.length ? foco : null))
    .mockResolvedValueOnce(perf);
}

const get = (url) => request(app).get(url).set('Authorization', `Bearer ${token()}`);

/** Achata o mapa em matéria → [subtema_id], para asserções legíveis. */
function porDisciplina(body) {
  return Object.fromEntries(body.disciplinas.map((d) => [d.disciplina, d.subtemas.map((t) => t.subtema_id)]));
}

function acharSubtema(body, subtemaId) {
  for (const d of body.disciplinas) {
    const t = d.subtemas.find((x) => x.subtema_id === subtemaId);
    if (t) return t;
  }
  return null;
}

// resetAllMocks, não clearAllMocks: o `clear` zera as chamadas registradas mas
// NÃO esvazia a fila do mockResolvedValueOnce. Testes cujo caminho retorna cedo
// (ex.: foco que não casa com nenhuma disciplina) consomem menos respostas do
// que enfileiraram, e a sobra vaza para o teste seguinte — que falha por um
// motivo que não tem nada a ver com ele.
beforeEach(() => jest.resetAllMocks());

describe('GET /api/trilhas', () => {
  it('401 sem token', async () => {
    expect((await request(app).get('/api/trilhas')).status).toBe(401);
  });

  it('200 lista trilhas', async () => {
    pool.query.mockResolvedValueOnce({ rows: [fakeTrilha] });
    const res = await get('/api/trilhas');
    expect(res.status).toBe(200);
    expect(res.body.trilhas[0].slug).toBe('essencial-1a-fase');
  });
});

describe('GET /api/trilhas/:slug/mapa', () => {
  it('404 quando a trilha não existe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    expect((await get('/api/trilhas/inexistente/mapa')).status).toBe(404);
  });

  // Guardrail: a trilha deixou de ser Premium em 06/08/2026. Este teste trava
  // o oposto do que valia antes — usuário sem plano tem que entrar.
  it('200 para usuário Free — a trilha não tem paywall', async () => {
    mockMapaCatalogo();
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');
    expect(res.status).toBe(200);
    expect(res.body.disciplinas.length).toBeGreaterThan(0);
  });

  // Guardrail: a faixa continua derivada da incidência real, mesmo agora que
  // ela não é mais a seção de primeiro nível da resposta.
  it('classifica os subtemas na faixa certa pela incidência', async () => {
    mockMapaCatalogo();
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');

    expect(acharSubtema(res.body, 10).faixa).toBe('alta');    // 2.0
    expect(acharSubtema(res.body, 11).faixa).toBe('alta');    // 1.67
    expect(acharSubtema(res.body, 12).faixa).toBe('media');   // 1.0 exato entra na média
    expect(acharSubtema(res.body, 13).faixa).toBe('media');
    expect(acharSubtema(res.body, 14).faixa).toBe('pontual'); // 0.33
  });

  // Guardrail do reagrupamento: dentro da disciplina, o que mais cai vem antes.
  // É a ordem que define a progressão — inverter aqui destrava tema na ordem errada.
  it('ordena os subtemas de cada matéria da maior para a menor incidência', async () => {
    mockMapaCatalogo();
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');

    expect(porDisciplina(res.body)).toEqual({
      const:  [10, 12], // 2.0 antes de 1.0
      etica:  [11, 13], // 1.67 antes de 1.0
      civil:  [14],
    });
  });

  // ...e as disciplinas, da que mais cai para a que menos cai.
  it('ordena as disciplinas por incidência total', async () => {
    mockMapaCatalogo();
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');
    expect(res.body.disciplinas.map((d) => d.disciplina)).toEqual(['const', 'etica', 'civil']);
  });

  it('conclui o tema com mínimo de questões e acerto acima do limiar', async () => {
    mockMapaCatalogo();
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');

    expect(acharSubtema(res.body, 11)).toMatchObject({ concluido: true, pct: 80 });
    expect(acharSubtema(res.body, 10)).toMatchObject({ concluido: false }); // 2 < mínimo de 5
  });

  // Guardrail central: o tema de incidência menor só abre quando o de incidência
  // maior da MESMA disciplina fecha. O reagrupamento por disciplina não podia
  // afrouxar isso — a trava é a espinha da trilha.
  it('mantém travado o tema seguinte enquanto o anterior não fecha', async () => {
    mockMapaCatalogo();
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');

    // const não concluiu o tema de alta (10) → o de média (12) segue travado
    expect(acharSubtema(res.body, 12).bloqueado).toBe(true);
    // etica concluiu o de alta (11) → o de média (13) abre
    expect(acharSubtema(res.body, 13).bloqueado).toBe(false);
  });

  // Guardrail: faixa vazia é pulada, não vira barreira.
  it('não bloqueia disciplina que não aparece nas faixas anteriores', async () => {
    mockMapaCatalogo();
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');

    const civil = res.body.disciplinas.find((d) => d.disciplina === 'civil');
    expect(civil.bloqueado).toBe(false); // civil não tem tema em alta nem em média
    expect(acharSubtema(res.body, 14).bloqueado).toBe(false);
  });

  // Guardrail: questão sem subtema_id fica fora do mapa e não inventa faixa.
  it('devolve mapa vazio quando nenhuma questão está classificada', async () => {
    mockMapaCatalogo({ rows: [] }, { rows: [] });
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');
    expect(res.status).toBe(200);
    expect(res.body.disciplinas).toEqual([]);
  });
});

// ── Foco de disciplinas: a inclusão que substituiu a exclusão (08/08/2026) ──

describe('foco de disciplinas', () => {
  /**
   * Guardrail da decisão de produto: o foco recorta a TRILHA e só ela.
   * /questions/sortear e /sessions continuam sorteando de tudo — estreitar o
   * estudo guiado é escolha do aluno, esconder da prova não é opção nossa.
   */
  it('a trilha pessoal traz só as disciplinas do foco', async () => {
    mockMapaPessoal(['const']);
    const res = await get('/api/trilhas/minha/mapa');

    expect(res.body.disciplinas.map((d) => d.disciplina)).toEqual(['const']);
    expect(res.body.foco).toEqual(['const']);
  });

  it('a query de subtemas nunca recebe matéria fora do foco', async () => {
    mockMapaPessoal(['const', 'civil']);
    await get('/api/trilhas/minha/mapa');

    const queryTemas = pool.query.mock.calls.find((c) => /FROM subtemas t/.test(c[0]));
    expect(queryTemas[1][0].sort()).toEqual(['civil', 'const']); // sem 'etica'
  });

  // Guardrail semântico: `areas_foco = []` significa TODAS, não "nenhuma".
  // Ler isso como lista de inclusão literal deixaria a trilha vazia para todo
  // usuário que nunca passou pelo onboarding.
  it('foco vazio devolve todas as disciplinas, não nenhuma', async () => {
    mockMapaPessoal([]);
    const res = await get('/api/trilhas/minha/mapa');

    expect(res.body.disciplinas.map((d) => d.disciplina).sort()).toEqual(['civil', 'const', 'etica']);
  });

  // O aluno que escolhe uma trilha do catálogo pediu aquelas matérias. Cruzar
  // com o foco devolveria trilha vazia para quem focou em outra coisa.
  it('o foco não recorta as trilhas do catálogo', async () => {
    mockMapaCatalogo();
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');

    expect(res.body.disciplinas.map((d) => d.disciplina).sort()).toEqual(['civil', 'const', 'etica']);
    // e nem consulta o foco do usuário para montá-la
    expect(pool.query.mock.calls.some((c) => /areas_foco/.test(c[0]))).toBe(false);
  });
});

describe('GET /api/trilhas/:slug/subtema/:subtemaId/questoes', () => {
  it('400 para id de subtema inválido', async () => {
    expect((await get('/api/trilhas/essencial-1a-fase/subtema/abc/questoes')).status).toBe(400);
  });

  it('404 quando o subtema não pertence à trilha', async () => {
    mockMapaCatalogo();
    expect((await get('/api/trilhas/essencial-1a-fase/subtema/999/questoes')).status).toBe(404);
  });

  // Guardrail mais importante: a trava é recalculada no servidor. Chamar a API
  // direto, sem passar pela interface, não pode liberar o tema.
  it('423 CHECKPOINT_LOCKED para subtema bloqueado', async () => {
    mockMapaCatalogo();
    const res = await get('/api/trilhas/essencial-1a-fase/subtema/12/questoes'); // const, faixa média
    expect(res.status).toBe(423);
    expect(res.body.code).toBe('CHECKPOINT_LOCKED');
  });

  // A trilha pessoal passa pela mesma trava — o slug novo não é atalho.
  it('423 também na trilha pessoal', async () => {
    mockMapaPessoal(['const']);
    const res = await get('/api/trilhas/minha/subtema/12/questoes');
    expect(res.status).toBe(423);
  });

  // Tema de disciplina fora do foco não existe na trilha do aluno: 404, nunca
  // um sorteio silencioso de questões que ele pediu para não estudar.
  it('404 para subtema de matéria fora do foco', async () => {
    mockMapaPessoal(['const']);
    const res = await get('/api/trilhas/minha/subtema/11/questoes'); // 11 é de etica
    expect(res.status).toBe(404);
  });

  it('200 sorteia questões de subtema liberado', async () => {
    mockMapaCatalogo();
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 7, enunciado: 'Q', area_direito: 'const' }],
    });

    const res = await get('/api/trilhas/essencial-1a-fase/subtema/10/questoes?total=10');

    expect(res.status).toBe(200);
    expect(res.body.questoes).toHaveLength(1);
    expect(res.body.subtema).toBe('Controle de constitucionalidade');
    expect(pool.query.mock.calls.at(-1)[1]).toEqual([10, 10]); // filtra por subtema_id
  });
});

describe('GET /api/trilhas/preview', () => {
  function mockPreview(foco, subtemas = subtemasRows) {
    pool.query
      .mockResolvedValueOnce({
        rows: [...new Set(subtemas.rows.map((t) => t.disciplina))].map((disciplina) => ({ disciplina })),
      }) // todasDisciplinas
      .mockResolvedValueOnce(filtrar(subtemas, foco))
      .mockResolvedValueOnce({ rows: [] }); // preview é sempre progresso zero
  }

  /**
   * Guardrail: é a tela 3 do onboarding, que roda ANTES de existir conta.
   * Se esta rota passar a exigir token, o fluxo inteiro quebra — e quebra
   * silenciosamente, porque o front só veria um 401 no lugar do preview.
   */
  it('responde sem token', async () => {
    mockPreview(null);
    const res = await request(app).get('/api/trilhas/preview'); // sem Authorization
    expect(res.status).toBe(200);
    expect(res.body.total_subtemas).toBe(5);
  });

  it('aplica o foco vindo da query string', async () => {
    mockPreview(['etica']);
    const res = await request(app).get('/api/trilhas/preview?foco=etica');

    const queryTemas = pool.query.mock.calls.find((c) => /FROM subtemas t/.test(c[0]));
    expect(queryTemas[1][0]).toEqual(['etica']);
    expect(res.body.disciplinas.map((d) => d.disciplina)).toEqual(['etica']);
    expect(res.body.foco).toEqual(['etica']);
  });

  /**
   * Guardrail da tela 2: as N disciplinas pré-selecionadas saem DAQUI, na ordem
   * em que o servidor devolve. Se a ordenação por incidência sair, o onboarding
   * passa a marcar cinco matérias arbitrárias sem ninguém perceber.
   */
  it('devolve as disciplinas ordenadas por incidência, para a pré-seleção', async () => {
    mockPreview(null);
    const res = await request(app).get('/api/trilhas/preview');

    expect(res.body.disciplinas.map((d) => d.disciplina)).toEqual(['const', 'etica', 'civil']);
    const incidencias = res.body.disciplinas.map((d) => d.incidencia_total);
    expect([...incidencias].sort((a, b) => b - a)).toEqual(incidencias);
  });
});
