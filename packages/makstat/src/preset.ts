import type { PxwebPreset } from '@statsmcp/core';

// The State Statistical Office allows free use of MakStat data with the source:
// https://www.stat.mk/en/about-us/policies-and-strategies/open-data/
const TERMS =
  'https://www.stat.mk/en/about-us/policies-and-strategies/open-data/';
const ATTRIBUTION = {
  mk: `Извор: Државен завод за статистика (${TERMS})`,
  en: `Source: State Statistical Office of the Republic of North Macedonia (${TERMS})`
} as const;

// Archived series sit in folders named "…Arhiva…" or have "_arh" in the file name.
const ARCHIVED_FOLDER = /arhiv/i;
const ARCHIVED_FILE = /_arh[_.]/i;

export const makstatPreset: PxwebPreset = {
  name: 'makstat',
  title:
    'MakStat database of the State Statistical Office of North Macedonia (official statistics)',
  version: '0.5.0',
  apiBaseUrl: 'https://makstat.stat.gov.mk/PXWeb/api/v1',
  database: 'MakStat',
  // Some tables do not flag their period variable as time.
  timeVariables: ['Месец', 'Година', 'Тримесечје'],
  languages: ['mk', 'en'],
  attribution: (lang) => (lang === 'mk' ? ATTRIBUTION.mk : ATTRIBUTION.en),
  tableUrl: (lang, tableId) => {
    const pageLang = lang === 'mk' ? 'mk' : 'en';
    const segments = tableId.split('/').map(encodeURIComponent);
    const file = segments.pop() ?? tableId;
    const folder = ['MakStat', ...segments].join('__');
    return `https://makstat.stat.gov.mk/PXWeb/pxweb/${pageLang}/MakStat/${folder}/${file}/`;
  },
  isArchived: (hit) =>
    ARCHIVED_FOLDER.test(hit.path ?? '') || ARCHIVED_FILE.test(hit.id),
  instructions: `Official statistics for North Macedonia from MakStat, the database of the State Statistical Office. This server is not affiliated with or endorsed by the State Statistical Office.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in English ("en") or Macedonian ("mk"). Some tables have a different id in each language, so use a table id only in the language that returned it. Results marked "archived" are old series; prefer current tables.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Variable codes are in Cyrillic; copy them exactly. Use \`valueFilter\` to find a municipality or region by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods.

MakStat allows about 10 API calls per 10 seconds. Always cite the source line that each result ends with. If you change the data or calculate new figures, say so, for example "State Statistical Office and own calculations".`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['inflation', 'consumer prices'],
        query: 'consumer price index'
      },
      {
        terms: ['salary', 'salaries', 'wage', 'wages'],
        query: 'average monthly net wage'
      },
      {
        terms: ['housing price', 'house price', 'home price', 'property price'],
        query: 'prices of residential dwellings'
      }
    ],
    mk: [
      { terms: ['инфлација'], query: 'индекси на трошоците на животот' },
      { terms: ['плата', 'плати'], query: 'просечна месечна нето плата' }
    ]
  }
};
