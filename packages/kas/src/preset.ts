import type { PxwebPreset } from '@statsmcp/core';

// KAS has no terms page for ASKdata; its publications state "Reuse is authorised provided
// the source is acknowledged." (for example the 2024 population estimate).
const SITE = 'https://ask.rks-gov.net';
const ATTRIBUTION = {
  sq: `Burimi: Agjencia e Statistikave të Kosovës (ASK), ${SITE}`,
  en: `Source: Kosovo Agency of Statistics (KAS), ${SITE}`
} as const;

export const kasPreset: PxwebPreset = {
  name: 'kas',
  title:
    'ASKdata, the database of the Kosovo Agency of Statistics (official statistics)',
  version: '0.6.0',
  apiBaseUrl: 'https://askdata.rks-gov.net/api/v1',
  database: 'ASKdata',
  languages: ['sq', 'en'],
  attribution: (lang) => (lang === 'sq' ? ATTRIBUTION.sq : ATTRIBUTION.en),
  tableUrl: (lang, tableId) => {
    const pageLang = lang === 'sq' ? 'sq' : 'en';
    const segments = tableId.split('/').map(encodeURIComponent);
    const file = segments.pop() ?? tableId;
    const folder = ['ASKdata', ...segments].join('__');
    return `https://askdata.rks-gov.net/pxweb/${pageLang}/ASKdata/${folder}/${file}/`;
  },
  instructions: `Official statistics for Kosovo from ASKdata, the database of the Kosovo Agency of Statistics (KAS). This server is not affiliated with or endorsed by KAS.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in English ("en") or Albanian ("sq"). Search titles can show an older period range than the table has, so check the periods with \`get_table_metadata\`.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Variable codes are in Albanian, also in English; copy them exactly. Use \`valueFilter\` to find a municipality by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods.

Always cite the source line that each result ends with. If you change the data or calculate new figures, say so, for example "Kosovo Agency of Statistics and own calculations".`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['inflation', 'consumer prices'],
        query: 'consumer price index'
      },
      {
        terms: ['population', 'inhabitants'],
        query: 'total estimated kosovo population'
      }
    ],
    sq: [
      { terms: ['inflacioni', 'çmimet'], query: 'IHÇK' },
      {
        terms: ['popullsia', 'banorë'],
        query: 'gjithsej popullsia e vlerësuar'
      }
    ]
  }
};
