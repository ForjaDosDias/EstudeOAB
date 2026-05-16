/* Mock data para o protótipo */

const AREAS = {
  civil:    { id: 'civil',    label: 'Direito Civil',         icon: '⚖️',  pillClass: 'area-pill-civil' },
  const:    { id: 'const',    label: 'Constitucional',        icon: '🏛',  pillClass: 'area-pill-const' },
  penal:    { id: 'penal',    label: 'Penal',                 icon: '⚠️',  pillClass: 'area-pill-penal' },
  trabalho: { id: 'trabalho', label: 'Trabalhista',           icon: '👷',  pillClass: 'area-pill-trabalho' },
  adm:      { id: 'adm',      label: 'Administrativo',        icon: '📋',  pillClass: 'area-pill-adm' },
  etica:    { id: 'etica',    label: 'Ética Profissional',    icon: '🤝',  pillClass: 'area-pill-etica' },
  trib:     { id: 'trib',     label: 'Tributário',            icon: '💰',  pillClass: 'area-pill-trib' },
};

const QUESTIONS = [
  {
    id: 'q-001',
    area: 'civil',
    banca: 'FGV',
    edicao: 'OAB XXXIX',
    ano: 2023,
    dificuldade: 'média',
    enunciado: 'Marcos, ao conduzir seu veículo particular, colide com o carro de Ana causando danos materiais. Não há prova de embriaguez nem excesso de velocidade. Segundo o Código Civil, a responsabilidade de Marcos perante Ana é classificada como:',
    artigo: 'ART. 186 · CC/2002',
    opcoes: [
      { letra: 'A', texto: 'Objetiva, independente de culpa, por envolver veículo automotor em via pública.' },
      { letra: 'B', texto: 'Subjetiva, dependente de demonstração de dolo ou culpa do agente causador.' },
      { letra: 'C', texto: 'Objetiva por risco da atividade, nos termos do art. 927, parágrafo único, do CC.' },
      { letra: 'D', texto: 'Presumida, com inversão automática do ônus da prova em favor da vítima.' },
    ],
    correta: 'B',
    explicacao: 'A responsabilidade civil por acidente automobilístico entre particulares é, em regra, subjetiva (art. 186 CC), exigindo prova de dolo ou culpa. A responsabilidade objetiva por risco (art. 927, p.ú.) só incide em atividades de risco inerente, o que não é o caso da condução comum de veículo.',
  },
  {
    id: 'q-002',
    area: 'const',
    banca: 'FGV',
    edicao: 'OAB XXXIX',
    ano: 2023,
    dificuldade: 'alta',
    enunciado: 'O Município de Aracaju editou lei dispondo sobre o horário de funcionamento de bancos privados em seu território. Considerando a repartição constitucional de competências, é correto afirmar que:',
    artigo: 'ART. 22, VII · CF/88',
    opcoes: [
      { letra: 'A', texto: 'A lei é válida, pois compete ao Município legislar sobre assuntos de interesse local.' },
      { letra: 'B', texto: 'A lei é inválida; a matéria é de competência privativa da União, por se tratar de política de crédito.' },
      { letra: 'C', texto: 'A lei é válida, mas apenas se houver autorização expressa em lei complementar federal.' },
      { letra: 'D', texto: 'A lei é inválida; somente os Estados podem legislar sobre o tema em caráter suplementar.' },
    ],
    correta: 'A',
    explicacao: 'Segundo o STF (Súmula Vinculante 38), o Município é competente para fixar o horário de funcionamento de estabelecimentos comerciais, inclusive bancos, por se tratar de assunto de interesse local (art. 30, I, CF/88). A competência da União sobre política de crédito não alcança o horário de atendimento.',
  },
  {
    id: 'q-003',
    area: 'etica',
    banca: 'FGV',
    edicao: 'OAB XXXVIII',
    ano: 2023,
    dificuldade: 'baixa',
    enunciado: 'Dr. Rafael, advogado, é procurado por João, que confessa ter cometido crime de homicídio. Em relação ao sigilo profissional, é correto afirmar que:',
    artigo: 'ART. 35 · EOAB',
    opcoes: [
      { letra: 'A', texto: 'O advogado deve denunciar o cliente às autoridades por ser confissão de crime hediondo.' },
      { letra: 'B', texto: 'O sigilo só se aplica após a assinatura do contrato escrito de honorários.' },
      { letra: 'C', texto: 'O sigilo profissional é dever do advogado, alcançando inclusive fatos confidenciados antes da contratação formal.' },
      { letra: 'D', texto: 'O advogado pode revelar o fato se concordar com a anuência do Conselho Seccional.' },
    ],
    correta: 'C',
    explicacao: 'O sigilo profissional do advogado é dever fundamental (art. 7º, XIX, e art. 34, VII, EOAB) e alcança fatos conhecidos em razão do exercício da profissão, mesmo antes da contratação formal. Trata-se de garantia da relação cliente-advogado e da própria administração da Justiça.',
  },
  {
    id: 'q-004',
    area: 'penal',
    banca: 'FGV',
    edicao: 'OAB XXXVIII',
    ano: 2023,
    dificuldade: 'média',
    enunciado: 'Joana, em legítima defesa, repele agressão injusta de Pedro, causando-lhe lesão corporal grave. Posteriormente, descobre-se que Pedro era inimputável por doença mental. Sobre a situação, é correto afirmar que:',
    artigo: 'ART. 25 · CP',
    opcoes: [
      { letra: 'A', texto: 'A legítima defesa é descaracterizada, pois pressupõe agressão de pessoa imputável.' },
      { letra: 'B', texto: 'Joana responderá por lesão corporal culposa, em razão da inimputabilidade do agressor.' },
      { letra: 'C', texto: 'A legítima defesa permanece configurada; a inimputabilidade do agressor não afasta a injustiça da agressão.' },
      { letra: 'D', texto: 'Configura-se estado de necessidade defensivo, e não legítima defesa.' },
    ],
    correta: 'C',
    explicacao: 'A injustiça da agressão é requisito objetivo da legítima defesa (art. 25 CP) e independe da imputabilidade do agressor. Ainda que Pedro seja inimputável, sua conduta agressora é antijurídica, e Joana pode repeli-la usando moderadamente os meios necessários.',
  },
  {
    id: 'q-005',
    area: 'trabalho',
    banca: 'FGV',
    edicao: 'OAB XXXIX',
    ano: 2023,
    dificuldade: 'média',
    enunciado: 'Carlos foi contratado como pedreiro, mas, na prática, exerce funções administrativas de coordenação de obra, com subordinação direta ao engenheiro responsável. Sobre a relação de trabalho, é correto afirmar que:',
    artigo: 'ART. 9º · CLT',
    opcoes: [
      { letra: 'A', texto: 'Prevalece o registro formal em CTPS, pois fora assinado por ambas as partes.' },
      { letra: 'B', texto: 'Aplica-se o princípio da primazia da realidade: prevalece a função efetivamente exercida.' },
      { letra: 'C', texto: 'A alteração de função somente é válida com aditivo contratual escrito.' },
      { letra: 'D', texto: 'Carlos pode pleitear apenas diferenças salariais, sem retificação do registro.' },
    ],
    correta: 'B',
    explicacao: 'O princípio da primazia da realidade (art. 9º CLT) determina que prevaleça a realidade fática sobre o que está formalmente documentado. Carlos pode pleitear retificação do registro e diferenças salariais correspondentes à função efetivamente exercida.',
  },
  {
    id: 'q-006',
    area: 'adm',
    banca: 'FGV',
    edicao: 'OAB XXXVIII',
    ano: 2023,
    dificuldade: 'alta',
    enunciado: 'A Administração Pública pretende celebrar contrato de prestação de serviços com valor de R$ 80.000,00. Considerando a Lei nº 14.133/2021 (Nova Lei de Licitações), a modalidade adequada será:',
    artigo: 'ART. 75 · LEI 14.133/21',
    opcoes: [
      { letra: 'A', texto: 'Pregão eletrônico, por se tratar de serviço comum.' },
      { letra: 'B', texto: 'Concorrência, em razão do valor envolvido.' },
      { letra: 'C', texto: 'Dispensa de licitação, por estar abaixo do teto legal para serviços (R$ 100 mil em 2024).' },
      { letra: 'D', texto: 'Tomada de preços, modalidade mantida para faixas intermediárias.' },
    ],
    correta: 'C',
    explicacao: 'A Lei 14.133/2021 (art. 75, II) prevê dispensa de licitação para contratação de serviços e compras com valor até o limite anualmente atualizado (em 2024, aproximadamente R$ 59 mil; o valor exato pode variar). O exemplo acima ilustra o raciocínio. A tomada de preços foi extinta pela nova lei.',
  },
  {
    id: 'q-007',
    area: 'civil',
    banca: 'FGV',
    edicao: 'OAB XXXVII',
    ano: 2022,
    dificuldade: 'baixa',
    enunciado: 'Sobre a capacidade civil das pessoas naturais segundo o Código Civil, é correto afirmar que:',
    artigo: 'ART. 3º · CC/2002',
    opcoes: [
      { letra: 'A', texto: 'São absolutamente incapazes os menores de 18 anos.' },
      { letra: 'B', texto: 'São absolutamente incapazes apenas os menores de 16 anos.' },
      { letra: 'C', texto: 'A capacidade plena é adquirida aos 21 anos, segundo regra geral.' },
      { letra: 'D', texto: 'Pessoas com transtornos mentais são sempre absolutamente incapazes.' },
    ],
    correta: 'B',
    explicacao: 'Após a Lei 13.146/2015 (Estatuto da Pessoa com Deficiência), o art. 3º do CC passou a considerar absolutamente incapazes apenas os menores de 16 anos. A maioridade civil ocorre aos 18 anos (art. 5º).',
  },
  {
    id: 'q-008',
    area: 'const',
    banca: 'FGV',
    edicao: 'OAB XXXVII',
    ano: 2022,
    dificuldade: 'média',
    enunciado: 'Sobre o controle de constitucionalidade no Brasil, qual afirmação está correta?',
    artigo: 'ART. 102 · CF/88',
    opcoes: [
      { letra: 'A', texto: 'O controle difuso só pode ser exercido pelo STF.' },
      { letra: 'B', texto: 'A ADI tem efeito apenas inter partes.' },
      { letra: 'C', texto: 'O controle concentrado é exercido originariamente pelo STF, com efeitos erga omnes e vinculantes.' },
      { letra: 'D', texto: 'A modulação dos efeitos da decisão é vedada no controle concentrado.' },
    ],
    correta: 'C',
    explicacao: 'O controle concentrado de constitucionalidade é exercido originariamente pelo STF (art. 102, I, "a", CF), e suas decisões em ADI/ADC têm efeito erga omnes e vinculante (art. 102, §2º, CF e art. 28, p.ú., Lei 9.868/99).',
  },
];

