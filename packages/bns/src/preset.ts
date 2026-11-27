import type { PxwebPreset } from '@statsmcp/core';

// The National Bureau of Statistics publishes under CC BY 4.0: https://statistica.gov.md/en/copyright-139.html
const TERMS = 'https://statistica.gov.md/en/copyright-139.html';
const ATTRIBUTION = {
  ro: `Sursa: Biroul Național de Statistică al Republicii Moldova, CC BY 4.0 (${TERMS})`,
  en: `Source: National Bureau of Statistics of the Republic of Moldova, CC BY 4.0 (${TERMS})`
} as const;

export const bnsPreset: PxwebPreset = {
  name: 'bns',
  title:
    'StatBank of the National Bureau of Statistics of the Republic of Moldova (official statistics)',
  version: '0.5.0',
  apiBaseUrl: 'https://statbank.statistica.md/PxWeb/api/v1',
  database: [
    '10 Mediul inconjurator',
    '20 Populatia si procesele demografice',
    '30 Statistica sociala',
    '40 Statistica economica',
    '50 Statistica gender',
    '60 Statistica regionala'
  ],
  // One search would call six databases, more than the API's 10 calls per 10 s.
  search: 'index',
  languages: ['ro', 'en'],
  attribution: (lang) => (lang === 'ro' ? ATTRIBUTION.ro : ATTRIBUTION.en),
  tableUrl: (lang, tableId) => {
    const pageLang = lang === 'ro' ? 'ro' : 'en';
    const [database = '', ...rest] = tableId.split('/').map(encodeURIComponent);
    const file = rest.pop() ?? '';
    const folder = [database, ...rest].join('__');
    return `https://statbank.statistica.md/PxWeb/pxweb/${pageLang}/${database}/${folder}/${file}/`;
  },
  instructions: `Official statistics for Moldova from the StatBank of the National Bureau of Statistics (NBS). This server is not affiliated with or endorsed by the NBS.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in English ("en") or Romanian ("ro"). Some tables are split by period, with an older table and a newer one for the latest years. Compare the periods in the titles and use the table that covers the period you need. A few tables exist only in Romanian.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Use \`valueFilter\` to find a district by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods.

The StatBank allows about 10 API calls per 10 seconds. Always cite the source line that each result ends with, with the table link. If you change the data or calculate new figures, say so, for example "Own calculations based on data of the National Bureau of Statistics of the Republic of Moldova".`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [{ terms: ['inflation', 'consumer prices'], query: 'CPI' }],
    ro: [
      {
        terms: ['inflatia', 'inflație', 'preturi', 'prețuri'],
        query: 'IPC'
      }
    ]
  }
};
