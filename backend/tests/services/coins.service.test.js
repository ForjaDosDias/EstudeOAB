jest.mock('../../src/db', () => ({ query: jest.fn(), connect: jest.fn() }));

const pool = require('../../src/db');
const coins = require('../../src/services/coins.service');

beforeEach(() => jest.clearAllMocks());

describe('award', () => {
  it('credita e atualiza saldo quando a transação é nova', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT coin_transactions
      .mockResolvedValueOnce({ rows: [] });         // UPDATE users

    const ganhas = await coins.award(1, 'login_diario', '2026-06-11');
    expect(ganhas).toBe(5);

    const update = pool.query.mock.calls[1];
    expect(update[0]).toContain('coins = coins +');
    expect(update[1]).toEqual([5, 1]);
  });

  it('idempotente: não credita duas vezes a mesma referência', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // ON CONFLICT DO NOTHING
    const ganhas = await coins.award(1, 'login_diario', '2026-06-11');
    expect(ganhas).toBe(0);
    expect(pool.query).toHaveBeenCalledTimes(1); // não tenta atualizar saldo
  });

  it('rejeita tipo desconhecido', async () => {
    await expect(coins.award(1, 'tipo_invalido', 'x')).rejects.toThrow('Tipo de moeda desconhecido');
  });
});

describe('awardQuestionBlock', () => {
  it('credita quando o total do dia é múltiplo de 5', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: 5 }] })  // COUNT answers
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })     // INSERT
      .mockResolvedValueOnce({ rows: [] });             // UPDATE saldo

    const ganhas = await coins.awardQuestionBlock(1);
    expect(ganhas).toBe(10);
  });

  it('não credita fora do múltiplo de 5', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ total: 3 }] });
    const ganhas = await coins.awardQuestionBlock(1);
    expect(ganhas).toBe(0);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('não credita com zero respostas', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ total: 0 }] });
    expect(await coins.awardQuestionBlock(1)).toBe(0);
  });
});

describe('awardComment', () => {
  it('credita comentário dentro do limite diário', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] }) // COUNT comentários do dia
      .mockResolvedValueOnce({ rows: [{ id: 3 }] })    // INSERT
      .mockResolvedValueOnce({ rows: [] });            // UPDATE saldo

    expect(await coins.awardComment(1, 77)).toBe(2);
  });

  it('não credita acima do limite diário', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ total: coins.MAX_COMENTARIOS_DIA }] });
    expect(await coins.awardComment(1, 78)).toBe(0);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

describe('awardPurchase', () => {
  it('credita compra com referência do pagamento', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 4 }] })
      .mockResolvedValueOnce({ rows: [] });

    expect(await coins.awardPurchase(1, '555')).toBe(100);
    const insert = pool.query.mock.calls[0];
    expect(insert[1]).toEqual([1, 'compra', 100, 'payment:555']);
  });
});
