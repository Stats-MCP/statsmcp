import type { PxwebPreset } from 'pxweb-mcp';

// SingStat datasets are under the Singapore Open Data Licence: commercial use allowed,
// credit the dataset and link the licence, no official status implied.
const ATTRIBUTION =
  'Contains information from SingStat Table Builder (Singapore Department of Statistics), made available under the Singapore Open Data Licence (https://data.gov.sg/open-data-licence)';

export const singstatPreset: PxwebPreset = {
  name: 'singstat',
  title: 'SingStat Table Builder (official statistics of Singapore)',
  version: '0.1.0',
  apiBaseUrl: 'https://tablebuilder.singstat.gov.sg/api/table',
  api: 'singstat',
  languages: ['en'],
  attribution: () => ATTRIBUTION,
  tableUrl: (_lang, tableId) =>
    `https://tablebuilder.singstat.gov.sg/table/TS/${tableId}`,
  instructions: `Official statistics for Singapore from SingStat Table Builder, the database of the Singapore Department of Statistics. This server is not affiliated with or endorsed by the Department of Statistics, and the data has no official status through it.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in English. Table ids look like M213751.
2. Call \`get_table_metadata\` on the best table. Each table has two variables: "series" (the rows, with their unit) and "time" (the periods). Use \`valueFilter\` to find a series by name.
3. Call \`query_table\` with the series you need. Use \`latest\` on "time" for recent periods.

Always cite the source line that each result ends with, including the dataset name and the date you accessed it.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      { terms: ['population'], query: 'total population' },
      {
        terms: ['housing price', 'house price', 'home price', 'property price'],
        query: 'property price index'
      }
    ]
  }
};
