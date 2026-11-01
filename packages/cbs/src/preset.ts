import type { PxwebPreset } from 'pxweb-mcp';

// CBS publishes under CC BY 4.0 and asks to be cited as the source:
// https://www.cbs.nl/en-gb/about-us/website/copyright
const LICENCE = 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)';
const ATTRIBUTION = {
  nl: `Bron: CBS, ${LICENCE}`,
  en: `Source: Statistics Netherlands (CBS), ${LICENCE}`
} as const;

export const cbsPreset: PxwebPreset = {
  name: 'cbs',
  title: 'StatLine (Statistics Netherlands official statistics)',
  version: '0.2.0',
  apiBaseUrl: 'https://opendata.cbs.nl',
  api: 'cbs-odata',
  languages: ['nl', 'en'],
  attribution: (lang) => (lang === 'nl' ? ATTRIBUTION.nl : ATTRIBUTION.en),
  tableUrl: (lang, tableId) =>
    lang === 'nl'
      ? `https://www.cbs.nl/nl-nl/cijfers/detail/${tableId}`
      : `https://www.cbs.nl/en-gb/figures/detail/${tableId}`,
  instructions: `Official statistics for the Netherlands from StatLine, the database of Statistics Netherlands (CBS). This server is not affiliated with or endorsed by CBS.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in Dutch ("nl") or English ("en"). Dutch and English tables have different ids (86141NED, 86141ENG), and there are more Dutch tables. Results marked "archived" are discontinued tables; prefer current tables.
2. Call \`get_table_metadata\` on the best table. The measures of a table are the values of the "Topics" variable; select only the ones you need. Use \`valueFilter\` to find a municipality or region by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods.

Always cite the source line that each result ends with. If you calculate new figures, say they are your own calculation based on CBS data.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['inflation', 'consumer price index'],
        query: 'consumer prices CPI'
      },
      { terms: ['salary', 'salaries', 'earnings'], query: 'wages' },
      {
        terms: ['housing price', 'house price', 'home price', 'property price'],
        query: 'existing own homes'
      }
    ],
    nl: [
      { terms: ['inflatie', 'prijsstijging'], query: 'consumentenprijzen CPI' },
      { terms: ['salaris', 'loon'], query: 'lonen' },
      {
        terms: ['huizenprijs', 'huizenprijzen', 'woningprijs', 'huisprijs'],
        query: 'bestaande koopwoningen'
      }
    ]
  }
};
