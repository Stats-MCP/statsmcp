import type { PxwebPreset } from '@statsmcp/core';

// IBGE data is federal open data: free use limited to crediting the source
// (Decreto 8.777/2016, Art. 2 III and Art. 4). The decree's site blocks automated
// clients, so the credit carries no link; every result links its SIDRA table.
const ATTRIBUTION = {
  pt: 'Fonte: IBGE',
  en: 'Source: IBGE, Brazilian Institute of Geography and Statistics'
} as const;

export const ibgePreset: PxwebPreset = {
  name: 'ibge',
  title: 'SIDRA, the aggregate tables of IBGE (official statistics of Brazil)',
  version: '0.7.0',
  apiBaseUrl: 'https://servicodados.ibge.gov.br/api/v3/agregados',
  api: 'ibge',
  languages: ['pt'],
  attribution: (lang) => (lang === 'pt' ? ATTRIBUTION.pt : ATTRIBUTION.en),
  tableUrl: (_lang, tableId) =>
    `https://sidra.ibge.gov.br/tabela/${encodeURIComponent(tableId)}`,
  instructions: `Official statistics for Brazil from SIDRA, the aggregate tables of IBGE. This server is not affiliated with or endorsed by IBGE.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in Portuguese ("pt"), for example "IPCA", "taxas de desocupação e de subutilização" or "população residente estimada". Table ids are SIDRA table numbers, for example 1737 for the IPCA. Results marked "archived" are discontinued series.
2. Call \`get_table_metadata\` on the best table. The variable "variavel" lists the measures; variables named "Coeficiente de variação" are sampling errors, not data. Localities have codes such as N1:1 (Brasil), N3:35 (a state) and N6:3550308 (a municipality); use \`valueFilter\` to find a municipality by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` on "periodo" for recent periods. A left-out locality gives Brasil; a left-out optional classification gives its total.

Always cite the source line that each result ends with.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    pt: [
      {
        terms: ['inflação', 'inflacao', 'preços ao consumidor'],
        query: 'IPCA'
      },
      {
        terms: ['desemprego'],
        query: 'taxas de desocupação e de subutilização'
      },
      {
        terms: ['população', 'populacao', 'habitantes'],
        query: 'população residente estimada'
      }
    ]
  }
};
