import type { PxwebPreset } from 'pxweb-mcp';

// Eurostat allows reuse, also commercial, if the source is acknowledged. Data for
// countries outside the EU, EFTA and candidate countries is for non-commercial use only:
// https://ec.europa.eu/eurostat/help/copyright-notice
const TERMS = 'https://ec.europa.eu/eurostat/help/copyright-notice';
const ATTRIBUTION = {
  de: `Quelle: Eurostat (${TERMS})`,
  fr: `Source : Eurostat (${TERMS})`,
  en: `Source: Eurostat (${TERMS})`
} as const;

export const eurostatPreset: PxwebPreset = {
  name: 'eurostat',
  title: 'Eurostat (harmonised official statistics for EU and EFTA countries)',
  version: '0.3.0',
  apiBaseUrl: 'https://ec.europa.eu/eurostat/api/dissemination',
  api: 'eurostat',
  languages: ['en', 'de', 'fr'],
  attribution: (lang) => {
    if (lang === 'de') return ATTRIBUTION.de;
    if (lang === 'fr') return ATTRIBUTION.fr;
    return ATTRIBUTION.en;
  },
  tableUrl: (lang, tableId) =>
    `https://ec.europa.eu/eurostat/databrowser/view/${tableId}/default/table?lang=${lang}`,
  instructions: `Harmonised official statistics for the EU, EFTA and candidate countries from Eurostat. Use it to compare countries. For the most detailed national data, a national statistics server may have more. This server is not affiliated with or endorsed by Eurostat or the European Commission.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in English ("en"), German ("de") or French ("fr"). Dataset codes look like prc_hicp_minr. Results marked "archived" are discontinued datasets; prefer current ones.
2. Call \`get_table_metadata\` on the best dataset. Countries are values of the "geo" variable (for example SI, DE, EU27_2020); use \`valueFilter\` to find a country or region by name. Select one value of "unit" and "freq" when the dataset has several.
3. Call \`query_table\` with only the values you need. Use \`latest\` on "time" for recent periods.

Always cite the source line that each result ends with. Data for countries outside the EU, EFTA and candidate countries may only be reused for non-commercial purposes.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      { terms: ['salary', 'salaries', 'wage'], query: 'earnings' },
      { terms: ['population'], query: 'population on 1 January' },
      {
        terms: ['housing price', 'house price', 'home price', 'property price'],
        query: 'house price index'
      }
    ]
  }
};
