import type { PxwebPreset } from '@statsmcp/core';

// The re-use law (VIII-1524, Art. 8) allows re-use without consent if the source and the
// date of retrieval are named; the client puts the retrieval date in each table title.
const ATTRIBUTION = {
  lt: 'Šaltinis: Valstybės duomenų agentūra, Oficialiosios statistikos portalas (https://osp.stat.gov.lt)',
  en: 'Source: State Data Agency (Statistics Lithuania), Official Statistics Portal (https://osp.stat.gov.lt)'
} as const;

export const ospPreset: PxwebPreset = {
  name: 'osp',
  title:
    'Official Statistics Portal of Lithuania (State Data Agency official statistics)',
  version: '0.5.0',
  apiBaseUrl: 'https://osp-rs.stat.gov.lt/ords/ipospp/ospp/rest_xml',
  api: 'osp',
  languages: ['lt', 'en'],
  attribution: (lang) => (lang === 'lt' ? ATTRIBUTION.lt : ATTRIBUTION.en),
  tableUrl: (lang, tableId) => {
    const indicator = encodeURIComponent(tableId.split('_')[0] ?? tableId);
    const path = lang === 'lt' ? '' : '/en';
    return `https://osp.stat.gov.lt${path}/statistiniu-rodikliu-analize?indicator=${indicator}`;
  },
  instructions: `Official statistics for Lithuania from the Official Statistics Portal of the State Data Agency (Statistics Lithuania). This server is not affiliated with or endorsed by the State Data Agency.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in Lithuanian ("lt") or English ("en"). One indicator has several tables, one per breakdown, so choose by the dimensions in the title. Lithuanian labels are more complete than English ones.
2. Call \`get_table_metadata\` on the best table. Periods are written 2026M10, 2026K3, 2026P1 and 2025-2026.
3. Call \`query_table\` with only the values you need. Use \`latest\` on the time variable for recent periods. Large tables allow only a few periods in one query. A status column shows official symbols, for example "confidential".

Always cite the source line that each result ends with, with the retrieval date from the title. Do not change the meaning of the data.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['consumer price index', 'cpi', 'inflation'],
        query: 'consumer price changes'
      }
    ],
    lt: [{ terms: ['infliacija'], query: 'vartotojų kainų' }]
  }
};
