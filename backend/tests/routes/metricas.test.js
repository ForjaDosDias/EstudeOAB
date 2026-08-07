jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../src/db');

const app = express();
app.use(express.json());
app.use('/api/admin/metricas', require('../../src/routes/metricas'));

const JWT_SECRET = process.env.JWT_SECRET;
const tokenAdmin = jwt.sign({ userId: 1, email: 'a@oab.com', role: 'admin' }, JWT_SECRET);
const tokenUser  = jwt.sign({ userId: 2, email: 'u@oab.com', role: 'user' },  JWT_SECRET);

// As 6 consultas saem num Promise.all, então a ordem da fila do mock é a ordem
// do array — mudar uma sem mudar a outra faz o painel mostrar o número errado
// no lugar errado, sem erro nenhum.
function mockTudo({ eventos = [], contas = {}, porDia = [], conteudo = [], retencao = {}, origem = [] } = {}) {
  pool.query
    .mockResolvedValueOnce({ rows: eventos })
    .mockResolvedValueOnce({ rows: [{ contas: 0, verificaram_email: 0, responderam_questao: 0, bateram_meta_1x: 0, ...contas }] })
    .mockResolvedValueOnce({ rows: porDia })
    .mockResolvedValueOnce({ rows: conteudo })
    .mockResolvedValueOnce({ rows: [{ coorte: 0, voltou_d1: 0, voltou_d7: 0, ...retencao }] })
    .mockResolvedValueOnce({ rows: origem });
}

const get = (url, token = tokenAdmin) =>
  request(app).get(url).set('Authorization', `Bearer ${token}`);

beforeEach(() => jest.resetAllMocks());

describe('GET /api/admin/metricas', () => {
  it('401 sem token', async () => {
    expect((await request(app).get('/api/admin/metricas')).status).toBe(401);
  });

  // Guardrail: são dados de todos os alunos. Usuário comum não entra.
  it('403 para usuário que não é admin', async () => {
    pool.query.mockResolvedValue({ rows: [{ role: 'user' }] });
    expect((await get('/api/admin/metricas', tokenUser)).status).toBe(403);
  });

  it('monta o funil juntando eventos e banco', async () => {
    mockTudo({
      eventos: [
        { nome: 'onboarding_visto', pessoas: 100 },
        { nome: 'foco_escolhido', pessoas: 60 },
        { nome: 'trilha_vista', pessoas: 55 },
        { nome: 'conta_iniciada', pessoas: 30 },
      ],
      contas: { contas: 20, verificaram_email: 12, responderam_questao: 9, bateram_meta_1x: 4 },
    });

    const res = await get('/api/admin/metricas');
    expect(res.status).toBe(200);
    expect(res.body.funil.map((f) => f.pessoas)).toEqual([100, 60, 55, 30, 20, 12, 9, 4]);
  });

  // As 4 primeiras etapas vêm de `eventos`, que só existe desde 08/08/2026. O
  // painel precisa dizer de onde cada número saiu, senão período antigo parece
  // queda catastrófica quando é só ausência de medição.
  it('marca a fonte de cada etapa do funil', async () => {
    mockTudo({ contas: { contas: 5 } });
    const res = await get('/api/admin/metricas');
    expect(res.body.funil.map((f) => f.fonte))
      .toEqual(['evento', 'evento', 'evento', 'evento', 'banco', 'banco', 'banco', 'banco']);
  });

  // Evento que ainda não aconteceu não pode virar `undefined` no JSON: o front
  // faria conta com NaN e mostraria largura de barra inválida.
  it('devolve 0 para etapa sem evento nenhum', async () => {
    mockTudo({ eventos: [{ nome: 'onboarding_visto', pessoas: 3 }] });
    const res = await get('/api/admin/metricas');
    expect(res.body.funil[1].pessoas).toBe(0);
    expect(res.body.funil[2].pessoas).toBe(0);
  });

  it('usa 30 dias por padrão e respeita o parâmetro', async () => {
    mockTudo();
    expect((await get('/api/admin/metricas')).body.dias).toBe(30);

    jest.resetAllMocks(); mockTudo();
    expect((await get('/api/admin/metricas?dias=7')).body.dias).toBe(7);
  });

  // O parâmetro vem da URL: sem teto, `?dias=999999` varre a tabela inteira e
  // trava o painel; sem piso, `?dias=0` ou `?dias=-5` gera intervalo inválido.
  it('limita o período a uma faixa segura', async () => {
    mockTudo();
    expect((await get('/api/admin/metricas?dias=99999')).body.dias).toBe(365);

    jest.resetAllMocks(); mockTudo();
    expect((await get('/api/admin/metricas?dias=-5')).body.dias).toBe(30);

    jest.resetAllMocks(); mockTudo();
    expect((await get('/api/admin/metricas?dias=abc')).body.dias).toBe(30);
  });

  it('repassa retenção, origem e conteúdo', async () => {
    mockTudo({
      retencao: { coorte: 10, voltou_d1: 3, voltou_d7: 6 },
      origem: [{ origem: 'instagram', pessoas: 40, viraram_conta: 8 }],
      conteudo: [{ materia: 'const', subtema: 'Controle', respostas: 12, pct_acerto: 25 }],
    });

    const res = await get('/api/admin/metricas');
    expect(res.body.retencao).toEqual({ coorte: 10, voltou_d1: 3, voltou_d7: 6 });
    expect(res.body.origem[0].origem).toBe('instagram');
    expect(res.body.conteudo[0].pct_acerto).toBe(25);
  });

  it('500 quando o banco falha', async () => {
    pool.query.mockRejectedValue(new Error('banco fora'));
    expect((await get('/api/admin/metricas')).status).toBe(500);
  });
});
