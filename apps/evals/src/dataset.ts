import { z } from 'zod';

import { PRESETS, SERVER_IDS, type ServerId } from '@/servers';

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
    /**
     * Accepted search languages, each with lower-case keywords. The query passes
     * when it contains one keyword of the language the model chose.
     */
    keywords: z.record(z.string(), z.array(z.string()).min(1)).optional(),
    tableId: z.string().optional()
  })
});

export type EvalCase = z.infer<typeof caseSchema>;

const search = (keywords: Record<string, string[]>) => ({
  tool: 'search_tables' as const,
  keywords
});

const POPULATION_EN = ['population', 'inhabitant', 'resident'];

/** Every accepted language must be one the endpoint really offers. */
const casesSchema = z.array(caseSchema).superRefine((cases, context) => {
  for (const item of cases) {
    const languages: readonly string[] = PRESETS[item.server].languages;
    for (const lang of Object.keys(item.expected.keywords ?? {})) {
      if (!languages.includes(lang)) {
        context.addIssue({
          code: 'custom',
          message: `${item.id}: ${item.server} has no language ${lang}`
        });
      }
    }
  }
});

export const CASES: readonly EvalCase[] = casesSchema.parse([
  {
    id: 'si-inflation-en',
    server: 'si',
    tags: ['english', 'alias'],
    ask: 'What is the latest inflation rate in Slovenia?',
    expected: search({
      en: ['inflation', 'consumer price', 'cpi'],
      sl: ['inflacij', 'cene', 'indeks cen', 'življenjskih', 'zivljenjskih']
    })
  },
  {
    id: 'si-salary-sl',
    server: 'si',
    tags: ['native'],
    ask: 'Kolikšna je povprečna neto plača v Sloveniji?',
    expected: search({ sl: ['plač', 'plac'], en: ['earning', 'wage', 'salar'] })
  },
  {
    id: 'no-population-en',
    server: 'no',
    tags: ['english'],
    ask: 'How many people live in Norway?',
    expected: search({ en: POPULATION_EN, no: ['befolkning', 'folketall'] })
  },
  {
    id: 'no-unemployment-no',
    server: 'no',
    tags: ['native'],
    ask: 'Hvor høy er arbeidsledigheten i Norge nå?',
    expected: search({
      no: ['arbeidsledig', 'ledighet'],
      en: ['unemploy', 'labour force']
    })
  },
  {
    id: 'ee-wages-en',
    server: 'ee',
    tags: ['english', 'alias'],
    ask: 'What is the average monthly salary in Estonia?',
    expected: search({
      en: ['wage', 'salar', 'earning'],
      et: ['palk', 'brutokuupalk']
    })
  },
  {
    id: 'ee-population-et',
    server: 'ee',
    tags: ['native'],
    ask: 'Kui palju elanikke on Eestis?',
    expected: search({
      et: ['rahvaarv', 'rahvastik', 'elanik'],
      en: POPULATION_EN
    })
  },
  {
    id: 'fo-population-en',
    server: 'fo',
    tags: ['english'],
    ask: 'What is the population of the Faroe Islands?',
    expected: search({
      en: POPULATION_EN,
      fo: ['fólkatal', 'folkatal', 'íbúgv']
    })
  },
  {
    id: 'fo-fish-fo',
    server: 'fo',
    tags: ['native'],
    ask: 'Hvussu nógv fiskur varð útfluttur í fjør?',
    expected: search({
      fo: ['fisk', 'útflut', 'utflut'],
      en: ['fish', 'export']
    })
  },
  {
    id: 'fi-unemployment-en',
    server: 'fi',
    tags: ['english'],
    ask: 'What is the unemployment rate in Finland?',
    expected: search({
      en: ['unemploy', 'labour force'],
      fi: ['työttöm', 'tyottom', 'työvoima', 'tyovoima']
    })
  },
  {
    id: 'fi-housing-fi',
    server: 'fi',
    tags: ['native'],
    ask: 'Paljonko asuntojen hinnat ovat nousseet Helsingissä?',
    expected: search({
      fi: ['asun', 'osake'],
      en: ['dwelling', 'housing', 'house price']
    })
  },
  {
    id: 'se-population-en',
    server: 'se',
    tags: ['english'],
    ask: 'How many people live in Stockholm?',
    expected: search({ en: POPULATION_EN, sv: ['folkmängd', 'befolkning'] })
  },
  {
    id: 'se-cpi-sv',
    server: 'se',
    tags: ['native', 'alias'],
    ask: 'Hur hög är inflationen i Sverige?',
    expected: search({
      sv: ['inflation', 'konsumentpris', 'kpi'],
      en: ['inflation', 'consumer price', 'cpi']
    })
  },
  {
    id: 'dk-population-en',
    server: 'dk',
    tags: ['english'],
    ask: 'What is the population of Denmark?',
    expected: search({ en: POPULATION_EN, da: ['befolkning', 'folketal'] })
  },
  {
    id: 'dk-income-da',
    server: 'dk',
    tags: ['native'],
    ask: 'Hvad er den gennemsnitlige indkomst i Danmark?',
    expected: search({ da: ['indkomst'], en: ['income'] })
  },
  {
    id: 'nl-population-en',
    server: 'nl',
    tags: ['english'],
    ask: 'How many people live in the Netherlands?',
    expected: search({ en: POPULATION_EN, nl: ['bevolking', 'inwoners'] })
  },
  {
    id: 'nl-houseprice-nl',
    server: 'nl',
    tags: ['native', 'alias'],
    ask: 'Hoeveel kost een gemiddeld huis in Nederland?',
    expected: search({
      nl: ['koopwoning', 'huizenprijs', 'woning', 'huisprijs'],
      en: ['dwelling', 'house price', 'housing', 'home price']
    })
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
    expected: search({ en: ['gdp', 'gross domestic'] })
  },
  {
    id: 'eu-unemployment-de',
    server: 'eu',
    tags: ['native'],
    ask: 'Wie hoch ist die Arbeitslosenquote in der EU?',
    expected: search({ de: ['arbeitslos'], en: ['unemploy'] })
  },
  {
    id: 'ca-cpi-en',
    server: 'ca',
    tags: ['english', 'alias'],
    ask: 'What is the inflation rate in Canada?',
    expected: search({ en: ['consumer price', 'cpi', 'inflation'] })
  },
  {
    id: 'ca-population-fr',
    server: 'ca',
    tags: ['native'],
    ask: 'Quelle est la population du Québec?',
    expected: search({ fr: ['population'], en: POPULATION_EN })
  },
  {
    id: 'is-population-en',
    server: 'is',
    tags: ['english'],
    ask: 'How many people live in Iceland?',
    expected: search({ en: POPULATION_EN, is: ['mannfjöld', 'íbú', 'ibu'] })
  },
  {
    id: 'is-wages-is',
    server: 'is',
    tags: ['native', 'alias'],
    ask: 'Hver eru meðallaun á Íslandi?',
    expected: search({ is: ['laun'], en: ['wage', 'earning', 'salar'] })
  },
  {
    id: 'hr-population-en',
    server: 'hr',
    tags: ['english'],
    ask: 'What is the population of Croatia?',
    expected: search({ en: POPULATION_EN, hr: ['stanovni', 'popis'] })
  },
  {
    id: 'hr-tourism-hr',
    server: 'hr',
    tags: ['native'],
    ask: 'Koliko je turista posjetilo Hrvatsku prošle godine?',
    expected: search({
      hr: ['turist', 'dolasc', 'noćenj', 'nocenj'],
      en: ['touris', 'arrival', 'overnight']
    })
  },
  {
    id: 'ie-houseprice-en',
    server: 'ie',
    tags: ['english'],
    ask: 'How fast are house prices rising in Ireland?',
    expected: search({
      en: ['property price', 'house price', 'housing', 'residential']
    })
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
    expected: search({ en: ['inflation', 'consumer price', 'cpi'] })
  },
  {
    id: 'au-unemployment-en',
    server: 'au',
    tags: ['english', 'alias'],
    ask: 'What is the unemployment rate in Australia?',
    expected: search({ en: ['unemploy', 'labour force'] })
  },
  {
    id: 'au-id',
    server: 'au',
    tags: ['id-lookup'],
    ask: 'Show the dimensions of the ABS dataset CPI.',
    expected: { tool: 'get_table_metadata', tableId: 'CPI' }
  }
]);
