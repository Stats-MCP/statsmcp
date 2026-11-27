import { onsTableUrl, type PxwebPreset } from '@statsmcp/core';

// ONS content is under the Open Government Licence v3.0, with this source statement:
// https://www.ons.gov.uk/methodology/geography/licences
const OGL =
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';

export const onsPreset: PxwebPreset = {
  name: 'ons',
  title:
    'ONS time series of the Office for National Statistics (official statistics of the United Kingdom)',
  version: '0.5.0',
  apiBaseUrl: 'https://api.beta.ons.gov.uk/v1',
  api: 'ons',
  languages: ['en'],
  attribution: () =>
    `Source: Office for National Statistics licensed under the Open Government Licence v.3.0 (${OGL})`,
  tableUrl: (_lang, tableId) => onsTableUrl(tableId),
  instructions: `Official statistics for the United Kingdom from the time series of the Office for National Statistics (ONS). This server is not affiliated with or endorsed by the ONS.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in English ("en"). Each table is one time series; its id is the dataset and the series code (CDID), for example MM23/D7G7 for the CPI annual rate. A search for a CDID finds that series.
2. Call \`get_table_metadata\` on the best series to see its frequencies (A, Q, M) and periods. Monthly labour market figures are rolling three-month periods, for example "2026 JUL-SEP".
3. Call \`query_table\` with one \`frequency\` and \`latest\` on \`period\` for recent periods. Without a frequency, a long series can be too large.

The ONS allows about 200 requests per minute. Always cite the source line that each result ends with. If you change the data or calculate new figures, say so.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      { terms: ['inflation', 'consumer prices', 'cpi'], query: 'D7G7' },
      { terms: ['cpih'], query: 'L55O' },
      { terms: ['unemployment', 'jobless'], query: 'MGSX' },
      { terms: ['gdp', 'gross domestic product'], query: 'ABMI' },
      { terms: ['population'], query: 'UKPOP' }
    ]
  }
};
