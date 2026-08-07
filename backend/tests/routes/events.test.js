jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../src/db');

const app = express();
app.use(express.json());
app.use('/api/events', require('../../src/routes/events'));

const JWT_SECRET = process.env.JWT_SECRET;
const ANON = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

// Cada teste precisa de um anon_id próprio: o rate limit é por anon_id e vive
// em memória entre os testes do arquivo. Reusar o mesmo faria um teste derrubar
// o seguinte por 429, num erro que não teria nada a ver com ele.
let n = 0;
const anon = () => `3f2504e0-4f89-11d3-9a0c-${String(++n).padStart(12, '0')}`;

const post = (body, token) => {
  const r = request(app).post('/api/events').send(body);
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
};

beforeEach(() => {
  jest.resetAllMocks();
  pool.query.mockResolvedValue({ rows: [] });
});

describe('POST /api/events', () => {
  /**
   * Guardrail central: este endpoint NÃO exige token de propósito. O evento
   * mais valioso do funil — "abriu o site e desistiu no onboarding" — acontece
   * antes de existir conta. Se alguém puser requireAuth aqui, o funil volta a
   * começar no cadastro e ninguém percebe, porque continua gravando eventos.
   */
  it('aceita evento sem token nenhum', async () => {
    const res = await post({ anon_id: ANON, nome: 'onboarding_visto' });
    expect(res.status).toBe(204);

    const [, params] = pool.query.mock.calls[0];
    expect(params[0]).toBe(ANON);
    expect(params[1]).toBeNull(); // user_id
    expect(params[2]).toBe('onboarding_visto');
  });

  it('liga o evento à conta quando o token é válido', async () => {
    const token = jwt.sign({ userId: 7, email: 'a@b.com', role: 'user' }, JWT_SECRET);
    await post({ anon_id: anon(), nome: 'sessao_concluida' }, token);
    expect(pool.query.mock.calls[0][1][1]).toBe(7);
  });

  // Token vencido ou adulterado não pode virar 401: métrica não é lugar de
  // barrar ninguém. O evento entra anônimo e o funil continua inteiro.
  it('grava anônimo quando o token é inválido, em vez de recusar', async () => {
    const res = await post({ anon_id: anon(), nome: 'trilha_vista' }, 'lixo.token.falso');
    expect(res.status).toBe(204);
    expect(pool.query.mock.calls[0][1][1]).toBeNull();
  });

  // Guardrail: endpoint público sem allowlist vira depósito de lixo — e pior,
  // lixo silencioso, que só aparece quando o painel mente.
  it('400 para evento fora da allowlist', async () => {
    const res = await post({ anon_id: anon(), nome: 'evento_inventado' });
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('400 para anon_id que não é UUID', async () => {
    const res = await post({ anon_id: 'sou-um-id-qualquer', nome: 'onboarding_visto' });
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('413 para props acima do teto', async () => {
    const res = await post({
      anon_id: anon(),
      nome: 'foco_escolhido',
      props: { lixo: 'x'.repeat(3000) },
    });
    expect(res.status).toBe(413);
    expect(pool.query).not.toHaveBeenCalled();
  });

  // props/utm precisam ser objeto: array ou string viraria JSONB de formato
  // imprevisível e quebraria as agregações do painel meses depois.
  it('normaliza props e utm que não são objeto', async () => {
    await post({ anon_id: anon(), nome: 'conta_criada', props: 'texto', utm: [1, 2] });
    const params = pool.query.mock.calls[0][1];
    expect(params[3]).toEqual({});
    expect(params[4]).toEqual({});
  });

  it('guarda props e utm quando são objeto', async () => {
    await post({
      anon_id: anon(),
      nome: 'foco_escolhido',
      props: { materias: 5 },
      utm: { source: 'instagram' },
    });
    const params = pool.query.mock.calls[0][1];
    expect(params[3]).toEqual({ materias: 5 });
    expect(params[4]).toEqual({ source: 'instagram' });
  });

  // A API não tem rate limit em lugar nenhum hoje e este é o endpoint mais
  // exposto do sistema: sem teto, um `for` enche o disco do servidor.
  it('429 depois de estourar o limite por minuto', async () => {
    const id = anon();
    let ultimo;
    for (let i = 0; i < 45; i++) {
      ultimo = await post({ anon_id: id, nome: 'onboarding_visto' });
    }
    expect(ultimo.status).toBe(429);
  });

  it('o limite é por anon_id, não global', async () => {
    const id = anon();
    for (let i = 0; i < 45; i++) await post({ anon_id: id, nome: 'onboarding_visto' });

    const outro = await post({ anon_id: anon(), nome: 'onboarding_visto' });
    expect(outro.status).toBe(204);
  });

  // Falha ao gravar métrica não pode virar erro na cara do aluno: o front
  // dispara isto no meio do onboarding e um 500 acenderia erro no console
  // numa chamada que não afeta nada do produto.
  it('202 quando o banco falha, nunca 500', async () => {
    pool.query.mockRejectedValueOnce(new Error('banco fora'));
    const res = await post({ anon_id: anon(), nome: 'conta_criada' });
    expect(res.status).toBe(202);
  });
});
