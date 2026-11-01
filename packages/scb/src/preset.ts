import type { PxwebPreset } from 'pxweb-mcp';

// Statistics Sweden publishes the database under CC0 (API /config) and asks to be named as the source.
const LICENCE = 'CC0 (https://creativecommons.org/publicdomain/zero/1.0/)';
const ATTRIBUTION = {
  sv: `Källa: SCB, ${LICENCE}`,
  en: `Source: Statistics Sweden (SCB), ${LICENCE}`
} as const;

const CLOSED_TABLE =
  /\((?:no update after|uppdateras ej efter|not updated|uppdateras ej)\b/i;

export const scbPreset: PxwebPreset = {
  name: 'scb',
  title: 'Statistical Database of Statistics Sweden (SCB official statistics)',
  version: '0.1.0',
  apiBaseUrl: 'https://statistikdatabasen.scb.se/api/v2',
  api: 'pxweb-v2',
  // SCB's own search scored MRR 0.27 on the golden set; the local index scored 0.57.
  search: 'index',
  languages: ['sv', 'en'],
  attribution: (lang) => (lang === 'sv' ? ATTRIBUTION.sv : ATTRIBUTION.en),
  tableUrl: (lang) =>
    `https://www.statistikdatabasen.scb.se/pxweb/${lang === 'sv' ? 'sv' : 'en'}/ssd/`,
  isArchived: (hit) => CLOSED_TABLE.test(hit.title),
  instructions: `Official statistics for Sweden from the Statistical Database of Statistics Sweden (SCB). This server is not affiliated with or endorsed by Statistics Sweden.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in Swedish ("sv") or English ("en"). Table ids look like TAB6596. Results marked "archived" are tables that are no longer updated; prefer current tables.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Use \`valueFilter\` to find a municipality, county or industry by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods.

Statistics Sweden allows about 30 API calls per 10 seconds. Always cite the source line that each result ends with.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['inflation', 'consumer prices'],
        query: 'consumer price index'
      },
      {
        terms: ['population'],
        query: 'population per month by region age and sex'
      },
      {
        terms: ['salary', 'salaries', 'wage'],
        query: 'average monthly salary'
      },
      {
        terms: ['housing price', 'house price', 'home price', 'property price'],
        query: 'real estate price index permanent living'
      }
    ],
    sv: [
      { terms: ['inflation', 'prisökning'], query: 'konsumentprisindex månad' },
      { terms: ['lön', 'löner'], query: 'genomsnittlig månadslön' },
      { terms: ['huspris', 'bostadspris'], query: 'fastighetsprisindex' }
    ]
  }
};
