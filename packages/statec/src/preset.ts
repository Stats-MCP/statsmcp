import type { PxwebPreset } from '@statsmcp/core';

// STATEC publishes LUSTAT data under CC0 1.0 and asks reusers to keep the links to
// CC0 and to its usage guidelines: https://statistiques.public.lu/en/support/notice.html
const TERMS = 'https://statistiques.public.lu/en/support/notice.html';
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
const ATTRIBUTION = {
  fr: `Source : STATEC (Luxembourg), CC0 1.0 (${CC0}), conditions d'utilisation : ${TERMS}`,
  en: `Source: STATEC (Luxembourg), CC0 1.0 (${CC0}), terms of use: ${TERMS}`
} as const;

export const statecPreset: PxwebPreset = {
  name: 'statec',
  title:
    'LUSTAT, the statistics portal of STATEC Luxembourg (official statistics)',
  version: '0.4.1',
  apiBaseUrl: 'https://lustat.statec.lu/rest',
  api: 'sdmx',
  sdmxAgency: 'LU1',
  languages: ['en', 'fr'],
  attribution: (lang) => (lang === 'fr' ? ATTRIBUTION.fr : ATTRIBUTION.en),
  tableUrl: (lang, tableId) =>
    `https://lustat.statec.lu/vis?df[ds]=ds-release&df[id]=${encodeURIComponent(tableId)}&df[ag]=LU1&lc=${lang === 'fr' ? 'fr' : 'en'}`,
  instructions: `Official statistics for Luxembourg from LUSTAT, the statistics portal of STATEC. This server is not affiliated with or endorsed by STATEC.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in English ("en") or French ("fr"), for example "consumer price index" or "unemployment". Prefer the ECOICOP v.2 price tables; the v.1 tables end in 2025.
2. Call \`get_table_metadata\` on the best table. Value codes are short codes, so read their labels. Use \`valueFilter\` to find a municipality or an item by name. If the table has a FREQ variable, select only one frequency.
3. Call \`query_table\` with only the values you need. Use \`latest\` on TIME_PERIOD for recent periods.

Always cite the source line that each result ends with, with its links. If you change the data or calculate new figures, say so, for example "STATEC and own calculations".`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['inflation', 'consumer prices', 'cpi'],
        query: 'National consumer price index (NCPI), ECOICOP v.2'
      },
      { terms: ['jobless'], query: 'unemployment rate per month' },
      {
        terms: ['population', 'inhabitants'],
        query: 'Population by sex and nationality on 1st January'
      }
    ],
    fr: [
      {
        terms: ['inflation', 'prix à la consommation'],
        query: 'Indice des prix à la consommation national (IPCN), ECOICOP v.2'
      },
      { terms: ['chômage'], query: 'taux de chômage' },
      {
        terms: ['population', 'habitants'],
        query: 'Population par sexe et par nationalité au 1er janvier'
      }
    ]
  }
};