// Histórico simulado de respostas (para a área de estatísticas)
const RESPOSTAS_HISTORICO = [
  { qId: 'q-001', escolhida: 'C', correta: 'B', area: 'civil',    data: '2026-05-15T18:42:00', tempo: 134, sessao: 'Sessão livre' },
  { qId: 'q-002', escolhida: 'A', correta: 'A', area: 'const',    data: '2026-05-15T18:39:00', tempo:  87, sessao: 'Sessão livre' },
  { qId: 'q-003', escolhida: 'C', correta: 'C', area: 'etica',    data: '2026-05-15T18:35:00', tempo:  62, sessao: 'Sessão livre' },
  { qId: 'q-004', escolhida: 'C', correta: 'C', area: 'penal',    data: '2026-05-14T20:10:00', tempo: 156, sessao: 'Simulado XXXIX' },
  { qId: 'q-005', escolhida: 'A', correta: 'B', area: 'trabalho', data: '2026-05-14T20:05:00', tempo: 188, sessao: 'Simulado XXXIX' },
  { qId: 'q-006', escolhida: 'C', correta: 'C', area: 'adm',      data: '2026-05-14T19:58:00', tempo: 142, sessao: 'Simulado XXXIX' },
  { qId: 'q-007', escolhida: 'B', correta: 'B', area: 'civil',    data: '2026-05-13T07:22:00', tempo:  54, sessao: 'Aquecimento manhã' },
  { qId: 'q-008', escolhida: 'D', correta: 'C', area: 'const',    data: '2026-05-13T07:18:00', tempo:  98, sessao: 'Aquecimento manhã' },
];

