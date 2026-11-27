import type { PxwebPreset } from '@statsmcp/core';

// Statistics Portugal allows reuse under CC BY 4.0 with the source, the information and its
// reference period, and a note when the data was changed: https://www.ine.pt/xportal/xmain?xpid=INE&xpgid=ine_cont_inst&INST=3585857&xlang=en
const TERMS =
  'https://www.ine.pt/xportal/xmain?xpid=INE&xpgid=ine_cont_inst&INST=3585857&xlang=en';
const ATTRIBUTION = {
  pt: `Fonte: Instituto Nacional de Estatística – Portugal, CC BY 4.0 (${TERMS})`,
  en: `Source: Instituto Nacional de Estatística – Portugal (Statistics Portugal), CC BY 4.0 (${TERMS})`
} as const;

export const inePtPreset: PxwebPreset = {
  name: 'ine-pt',
  title: 'Statistics Portugal (INE) database (official statistics)',
  version: '0.5.0',
  apiBaseUrl: 'https://www.ine.pt/ine',
  api: 'ine-pt',
  languages: ['pt', 'en'],
  attribution: (lang) => (lang === 'pt' ? ATTRIBUTION.pt : ATTRIBUTION.en),
  tableUrl: (lang, tableId) =>
    `https://www.ine.pt/xportal/xmain?xpid=INE&xpgid=ine_indicadores&indOcorrCod=${encodeURIComponent(tableId)}&contexto=bd&selTab=tab2&xlang=${lang === 'pt' ? 'pt' : 'en'}`,
  instructions: `Official statistics for Portugal from the database of Statistics Portugal (Instituto Nacional de Estatística, INE). This server is not affiliated with or endorsed by Statistics Portugal.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in Portuguese ("pt") or English ("en"). Each indicator has a seven-digit id, for example 0008074.
2. Call \`get_table_metadata\` on the best indicator to see its dimensions and value codes. Dim1 is the period and Dim2 is the geography. Use \`valueFilter\` to find a region or municipality by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` on Dim1 for recent periods. Dimensions that you leave out return all their values.

Always cite the source line that each result ends with, the indicator and the reference period. If you change the data or calculate new figures, say so explicitly.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['house price', 'housing price', 'home price', 'property price'],
        query: 'Housing price index (Base - 2025)'
      }
    ],
    pt: [
      {
        terms: [
          'inflação',
          'inflacao',
          'preços no consumidor',
          'precos no consumidor'
        ],
        query: 'Índice de preços no consumidor'
      }
    ]
  }
};
