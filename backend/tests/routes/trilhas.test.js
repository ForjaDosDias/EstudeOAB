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
 * Catálogo de temas com a incidência que o SQL calcula (questões / edições).
 * As faixas saem daqui: >= 1.5 alta · >= 1.0 média · resto pontual.
 *
 * `civil` só existe na faixa pontual de propósito — é o caso "faixa vazia não
 * bloqueia": disciplina que não aparece nas faixas anteriores não pode chegar
 * travada na sua.
 */
const temasRows = {
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
    { tema_id: 11, respondidas: 5, acertos: 4 },
    { tema_id: 10, respondidas: 2, acertos: 2 },
  ],
};

function mockMapa(temas = temasRows, perf = perfRows) {
  pool.query
    .mockResolvedValueOnce({ rows: [fakeTrilha] }) // lookup da trilha
    .mockResolvedValueOnce(temas) // incidência por tema
    .mockResolvedValueOnce(perf); // progresso do aluno
}

const get = (url) => request(app).get(url).set('Authorization', `Bearer ${token()}`);

beforeEach(() => jest.clearAllMocks());

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
    mockMapa();
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');
    expect(res.status).toBe(200);
    expect(res.body.faixas.length).toBeGreaterThan(0);
  });

  // Guardrail: a faixa é derivada da incidência real, não de um campo manual.
  it('classifica os temas na faixa certa pela incidência', async () => {
    mockMapa();
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');

    const porFaixa = Object.fromEntries(
      res.body.faixas.map((f) => [f.faixa, f.disciplinas.flatMap((d) => d.temas.map((t) => t.tema_id))])
    );
    expect(porFaixa.alta.sort()).toEqual([10, 11]); // 2.0 e 1.67
    expect(porFaixa.media.sort()).toEqual([12, 13]); // 1.0 exato entra na média
    expect(porFaixa.pontual).toEqual([14]); // 0.33
  });

  it('conclui o tema com mínimo de questões e acerto acima do limiar', async () => {
    mockMapa();
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');

    const alta = res.body.faixas.find((f) => f.faixa === 'alta');
    const sigilo = alta.disciplinas.find((d) => d.disciplina === 'etica').temas[0];
    expect(sigilo).toMatchObject({ tema_id: 11, concluido: true, pct: 80 });

    const controle = alta.disciplinas.find((d) => d.disciplina === 'const').temas[0];
    expect(controle).toMatchObject({ tema_id: 10, concluido: false }); // 2 < mínimo de 5
  });

  // Guardrail central: a disciplina só abre na faixa seguinte quando fecha a anterior.
  it('trava a disciplina na faixa seguinte enquanto a anterior não fecha', async () => {
    mockMapa();
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');

    const media = res.body.faixas.find((f) => f.faixa === 'media');
    // const não concluiu a faixa alta → chega travada na média
    expect(media.disciplinas.find((d) => d.disciplina === 'const').bloqueado).toBe(true);
    // etica concluiu a alta → abre na média
    expect(media.disciplinas.find((d) => d.disciplina === 'etica').bloqueado).toBe(false);
  });

  // Guardrail: faixa vazia é pulada, não vira barreira.
  it('não bloqueia disciplina que não aparece nas faixas anteriores', async () => {
    mockMapa();
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');

    const pontual = res.body.faixas.find((f) => f.faixa === 'pontual');
    const civil = pontual.disciplinas.find((d) => d.disciplina === 'civil');
    expect(civil.bloqueado).toBe(false); // civil não tem tema em alta nem em média
  });

  // Guardrail: questão sem tema_id fica fora do mapa e não inventa faixa.
  it('devolve mapa vazio quando nenhuma questão está classificada', async () => {
    mockMapa({ rows: [] }, { rows: [] });
    const res = await get('/api/trilhas/essencial-1a-fase/mapa');
    expect(res.status).toBe(200);
    expect(res.body.faixas).toEqual([]);
  });
});

describe('GET /api/trilhas/:slug/tema/:temaId/questoes', () => {
  function mockTema(temas = temasRows, perf = perfRows) {
    pool.query
      .mockResolvedValueOnce({ rows: [{ areas: trilhaAreas }] }) // lookup das áreas
      .mockResolvedValueOnce(temas)
      .mockResolvedValueOnce(perf);
  }

  it('400 para id de tema inválido', async () => {
    expect((await get('/api/trilhas/essencial-1a-fase/tema/abc/questoes')).status).toBe(400);
  });

  it('404 quando o tema não pertence à trilha', async () => {
    mockTema();
    expect((await get('/api/trilhas/essencial-1a-fase/tema/999/questoes')).status).toBe(404);
  });

  // Guardrail mais importante: a trava é recalculada no servidor. Chamar a API
  // direto, sem passar pela interface, não pode liberar o tema.
  it('423 CHECKPOINT_LOCKED para tema em faixa bloqueada', async () => {
    mockTema();
    const res = await get('/api/trilhas/essencial-1a-fase/tema/12/questoes'); // const na faixa média
    expect(res.status).toBe(423);
    expect(res.body.code).toBe('CHECKPOINT_LOCKED');
  });

  it('200 sorteia questões de tema liberado', async () => {
    mockTema();
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 7, enunciado: 'Q', area_direito: 'const' }],
    });

    const res = await get('/api/trilhas/essencial-1a-fase/tema/10/questoes?total=10');

    expect(res.status).toBe(200);
    expect(res.body.questoes).toHaveLength(1);
    expect(res.body.tema).toBe('Controle de constitucionalidade');
    expect(pool.query.mock.calls.at(-1)[1]).toEqual([10, 10]); // filtra por tema_id
  });
});
