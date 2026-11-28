import type { PxwebPreset } from '@statsmcp/core';

// CZSO data is under CC BY 4.0: mention the terms with a link to this page and label
// adjusted or derived data: https://csu.gov.cz/conditions_for_use_and_further_dissemination
const TERMS = {
  cs: 'https://csu.gov.cz/podminky_pro_vyuzivani_a_dalsi_zverejnovani_statistickych_udaju_csu',
  en: 'https://csu.gov.cz/conditions_for_use_and_further_dissemination'
} as const;
const ATTRIBUTION = {
  cs: `Zdroj: Český statistický úřad, CC BY 4.0 (${TERMS.cs})`,
  en: `Source: Czech Statistical Office (CZSO), CC BY 4.0 (${TERMS.en})`
} as const;

export const czsoPreset: PxwebPreset = {
  name: 'czso',
  title:
    'DataStat, the database of the Czech Statistical Office (official statistics)',
  version: '0.6.0',
  apiBaseUrl: 'https://data.csu.gov.cz/api',
  api: 'czso',
  languages: ['cs', 'en'],
  attribution: (lang) => (lang === 'cs' ? ATTRIBUTION.cs : ATTRIBUTION.en),
  tableUrl: (_lang, tableId) =>
    `https://data.csu.gov.cz/datastat/info/SADA/${encodeURIComponent(tableId)}`,
  instructions: `Official statistics for Czechia from DataStat, the database of the Czech Statistical Office (CZSO). This server is not affiliated with or endorsed by the CZSO.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in Czech ("cs") or English ("en"). Table ids are dataset codes, for example CEN0101H for the inflation rate.
2. Call \`get_table_metadata\` on the best dataset. The indicators are in the variable IndicatorType. A time variable can mix years, quarters and months. Use \`valueFilter\` to find a region or an item by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` on the time variable for recent periods; it returns the newest periods of each level. Indicators without data for a period level give empty cells.

Always cite the source line that each result ends with. Label adjusted or derived data as such; do not present it as official CZSO statistics.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['cpi', 'inflation', 'consumer prices'],
        query: 'inflation rate'
      },
      {
        terms: ['unemployment rate', 'jobless'],
        query: 'general unemployment'
      },
      { terms: ['population', 'inhabitants'], query: 'population as at' }
    ],
    cs: [
      { terms: ['inflace'], query: 'míra inflace' },
      { terms: ['nezaměstnanost'], query: 'obecná míra nezaměstnanosti' }
    ]
  }
};
