jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('@anthropic-ai/sdk');
jest.mock('pdf-parse');

const request  = require('supertest');
const express  = require('express');
const jwt      = require('jsonwebtoken');
const pool     = require('../../src/db');
const Anthropic = require('@anthropic-ai/sdk');
const pdfParse = require('pdf-parse');

const app = express();
app.use(express.json());
app.use('/api/admin', require('../../src/routes/admin'));

const JWT_SECRET = process.env.JWT_SECRET;

function token(role = 'admin') {
  return jwt.sign({ userId: 1, email: 'admin@oab.com', role }, JWT_SECRET);
}

const fakeQuestao = {
  id: 'XLI-Q001', banca: 'FGV', edicao: 'XLI', ano: 2024,
  numero_questao: 1,
  enunciado: 'Qual é o prazo prescricional?',
  alternativa_a: 'Um ano', alternativa_b: 'Dois anos',
  alternativa_c: 'Três anos', alternativa_d: 'Cinco anos',
  gabarito: 'C', area_direito: 'civil', dificuldade: 'media',
};

const fakeIAResponse = {
  content: [{ text: JSON.stringify([fakeQuestao]) }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 100, output_tokens: 200 },
};

// ── POST /api/admin/import-pdf ────────────────────────────────────────────────

describe('POST /api/admin/import-pdf', () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    Anthropic.mockImplementation(() => ({
      messages: { create: jest.fn().mockResolvedValue(fakeIAResponse) },
    }));
    pdfParse.mockResolvedValue({ text: 'Questão 1. ' + 'x'.repeat(200) });
  });

  it('401 sem token', async () => {
    const res = await request(app).post('/api/admin/import-pdf');
    expect(res.status).toBe(401);
  });

  it('403 para usuário comum', async () => {
    const res = await request(app)
      .post('/api/admin/import-pdf')
      .set('Authorization', `Bearer ${token('user')}`);
    expect(res.status).toBe(403);
  });

  it('400 sem arquivo PDF', async () => {
    const res = await request(app)
      .post('/api/admin/import-pdf')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nenhum arquivo/i);
  });

  it('400 com arquivo que não é PDF', async () => {
    const res = await request(app)
      .post('/api/admin/import-pdf')
      .set('Authorization', `Bearer ${token()}`)
      .attach('pdfs', Buffer.from('conteudo'), 'arquivo.csv');
    expect(res.status).toBe(400);
  });

  it('422 quando pdf-parse não extrai texto', async () => {
    pdfParse.mockResolvedValue({ text: '' });
    const res = await request(app)
      .post('/api/admin/import-pdf')
      .set('Authorization', `Bearer ${token()}`)
      .attach('pdfs', Buffer.from('%PDF-1.4'), 'prova.pdf');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/não tem texto/i);
  });

  it('200 retorna jobId imediatamente (processamento assíncrono)', async () => {
    const res = await request(app)
      .post('/api/admin/import-pdf')
      .set('Authorization', `Bearer ${token()}`)
      .attach('pdfs', Buffer.from('%PDF-1.4'), 'prova.pdf');
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.status).toBe('processing');
  });

  it('job conclui com questões após o setImmediate executar', async () => {
    const res = await request(app)
      .post('/api/admin/import-pdf')
      .set('Authorization', `Bearer ${token()}`)
      .attach('pdfs', Buffer.from('%PDF-1.4'), 'prova.pdf');
    const { jobId } = res.body;

    // Aguarda o setImmediate do background processar
    await new Promise(r => setTimeout(r, 200));

    const statusRes = await request(app)
      .get(`/api/admin/import-status/${jobId}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('done');
    expect(statusRes.body.questoes[0].id).toBe('XLI-Q001');
    expect(statusRes.body.total).toBe(1);
  });

  it('200 com 2 PDFs — job conclui com gabarito preenchido', async () => {
    const questaoComGabarito = { ...fakeQuestao, gabarito: 'C' };
    Anthropic.mockImplementation(() => ({
      messages: { create: jest.fn().mockResolvedValue({ ...fakeIAResponse, content: [{ text: JSON.stringify([questaoComGabarito]) }] }) },
    }));
    pdfParse.mockResolvedValue({ text: 'Questão 1. ' + 'x'.repeat(200) });

    const res = await request(app)
      .post('/api/admin/import-pdf')
      .set('Authorization', `Bearer ${token()}`)
      .attach('pdfs', Buffer.from('%PDF-1.4'), 'caderno.pdf')
      .attach('pdfs', Buffer.from('%PDF-1.4'), 'gabarito.pdf');

    await new Promise(r => setTimeout(r, 200));

    const statusRes = await request(app)
      .get(`/api/admin/import-status/${res.body.jobId}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(statusRes.body.status).toBe('done');
    expect(statusRes.body.com_gabarito).toBe(1);
    expect(statusRes.body.questoes[0].gabarito).toBe('C');
  });

  it('job fica com erro quando IA não retorna nenhuma questão', async () => {
    Anthropic.mockImplementation(() => ({
      messages: { create: jest.fn().mockResolvedValue({ ...fakeIAResponse, content: [{ text: 'Desculpe, não consegui processar.' }] }) },
    }));
    const res = await request(app)
      .post('/api/admin/import-pdf')
      .set('Authorization', `Bearer ${token()}`)
      .attach('pdfs', Buffer.from('%PDF-1.4'), 'prova.pdf');

    await new Promise(r => setTimeout(r, 200));

    const statusRes = await request(app)
      .get(`/api/admin/import-status/${res.body.jobId}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(statusRes.body.status).toBe('error');
    expect(statusRes.body.erro).toMatch(/nenhuma questão/i);
  });

  it('GET /import-status retorna 404 para jobId inexistente', async () => {
    const res = await request(app)
      .get('/api/admin/import-status/job-inexistente')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });
});

// ── POST /api/admin/questions/:id/explicacao ─────────────────────────────────

describe('POST /api/admin/questions/:id/explicacao', () => {
  const fakeQuestaoCompleta = {
    id: 1, banca: 'FGV', edicao: 'XLI', ano: 2024, numero_questao: 1,
    enunciado: 'Qual é o prazo?', comando: null,
    alternativa_a: 'Um ano', alternativa_b: 'Dois anos',
    alternativa_c: 'Três anos', alternativa_d: 'Cinco anos',
    gabarito: 'C', area_direito: 'civil', materia: 'Prazos', legislacao_ref: null,
  };

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    Anthropic.mockImplementation(() => ({
      messages: { create: jest.fn().mockResolvedValue({
        content: [{ text: '{"explicacao":"O prazo é de três anos.","legislacao_ref":"Art. 206 · CC/2002"}' }],
        stop_reason: 'end_turn',
      }) },
    }));
  });

  it('401 sem token', async () => {
    const res = await request(app).post('/api/admin/questions/1/explicacao');
    expect(res.status).toBe(401);
  });

  it('403 para usuário comum', async () => {
    const res = await request(app)
      .post('/api/admin/questions/1/explicacao')
      .set('Authorization', `Bearer ${token('user')}`);
    expect(res.status).toBe(403);
  });

  it('404 quando questão não existe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/admin/questions/999/explicacao')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });

  it('400 quando questão não tem gabarito', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ ...fakeQuestaoCompleta, gabarito: null }] });
    const res = await request(app)
      .post('/api/admin/questions/1/explicacao')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/gabarito/i);
  });

  it('200 gera e salva explicação', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [fakeQuestaoCompleta] })  // SELECT questão
      .mockResolvedValueOnce({ rows: [] });                    // UPDATE

    const res = await request(app)
      .post('/api/admin/questions/1/explicacao')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.explicacao).toBe('O prazo é de três anos.');
    expect(res.body.legislacao_ref).toBe('Art. 206 · CC/2002');
  });
});

// ── POST /api/admin/bulk-save ─────────────────────────────────────────────────

describe('POST /api/admin/bulk-save', () => {
  it('401 sem token', async () => {
    const res = await request(app).post('/api/admin/bulk-save').send({});
    expect(res.status).toBe(401);
  });

  it('403 para usuário comum', async () => {
    const res = await request(app)
      .post('/api/admin/bulk-save')
      .set('Authorization', `Bearer ${token('user')}`)
      .send({ questoes: [fakeQuestao] });
    expect(res.status).toBe(403);
  });

  it('400 sem questões', async () => {
    const res = await request(app)
      .post('/api/admin/bulk-save')
      .set('Authorization', `Bearer ${token()}`)
      .send({ questoes: [] });
    expect(res.status).toBe(400);
  });

  it('200 com relatório de inserção', async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ is_insert: true }] })
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);

    const res = await request(app)
      .post('/api/admin/bulk-save')
      .set('Authorization', `Bearer ${token()}`)
      .send({ questoes: [fakeQuestao] });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
    expect(res.body.updated).toBe(0);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('200 contabiliza update quando questão já existe', async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ is_insert: false }] })
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);

    const res = await request(app)
      .post('/api/admin/bulk-save')
      .set('Authorization', `Bearer ${token()}`)
      .send({ questoes: [fakeQuestao] });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
    expect(res.body.inserted).toBe(0);
  });

  it('200 conta skipped para questão sem enunciado', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);

    const res = await request(app)
      .post('/api/admin/bulk-save')
      .set('Authorization', `Bearer ${token()}`)
      .send({ questoes: [{ ...fakeQuestao, enunciado: '' }] });

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(1);
  });
});

// ── PUT /api/admin/questions/:id ──────────────────────────────────────────────

describe('PUT /api/admin/questions/:id', () => {
  it('401 sem token', async () => {
    const res = await request(app).put('/api/admin/questions/1').send({});
    expect(res.status).toBe(401);
  });

  it('403 para usuário comum', async () => {
    const res = await request(app)
      .put('/api/admin/questions/1')
      .set('Authorization', `Bearer ${token('user')}`)
      .send({ enunciado: 'Teste' });
    expect(res.status).toBe(403);
  });

  it('400 sem enunciado', async () => {
    const res = await request(app)
      .put('/api/admin/questions/1')
      .set('Authorization', `Bearer ${token()}`)
      .send({ gabarito: 'A' });
    expect(res.status).toBe(400);
  });

  it('404 quando questão não existe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/api/admin/questions/999')
      .set('Authorization', `Bearer ${token()}`)
      .send({ enunciado: 'Qual o prazo?' });
    expect(res.status).toBe(404);
  });

  it('200 com questão atualizada', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, enunciado: 'Qual o prazo?', gabarito: 'A' }] });
    const res = await request(app)
      .put('/api/admin/questions/1')
      .set('Authorization', `Bearer ${token()}`)
      .send({ enunciado: 'Qual o prazo?', gabarito: 'A' });
    expect(res.status).toBe(200);
    expect(res.body.enunciado).toBe('Qual o prazo?');
  });
});

// ── DELETE /api/admin/questions/:id ──────────────────────────────────────────

describe('DELETE /api/admin/questions/:id', () => {
  it('401 sem token', async () => {
    const res = await request(app).delete('/api/admin/questions/1');
    expect(res.status).toBe(401);
  });

  it('403 para usuário comum', async () => {
    const res = await request(app)
      .delete('/api/admin/questions/1')
      .set('Authorization', `Bearer ${token('user')}`);
    expect(res.status).toBe(403);
  });

  it('404 quando questão não existe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/api/admin/questions/999')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });

  it('200 confirma deleção', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .delete('/api/admin/questions/1')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });
});
