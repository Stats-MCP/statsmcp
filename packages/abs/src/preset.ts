import type { PxwebPreset } from '@statsmcp/core';

// Most ABS material is under CC BY 4.0 and must be attributed to the ABS:
// https://www.abs.gov.au/website-privacy-copyright-and-disclaimer#copyright-and-creative-commons
const LICENCE = 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)';
const ATTRIBUTION = `Source: Australian Bureau of Statistics (ABS), ${LICENCE}`;

export const absPreset: PxwebPreset = {
  name: 'abs',
  title: 'Australian Bureau of Statistics data (official statistics)',
  version: '0.4.0',
  apiBaseUrl: 'https://data.api.abs.gov.au/rest',
  api: 'sdmx',
  sdmxAgency: 'ABS',
  languages: ['en'],
  attribution: () => ATTRIBUTION,
  tableUrl: (_lang, tableId) =>
    `https://dataexplorer.abs.gov.au/vis?df[ds]=ABS_ABS_TOPICS&df[id]=${encodeURIComponent(tableId)}&df[ag]=ABS`,
  instructions: `Official statistics for Australia from the Data API of the Australian Bureau of Statistics (ABS). This server is not affiliated with or endorsed by the ABS.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords, for example "consumer price index" or "labour force". Many tables are Census tables for one type of area, for example local government areas. For national figures, use the main series tables.
2. Call \`get_table_metadata\` on the best table. Value codes are mostly numbers, so read their labels. Use \`valueFilter\` to find a region or an item by name. If the table has a FREQ variable, select only one frequency, for example "Q" for quarterly. Otherwise the result mixes monthly and quarterly series.
3. Call \`query_table\` with only the values you need. Use \`latest\` on TIME_PERIOD for recent periods. Census tables have data only for Census years.

Always cite the source line that each result ends with. If you calculate new figures, say they are your own calculation based on ABS data.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['inflation', 'consumer prices', 'cpi'],
        query: 'consumer price index'
      },
      {
        terms: ['salary', 'salaries', 'wage'],
        query: 'wage price index'
      },
      {
        terms: ['housing price', 'house price', 'home price', 'property price'],
        query: 'residential property price index'
      },
      {
        terms: ['unemployment', 'jobless', 'labour force'],
        query: 'LF'
      },
      {
        terms: ['population'],
        query: 'quarterly population estimates'
      },
      {
        terms: ['gdp', 'gross domestic product', 'economic growth'],
        query: 'national accounts key aggregates'
      }
    ]
  }
};
