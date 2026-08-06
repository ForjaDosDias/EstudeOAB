/**
 * Classifica as questões no catálogo da tabela `temas`.
 *
 * A coluna legada `questions.tema` é texto livre (~236 valores distintos para
 * 238 questões) e não agrupa nada. A trilha por incidência precisa de um
 * catálogo fechado — este script preenche `questions.tema_id`.
 *
 * Uso:
 *   docker exec estudeoab-backend-1 node scripts/classificar-temas.js
 *   docker exec estudeoab-backend-1 node scripts/classificar-temas.js --limit 20
 *   docker exec estudeoab-backend-1 node scripts/classificar-temas.js --dry-run
 *
 * Idempotente: só processa questões com `tema_id IS NULL`, então pode rodar
 * quantas vezes for preciso, em lotes.
 *
 * Regras de segurança da classificação:
 *  - a IA escolhe apenas entre os temas JÁ cadastrados da mesma área da questão;
 *    slug inventado é descartado, o script nunca cria tema novo;
 *  - sem correspondência clara, a questão fica com `tema_id NULL` e vai para
 *    revisão humana no /admin. Errar para menos é melhor que rotular errado.
 */

const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DELAY_MS = 250; // respeita rate limit da API

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMITE = (() => {
  const i = args.indexOf('--limit');
  return i > -1 ? parseInt(args[i + 1], 10) : null;
})();

function makeClient() {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY não configurada');
  return new Anthropic({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/anthropic',
  });
}

function montarPrompt(questao, temasCandidatos, escopo) {
  const catalogo = temasCandidatos.map((t) => `- ${t.slug}: ${t.nome}`).join('\n');
  return `Você classifica questões da OAB em um catálogo fechado de temas.

CATÁLOGO (${escopo}) — escolha exatamente um slug desta lista:
${catalogo}

QUESTÃO:
${(questao.enunciado || '').slice(0, 1500)}

Responda APENAS com JSON, sem texto ao redor:
{"slug": "<slug do catálogo>", "confianca": "alta|media|baixa"}

Se nenhum tema do catálogo servir, responda {"slug": null, "confianca": "baixa"}.
Nunca invente um slug que não esteja na lista.`;
}

async function main() {
  const { rows: temas } = await pool.query(
    'SELECT id, slug, nome, disciplina FROM temas WHERE ativo ORDER BY disciplina, nome'
  );
  if (!temas.length) {
    console.error('Catálogo de temas vazio — rode o seed de `temas` antes.');
    process.exit(1);
  }

  const porArea = {};
  for (const t of temas) (porArea[t.disciplina] ||= []).push(t);

  const { rows: questoes } = await pool.query(
    `SELECT id, enunciado, area_direito
       FROM questions
      WHERE tema_id IS NULL AND enunciado IS NOT NULL
      ORDER BY id
      ${LIMITE ? 'LIMIT ' + LIMITE : ''}`
  );

  console.log(`${questoes.length} questão(ões) sem tema · catálogo com ${temas.length} temas`);
  if (DRY_RUN) console.log('--dry-run: nada será gravado\n');

  const client = makeClient();
  let classificadas = 0;
  let porFallback = 0;
  let semCorrespondencia = 0;
  let erros = 0;

  // Pergunta ao modelo e devolve o tema do catálogo, ou null se o slug não existir lá.
  async function escolherTema(questao, candidatos, escopo) {
    const resp = await client.messages.create({
      model: DEEPSEEK_MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: montarPrompt(questao, candidatos, escopo) }],
    });
    const raw = resp.content[0]?.text || '';
    const json = raw.match(/\{[\s\S]*\}/);
    const escolha = json ? JSON.parse(json[0]) : {};
    // Nunca confia cego: só aceita slug que exista na lista oferecida
    return { tema: candidatos.find((t) => t.slug === escolha.slug) || null, confianca: escolha.confianca };
  }

  for (const q of questoes) {
    try {
      const daArea = porArea[q.area_direito] || [];
      let { tema, confianca } = daArea.length
        ? await escolherTema(q, daArea, `área "${q.area_direito}"`)
        : { tema: null };
      let viaFallback = false;

      // Segundo passe com o catálogo inteiro. O `area_direito` do banco é
      // inconsistente para matérias transversais — eleitoral, financeiro e
      // ambiental aparecem ora em `outros`, ora em `adm`, ora em `const` —,
      // então restringir à área perde classificação que existe no catálogo.
      if (!tema) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
        const alt = await escolherTema(q, temas, 'catálogo completo');
        // O fallback abre o catálogo inteiro, então aceita rótulo de qualquer
        // disciplina — e aí um "media" vira erro grosseiro (já aconteceu: uma
        // questão trabalhista recebeu um tema de Penal). Só entra com ALTA;
        // o resto vai para revisão humana, fiel ao "errar para menos".
        if (alt.tema && alt.confianca === 'alta') {
          tema = alt.tema;
          confianca = alt.confianca;
          viaFallback = true;
        }
      }

      if (!tema) {
        console.log(`  #${q.id} [${q.area_direito}] sem correspondência → fica para revisão`);
        semCorrespondencia++;
      } else {
        if (!DRY_RUN) {
          await pool.query('UPDATE questions SET tema_id = $1 WHERE id = $2', [tema.id, q.id]);
        }
        console.log(
          `  #${q.id} [${q.area_direito}] → ${tema.nome} (${confianca || '?'})` +
            (viaFallback ? ' [fallback: área do banco não bate com o catálogo]' : '')
        );
        classificadas++;
        if (viaFallback) porFallback++;
      }
    } catch (err) {
      console.error(`  #${q.id} ERRO: ${err.message}`);
      erros++;
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(
    `\nclassificadas=${classificadas} (${porFallback} por fallback) ` +
      `sem_correspondencia=${semCorrespondencia} erros=${erros}`
  );
  if (semCorrespondencia) {
    console.log('As não classificadas ficam com tema_id NULL para revisão no /admin.');
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