// Estatística agregada por área
const STATS_AREAS = [
  { area: 'civil',    total: 200, respondidas: 164, acertos: 134, pct: 82 },
  { area: 'const',    total: 200, respondidas: 122, acertos:  74, pct: 61 },
  { area: 'etica',    total: 100, respondidas:  93, acertos:  86, pct: 93 },
  { area: 'penal',    total: 180, respondidas:  88, acertos:  61, pct: 69 },
  { area: 'trabalho', total: 160, respondidas:  72, acertos:  43, pct: 60 },
  { area: 'adm',      total: 140, respondidas:  54, acertos:  38, pct: 70 },
  { area: 'trib',     total: 120, respondidas:  33, acertos:  19, pct: 58 },
];

const STATS_OVERVIEW = {
  acertosPct: 74,
  questoesRespondidas: 1248,
  simuladosCompletos: 8,
  tempoEstudoH: 42,
  xpTotal: 3240,
  xpHoje: 120,
  streak: 14,
  metaDiaria: { feito: 18, alvo: 20 },
};

// últimos 7 dias — % acertos para o sparkline
const SPARK_7D = [62, 68, 71, 65, 78, 80, 74];

window.AppData = { AREAS, QUESTIONS, RESPOSTAS_HISTORICO, STATS_AREAS, STATS_OVERVIEW, SPARK_7D };
