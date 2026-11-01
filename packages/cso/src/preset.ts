import type { PxwebPreset } from '@statsmcp/core';

// The Central Statistics Office publishes its statistics under CC BY 4.0:
// https://www.cso.ie/en/aboutus/whoweare/copyrightpolicy/
const ATTRIBUTION =
  'Source: Central Statistics Office, Ireland, CC BY 4.0 (https://www.cso.ie/en/aboutus/whoweare/copyrightpolicy/)';

export const csoPreset: PxwebPreset = {
  name: 'cso',
  title:
    'PxStat database of the Central Statistics Office, Ireland (official statistics)',
  version: '0.4.1',
  apiBaseUrl: 'https://ws.cso.ie/public',
  api: 'cso-pxstat',
  languages: ['en'],
  attribution: () => ATTRIBUTION,
  tableUrl: (_lang, tableId) =>
    `https://data.cso.ie/table/${encodeURIComponent(tableId)}`,
  instructions: `Official statistics for Ireland from PxStat, the database of the Central Statistics Office (CSO). This server is not affiliated with or endorsed by the CSO.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in English. Table ids are codes such as CPM20. Many tables have similar titles; the title shows the variables and the period range, so prefer a table whose range reaches the current year.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Use \`valueFilter\` to find a county or a group by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods.

Always cite the source line that each result ends with. If you change the data or calculate new figures, say so, for example "CSO and own calculations".`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['inflation', 'consumer prices', 'cpi'],
        query: 'consumer price index'
      },
      { terms: ['population'], query: 'population estimates' },
      {
        terms: ['housing price', 'house price', 'home price', 'property price'],
        query: 'residential property price index'
      },
      {
        terms: ['unemployment', 'jobless'],
        query: 'seasonally adjusted monthly unemployment'
      }
    ]
  }
};
