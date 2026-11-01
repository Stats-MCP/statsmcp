import type { PxwebPreset } from '@statsmcp/core';

const SISTAT_WEB = 'https://pxweb.stat.si/SiStatData/pxweb';

// SURS copyright terms require naming SURS as the source on every use:
// https://www.stat.si/StatWeb/en/StaticPages/Index/Copyright
const ATTRIBUTION = {
  sl: 'Vir: SURS (Statistični urad Republike Slovenije)',
  en: 'Source: SURS (Statistical Office of the Republic of Slovenia)'
} as const;

export const sistatPreset: PxwebPreset = {
  name: 'sistat',
  title: 'SiStat (Slovenian official statistics)',
  version: '0.4.0',
  apiBaseUrl: 'https://pxweb.stat.si/SiStatData/api/v1',
  languages: ['sl', 'en'],
  attribution: (lang) => (lang === 'sl' ? ATTRIBUTION.sl : ATTRIBUTION.en),
  tableUrl: (lang, tableId) =>
    `${SISTAT_WEB}/${lang}/Data/-/${tableId.split('/').at(-1) ?? tableId}`,
  instructions: `Official statistics for Slovenia from SiStat, the database of the Statistical Office of the Republic of Slovenia (SURS). This server is not affiliated with or endorsed by SURS.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords. Slovenian titles ("sl") are the most complete; try "en" if the user writes in English, and try the other language when results are poor.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Use \`valueFilter\` to find a municipality, region or activity by name instead of reading long lists.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods. Leave out optional variables to get their total.

Always cite the source line that each result ends with. If you calculate new figures from the data, say they are your own calculation based on SURS data.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      { terms: ['salary', 'salaries', 'wage'], query: 'earnings' },
      {
        terms: [
          'housing price',
          'house price',
          'home price',
          'property price',
          'real estate'
        ],
        query: 'house price indices'
      }
    ],
    sl: [
      {
        terms: ['cene stanovanj', 'cene nepremičnin', 'stanovanjske cene'],
        query: 'indeksi cen stanovanjskih nepremičnin'
      }
    ]
  }
};
