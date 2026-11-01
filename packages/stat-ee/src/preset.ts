import type { PxwebPreset } from '@statsmcp/core';

// Statistics Estonia shares its open data under CC BY-SA 4.0 (footer of andmed.stat.ee).
const LICENCE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const ATTRIBUTION = {
  et: `Allikas: Statistikaamet, CC BY-SA 4.0 (${LICENCE_URL})`,
  en: `Source: Statistics Estonia, CC BY-SA 4.0 (${LICENCE_URL})`
} as const;

export const statEePreset: PxwebPreset = {
  name: 'stat-ee',
  title: 'Statistics Estonia database (official statistics of Estonia)',
  version: '0.4.1',
  apiBaseUrl: 'https://andmed.stat.ee/api/v1',
  database: 'stat',
  languages: ['et', 'en'],
  attribution: (lang) => (lang === 'et' ? ATTRIBUTION.et : ATTRIBUTION.en),
  tableUrl: (lang, tableId) => {
    const pageLang = lang === 'et' ? 'et' : 'en';
    const table = tableId.replace(/\.px$/i, '');
    return `https://andmed.stat.ee/${pageLang}/stat/${table}`;
  },
  tableIdFromHit: (hit) => hit.id,
  isArchived: (hit) => hit.path?.startsWith('/Lepetatud_tabelid/') ?? false,
  instructions: `Official statistics for Estonia from the database of Statistics Estonia (Statistikaamet). This server is not affiliated with or endorsed by Statistics Estonia.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in Estonian ("et") or English ("en"). Results marked "archived" are closed tables. Prefer current tables, but archived tables can still be queried for older periods.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Use \`valueFilter\` to find a county, municipality or activity by name.
3. Call \`query_table\` with only the values you need. Many monthly and quarterly tables keep the year and the month or quarter in two variables; select both, for example the latest year and its months.

Always cite the source line that each result ends with. The data is under CC BY-SA 4.0: if you change the data or calculate new figures, say so and share them under the same licence.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['salary', 'salaries', 'wage'],
        query: 'average monthly gross wages'
      },
      { terms: ['inflation'], query: 'consumer price index' },
      {
        terms: ['housing price', 'house price', 'home price', 'property price'],
        query: 'dwelling price index'
      }
    ],
    et: [
      { terms: ['inflatsioon', 'hinnatõus'], query: 'tarbijahinnaindeks' },
      { terms: ['keskmine palk', 'palgad'], query: 'keskmine brutokuupalk' },
      {
        terms: ['eluaseme hind', 'korteri hind', 'kinnisvara hind'],
        query: 'eluaseme hinnaindeks'
      }
    ]
  }
};
