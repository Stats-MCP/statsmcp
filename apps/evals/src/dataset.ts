import { z } from 'zod';

import { SERVER_IDS, type ServerId } from '@/servers';

const caseSchema = z.object({
  id: z.string(),
  server: z.custom<ServerId>(
    (value) =>
      typeof value === 'string' && SERVER_IDS.some((id) => id === value)
  ),
  tags: z.array(z.enum(['english', 'native', 'alias', 'id-lookup'])),
  ask: z.string(),
  expected: z.object({
    tool: z.enum(['search_tables', 'get_table_metadata']),
    lang: z.string().optional(),
    /** Lower-case words; the search query passes when it contains one of them. */
    queryAny: z.array(z.string()).optional(),
    tableId: z.string().optional()
  })
});

export type EvalCase = z.infer<typeof caseSchema>;

const search = (lang: string, queryAny: string[]) => ({
  tool: 'search_tables' as const,
  lang,
  queryAny
});

export const CASES: readonly EvalCase[] = z.array(caseSchema).parse([
  {
    id: 'si-inflation-en',
    server: 'si',
    tags: ['english', 'alias'],
    ask: 'What is the latest inflation rate in Slovenia?',
    expected: search('en', ['inflation', 'consumer price', 'cpi'])
  },
  {
    id: 'si-salary-sl',
    server: 'si',
    tags: ['native'],
    ask: 'Kolikšna je povprečna neto plača v Sloveniji?',
    expected: search('sl', ['plač', 'plac'])
  },
  {
    id: 'no-population-en',
    server: 'no',
    tags: ['english'],
    ask: 'How many people live in Norway?',
    expected: search('en', ['population'])
  },
  {
    id: 'no-unemployment-no',
    server: 'no',
    tags: ['native'],
    ask: 'Hvor høy er arbeidsledigheten i Norge nå?',
    expected: search('no', ['arbeidsledig', 'ledighet'])
  },
  {
    id: 'ee-wages-en',
    server: 'ee',
    tags: ['english', 'alias'],
    ask: 'What is the average monthly salary in Estonia?',
    expected: search('en', ['wage', 'salar', 'earning'])
  },
  {
    id: 'ee-population-et',
    server: 'ee',
    tags: ['native'],
    ask: 'Kui palju elanikke on Eestis?',
    expected: search('et', ['rahvaarv', 'rahvastik', 'elanik'])
  },
  {
    id: 'fo-population-en',
    server: 'fo',
    tags: ['english'],
    ask: 'What is the population of the Faroe Islands?',
    expected: search('en', ['population'])
  },
  {
    id: 'fo-fish-fo',
    server: 'fo',
    tags: ['native'],
    ask: 'Hvussu nógv fiskur varð útfluttur í fjør?',
    expected: search('fo', ['fisk', 'útflut', 'utflut'])
  },
  {
    id: 'fi-unemployment-en',
    server: 'fi',
    tags: ['english'],
    ask: 'What is the unemployment rate in Finland?',
    expected: search('en', ['unemployment', 'labour force'])
  },
  {
    id: 'fi-housing-fi',
    server: 'fi',
    tags: ['native'],
    ask: 'Paljonko asuntojen hinnat ovat nousseet Helsingissä?',
    expected: search('fi', ['asun', 'hinta', 'hinn'])
  },
  {
    id: 'se-population-en',
    server: 'se',
    tags: ['english'],
    ask: 'How many people live in Stockholm?',
    expected: search('en', ['population'])
  },
  {
    id: 'se-cpi-sv',
    server: 'se',
    tags: ['native', 'alias'],
    ask: 'Hur hög är inflationen i Sverige?',
    expected: search('sv', ['inflation', 'konsumentpris', 'kpi'])
  },
  {
    id: 'dk-population-en',
    server: 'dk',
    tags: ['english'],
    ask: 'What is the population of Denmark?',
    expected: search('en', ['population'])
  },
  {
    id: 'dk-income-da',
    server: 'dk',
    tags: ['native'],
    ask: 'Hvad er den gennemsnitlige indkomst i Danmark?',
    expected: search('da', ['indkomst'])
  },
  {
    id: 'nl-population-en',
    server: 'nl',
    tags: ['english'],
    ask: 'How many people live in the Netherlands?',
    expected: search('en', ['population'])
  },
  {
    id: 'nl-houseprice-nl',
    server: 'nl',
    tags: ['native', 'alias'],
    ask: 'Hoeveel kost een gemiddeld huis in Nederland?',
    expected: search('nl', ['koopwoning', 'huizenprijs', 'woning', 'huis'])
  },
  {
    id: 'nl-id',
    server: 'nl',
    tags: ['id-lookup'],
    ask: 'Show me the variables of CBS table 83474NED.',
    expected: { tool: 'get_table_metadata', tableId: '83474NED' }
  },
  {
    id: 'eu-gdp-en',
    server: 'eu',
    tags: ['english'],
    ask: 'Compare GDP per capita across EU countries.',
    expected: search('en', ['gdp', 'gross domestic'])
  },
  {
    id: 'eu-unemployment-de',
    server: 'eu',
    tags: ['native'],
    ask: 'Wie hoch ist die Arbeitslosenquote in der EU?',
    expected: search('de', ['arbeitslos'])
  },
  {
    id: 'ca-cpi-en',
    server: 'ca',
    tags: ['english', 'alias'],
    ask: 'What is the inflation rate in Canada?',
    expected: search('en', ['consumer price', 'cpi', 'inflation'])
  },
  {
    id: 'ca-population-fr',
    server: 'ca',
    tags: ['native'],
    ask: 'Quelle est la population du Québec?',
    expected: search('fr', ['population'])
  },
  {
    id: 'is-population-en',
    server: 'is',
    tags: ['english'],
    ask: 'How many people live in Iceland?',
    expected: search('en', ['population'])
  },
  {
    id: 'is-wages-is',
    server: 'is',
    tags: ['native', 'alias'],
    ask: 'Hver eru meðallaun á Íslandi?',
    expected: search('is', ['laun'])
  },
  {
    id: 'hr-population-en',
    server: 'hr',
    tags: ['english'],
    ask: 'What is the population of Croatia?',
    expected: search('en', ['population'])
  },
  {
    id: 'hr-tourism-hr',
    server: 'hr',
    tags: ['native'],
    ask: 'Koliko je turista posjetilo Hrvatsku prošle godine?',
    expected: search('hr', ['turist', 'dolasc', 'noćenj'])
  },
  {
    id: 'ie-houseprice-en',
    server: 'ie',
    tags: ['english'],
    ask: 'How fast are house prices rising in Ireland?',
    expected: search('en', [
      'property price',
      'house price',
      'housing',
      'residential'
    ])
  },
  {
    id: 'ie-id',
    server: 'ie',
    tags: ['id-lookup'],
    ask: 'What variables does CSO table PEA01 have?',
    expected: { tool: 'get_table_metadata', tableId: 'PEA01' }
  },
  {
    id: 'au-inflation-en',
    server: 'au',
    tags: ['english', 'alias'],
    ask: 'What is the inflation rate in Australia?',
    expected: search('en', ['inflation', 'consumer price', 'cpi'])
  },
  {
    id: 'au-unemployment-en',
    server: 'au',
    tags: ['english', 'alias'],
    ask: 'What is the unemployment rate in Australia?',
    expected: search('en', ['unemployment', 'labour force'])
  },
  {
    id: 'au-id',
    server: 'au',
    tags: ['id-lookup'],
    ask: 'Show the dimensions of the ABS dataset CPI.',
    expected: { tool: 'get_table_metadata', tableId: 'CPI' }
  }
]);
