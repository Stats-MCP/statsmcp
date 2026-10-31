import type { PxwebPreset } from 'pxweb-mcp';

const TABLE_NUMBER = /^(\d{5}):/;

// Statistics Norway publishes under CC BY 4.0 and asks to be named as the
// source: https://www.ssb.no/en/diverse/lisens
const ATTRIBUTION = {
  no: 'Kilde: Statistisk sentralbyrå (SSB), CC BY 4.0 (https://www.ssb.no/diverse/lisens)',
  en: 'Source: Statistics Norway (SSB), CC BY 4.0 (https://www.ssb.no/en/diverse/lisens)'
} as const;

export const ssbPreset: PxwebPreset = {
  name: 'ssb',
  title: 'Statbank Norway (Statistics Norway official statistics)',
  version: '0.1.0',
  apiBaseUrl: 'https://data.ssb.no/api/v0',
  database: 'table',
  languages: ['no', 'en'],
  attribution: (lang) => (lang === 'no' ? ATTRIBUTION.no : ATTRIBUTION.en),
  tableUrl: (lang, tableId) => {
    const prefix = lang === 'no' ? '' : 'en/';
    const number = tableId.split('/').at(-1) ?? '';
    if (!/^\d{5}$/.test(number)) return `https://www.ssb.no/${prefix}statbank`;
    return `https://www.ssb.no/${prefix}statbank/table/${number}`;
  },
  tableIdFromHit: (hit) => TABLE_NUMBER.exec(hit.title)?.[1] ?? '',
  instructions: `Official statistics for Norway from Statbank, the database of Statistics Norway (SSB). This server is not affiliated with or endorsed by SSB.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords. Norwegian titles ("no") are the most complete; try "en" if the user writes in English, and try the other language when results are poor. Table ids are five-digit table numbers.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Use \`valueFilter\` to find a municipality, county or industry by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods.

SSB allows about 40 API calls per minute, so avoid unnecessary calls. Always cite the source line that each result ends with. If you calculate new figures from the data, say they are your own calculation based on SSB data.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      { terms: ['salary', 'salaries', 'wage'], query: 'earnings' },
      {
        terms: ['housing price', 'house price', 'home price', 'property price'],
        query: 'price for existing dwellings'
      }
    ],
    no: [
      {
        terms: ['boligpris', 'huspris'],
        query: 'prisindeks for brukte boliger'
      }
    ]
  }
};
