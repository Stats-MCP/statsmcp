import type { PxwebPreset } from '@statsmcp/core';

// BDL data is under CC BY 4.0: https://api.stat.gov.pl/Home/BdlApi?lang=en
const ATTRIBUTION = {
  pl: 'Źródło: Główny Urząd Statystyczny, Bank Danych Lokalnych (licencja CC BY 4.0, https://creativecommons.org/licenses/by/4.0/deed.pl)',
  en: 'Source: Statistics Poland, Local Data Bank (licensed under CC BY 4.0, https://creativecommons.org/licenses/by/4.0/)'
} as const;

export const bdlPreset: PxwebPreset = {
  name: 'bdl',
  title: 'Local Data Bank of Statistics Poland (official statistics of Poland)',
  version: '0.5.0',
  apiBaseUrl: 'https://bdl.stat.gov.pl/api/v1',
  api: 'bdl',
  languages: ['pl', 'en'],
  attribution: (lang) => (lang === 'pl' ? ATTRIBUTION.pl : ATTRIBUTION.en),
  // The BDL website has subject pages in Polish only.
  tableUrl: (_lang, tableId) =>
    `https://bdl.stat.gov.pl/bdl/dane/podgrup/temat/0/0/${encodeURIComponent(tableId.replace(/^P/i, ''))}`,
  instructions: `Official statistics for Poland from the Local Data Bank (BDL) of Statistics Poland (GUS). This server is not affiliated with or endorsed by Statistics Poland.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in Polish ("pl") or English ("en"), for example "stopa bezrobocia rejestrowanego" or "population". Table ids are BDL subject ids such as P3559. Results marked "archived" are archival subjects.
2. Call \`get_table_metadata\` on the best table. The time variable "year" has years; months and quarters are a separate variable of the table. The variable "unit" has Poland and the 16 voivodeships.
3. Call \`query_table\` with only the values you need. Use \`latest\` on "year" for recent years. A left-out unit gives Poland.

Most BDL data is annual and some subjects end years ago, so check the years. Consumer prices from 2026 are in P4635 (COICOP 2018); older ones are in P2955 and P2496. Statistics Poland limits the number of requests, so ask for the data you need in few calls.

Always cite the source line that each result ends with.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      { terms: ['unemployment'], query: 'registered unemployment rate' },
      {
        terms: ['cpi', 'consumer prices'],
        query: 'price indices of consumer goods and services'
      }
    ],
    pl: [
      { terms: ['bezrobocie'], query: 'stopa bezrobocia rejestrowanego' },
      {
        terms: ['ceny konsumpcyjne'],
        query: 'wskaźniki cen towarów i usług konsumpcyjnych'
      }
    ]
  }
};
