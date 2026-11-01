import type { PxwebPreset } from 'pxweb-mcp';

// Statistics Faroe Islands publishes under CC BY 4.0: https://hagstova.fo/en/terms-use
const ATTRIBUTION = {
  fo: 'Kelda: Hagstova Føroya, CC BY 4.0 (https://hagstova.fo/en/terms-use)',
  en: 'Source: Statistics Faroe Islands, CC BY 4.0 (https://hagstova.fo/en/terms-use)'
} as const;

const DISCONTINUED = /\s-\s*(?:discontinued|endað)\s*$/i;

export const hagstovaPreset: PxwebPreset = {
  name: 'hagstova',
  title: 'StatBank of Statistics Faroe Islands (official statistics)',
  version: '0.3.0',
  apiBaseUrl: 'https://statbank.hagstova.fo/api/v1',
  database: 'H2',
  languages: ['fo', 'en'],
  attribution: (lang) => (lang === 'fo' ? ATTRIBUTION.fo : ATTRIBUTION.en),
  tableUrl: (lang, tableId) => {
    const pageLang = lang === 'fo' ? 'fo' : 'en';
    const segments = tableId.split('/');
    const file = segments.pop() ?? tableId;
    const folder = ['H2', ...segments].join('__');
    return `https://statbank.hagstova.fo/pxweb/${pageLang}/H2/${folder}/${file}/`;
  },
  isArchived: (hit) => DISCONTINUED.test(hit.title),
  instructions: `Official statistics for the Faroe Islands from the StatBank of Statistics Faroe Islands (Hagstova Føroya). This server is not affiliated with or endorsed by Statistics Faroe Islands.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords. English ("en") search is the most reliable; Faroese ("fo") search matches whole words only. Results marked "archived" are discontinued tables; prefer current tables.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Use \`valueFilter\` to find a municipality or island by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods.

Always cite the source line that each result ends with. If you change the data or calculate new figures, say so, for example "Statistics Faroe Islands and own calculations".`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['housing price', 'home price', 'property price'],
        query: 'house prices'
      }
    ],
    fo: [
      {
        terms: ['inflatión', 'prísvøkstur', 'prísir'],
        query: 'brúkaraprístalið'
      }
    ]
  }
};
