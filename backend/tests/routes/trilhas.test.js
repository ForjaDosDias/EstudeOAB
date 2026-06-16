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

function mockPremiumCheck(plan = 'premium') {
  pool.query.mockResolvedValueOnce({
    rows: [{ role: 'user', plan, premium_until: null }],
  });
}

const fakeTrilha = {
  id: 1,
  slug: 'essencial-1a-fase',
  nome: 'Essencial 1ª Fase',
  descricao: 'As três áreas de maior incidência no exame.',
  areas: ['etica', 'civil', 'const'],
  ordem: 1,
  total_questoes: 320,
};

beforeEach(() => jest.clearAllMocks());

describe('GET /api/trilhas', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/trilhas');
    expect(res.status).toBe(401);
  });

  it('403 PREMIUM_REQUIRED para usuário free', async () => {
    mockPremiumCheck('free');
    const res = await request(app).get('/api/trilhas').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PREMIUM_REQUIRED');
  });

  it('200 lista trilhas para usuário premium', async () => {
    mockPremiumCheck();
    pool.query.mockResolvedValueOnce({ rows: [fakeTrilha] });

    const res = await request(app).get('/api/trilhas').set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.trilhas).toHaveLength(1);
    expect(res.body.trilhas[0].slug).toBe('essencial-1a-fase');
    expect(res.body.trilhas[0].total_questoes).toBe(320);
  });
});

describe('GET /api/trilhas/:slug/questoes', () => {
  it('403 para usuário free', async () => {
    mockPremiumCheck('free');
    const res = await request(app)
      .get('/api/trilhas/essencial-1a-fase/questoes')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(403);
  });

  it('404 quando trilha não existe', async () => {
    mockPremiumCheck();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/trilhas/inexistente/questoes')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });

  it('200 sorteia questões das áreas da trilha', async () => {
    mockPremiumCheck();
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, areas: ['etica', 'civil', 'const'] }] })
      .mockResolvedValueOnce({
        rows: [{ id: 7, enunciado: 'Enunciado', area_direito: 'civil' }],
      });

    const res = await request(app)
      .get('/api/trilhas/essencial-1a-fase/questoes?total=10')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.questoes).toHaveLength(1);

    const sorteio = pool.query.mock.calls[2];
    expect(sorteio[1]).toEqual([['etica', 'civil', 'const'], 10]);
  });
});

// ── Trilha com checkpoints ─────────────────────────────────────────────────

const trilhaAreas = ['etica', 'civil', 'const'];

// incidência por área (total, edicoes, baixa, media, alta) — const cai mais
const incidenciaRows = {
  rows: [
    { area_direito: 'const', total: 27, edicoes: 3, baixa: 2, media: 19, alta: 6 },
    { area_direito: 'etica', total: 24, edicoes: 3, baixa: 5, media: 17, alta: 2 },
    { area_direito: 'civil', total: 18, edicoes: 3, baixa: 3, media: 8, alta: 7 },
  ],
};

// usuário já concluiu o tier "baixa" de ética (5 respondidas, 4 certas = 80%)
const perfRows = {
  rows: [{ area_direito: 'etica', dificuldade: 'baixa', respondidas: 5, acertos: 4 }],
};

function mockMapaQueries() {
  pool.query
    .mockResolvedValueOnce({ rows: [{ slug: 'essencial-1a-fase', nome: 'Essencial', descricao: '', areas: trilhaAreas, ordem: 1 }] })
    .mockResolvedValueOnce(incidenciaRows)
    .mockResolvedValueOnce(perfRows);
}

describe('GET /api/trilhas/:slug/mapa', () => {
  it('403 para usuário free', async () => {
    mockPremiumCheck('free');
    const res = await request(app).get('/api/trilhas/essencial-1a-fase/mapa').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(403);
  });

  it('404 quando a trilha não existe', async () => {
    mockPremiumCheck();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/trilhas/inexistente/mapa').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });

  it('ordena disciplinas por incidência e calcula trava sequencial por disciplina', async () => {
    mockPremiumCheck();
    mockMapaQueries();

    const res = await request(app).get('/api/trilhas/essencial-1a-fase/mapa').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);

    const discs = res.body.disciplinas;
    expect(discs.map((d) => d.area)).toEqual(['const', 'etica', 'civil']); // por incidência desc

    const constCps = discs.find((d) => d.area === 'const').checkpoints;
    expect(constCps[0]).toMatchObject({ dificuldade: 'baixa', concluido: false, bloqueado: false });
    // baixa não concluído → media e alta bloqueados
    expect(constCps.find((c) => c.dificuldade === 'media').bloqueado).toBe(true);

    const eticaCps = discs.find((d) => d.area === 'etica').checkpoints;
    expect(eticaCps.find((c) => c.dificuldade === 'baixa')).toMatchObject({ concluido: true, pct: 80, bloqueado: false });
    // baixa concluído → media liberado; media não concluído → alta bloqueado
    expect(eticaCps.find((c) => c.dificuldade === 'media').bloqueado).toBe(false);
    expect(eticaCps.find((c) => c.dificuldade === 'alta').bloqueado).toBe(true);
  });
});

describe('GET /api/trilhas/:slug/checkpoint/:area/:dificuldade/questoes', () => {
  it('400 para dificuldade inválida', async () => {
    mockPremiumCheck();
    const res = await request(app).get('/api/trilhas/essencial-1a-fase/checkpoint/const/dificil/questoes').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(400);
  });

  it('404 quando a disciplina não pertence à trilha', async () => {
    mockPremiumCheck();
    pool.query.mockResolvedValueOnce({ rows: [{ areas: trilhaAreas }] });
    const res = await request(app).get('/api/trilhas/essencial-1a-fase/checkpoint/penal/baixa/questoes').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });

  it('423 CHECKPOINT_LOCKED para checkpoint bloqueado', async () => {
    mockPremiumCheck();
    pool.query.mockResolvedValueOnce({ rows: [{ areas: trilhaAreas }] }); // lookup areas
    pool.query.mockResolvedValueOnce(incidenciaRows).mockResolvedValueOnce(perfRows); // montarMapa
    // const/media está bloqueado porque const/baixa não foi concluído
    const res = await request(app).get('/api/trilhas/essencial-1a-fase/checkpoint/const/media/questoes').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(423);
    expect(res.body.code).toBe('CHECKPOINT_LOCKED');
  });

  it('200 sorteia questões de checkpoint liberado', async () => {
    mockPremiumCheck();
    pool.query.mockResolvedValueOnce({ rows: [{ areas: trilhaAreas }] }); // lookup areas
    pool.query.mockResolvedValueOnce(incidenciaRows).mockResolvedValueOnce(perfRows); // montarMapa
    pool.query.mockResolvedValueOnce({ rows: [{ id: 7, enunciado: 'Q', area_direito: 'const', dificuldade: 'baixa' }] }); // sorteio
    // const/baixa é o primeiro tier → liberado
    const res = await request(app).get('/api/trilhas/essencial-1a-fase/checkpoint/const/baixa/questoes?total=10').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.questoes).toHaveLength(1);

    const sorteio = pool.query.mock.calls.at(-1);
    expect(sorteio[1]).toEqual(['const', 'baixa', 10]);
  });
});
