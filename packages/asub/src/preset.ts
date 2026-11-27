import type { PxwebPreset } from '@statsmcp/core';

// ÅSUB publishes its material under CC BY 4.0: https://www.asub.ax/sv/om-asub/om-asubax/anvandarvillkor
const TERMS = 'https://www.asub.ax/sv/om-asub/om-asubax/anvandarvillkor';
const ATTRIBUTION = {
  sv: `Källa: ÅSUB, CC BY 4.0 (${TERMS})`,
  en: `Source: Statistics and Research Åland (ÅSUB), CC BY 4.0 (${TERMS})`
} as const;

export const asubPreset: PxwebPreset = {
  name: 'asub',
  title:
    'PxWeb database of Statistics and Research Åland (ÅSUB official statistics)',
  version: '0.5.0',
  apiBaseUrl: 'https://pxweb.asub.ax/PXWeb/api/v1',
  database: 'Statistik',
  languages: ['sv', 'en'],
  attribution: (lang) => (lang === 'sv' ? ATTRIBUTION.sv : ATTRIBUTION.en),
  tableUrl: (lang, tableId) => {
    const pageLang = lang === 'sv' ? 'sv' : 'en';
    const segments = tableId.split('/').map(encodeURIComponent);
    const file = segments.pop() ?? tableId;
    const folder = ['Statistik', ...segments].join('__');
    return `https://pxweb.asub.ax/PXWeb/pxweb/${pageLang}/Statistik/${folder}/${file}/`;
  },
  // Discontinued tables move to folders named "Avslutade" (ended).
  isArchived: (hit) =>
    hit.path?.split('/').some((segment) => segment.startsWith('Avslutade')) ??
    false,
  instructions: `Official statistics for the Åland Islands from the PxWeb database of Statistics and Research Åland (ÅSUB). This server is not affiliated with or endorsed by ÅSUB.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in Swedish ("sv") or English ("en"). Swedish words find more tables, for example "befolkning" or "konsumentprisindex". Results marked "archived" are discontinued tables; prefer current tables.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Use \`valueFilter\` to find a municipality by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods.

ÅSUB allows about 10 API calls per 10 seconds. Always cite the source line that each result ends with. If you change the data or calculate new figures, say so, for example "ÅSUB and own calculations".`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['inflation', 'consumer prices'],
        query: 'consumer price index'
      },
      {
        terms: ['housing price', 'house price', 'home price'],
        query: 'purchases of dwellings'
      }
    ],
    sv: [
      { terms: ['inflation', 'priser'], query: 'konsumentprisindex' },
      { terms: ['bostadspris', 'huspris'], query: 'aktiebostadsöverlåtelser' }
    ]
  }
};
