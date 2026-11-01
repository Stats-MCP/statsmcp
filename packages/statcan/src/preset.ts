import type { PxwebPreset } from '@statsmcp/core';

// Statistics Canada Open Licence: commercial use allowed; credit "Statistics Canada",
// and "Adapted from Statistics Canada" for changed data: https://www.statcan.gc.ca/en/reference/licence
const ATTRIBUTION = {
  fr: 'Source : Statistique Canada, Licence ouverte de Statistique Canada (https://www.statcan.gc.ca/fr/reference/licence)',
  en: 'Source: Statistics Canada, Statistics Canada Open Licence (https://www.statcan.gc.ca/en/reference/licence)'
} as const;

export const statcanPreset: PxwebPreset = {
  name: 'statcan',
  title: 'Statistics Canada data tables (official statistics of Canada)',
  version: '0.4.0',
  apiBaseUrl: 'https://www150.statcan.gc.ca/t1/wds/rest',
  api: 'statcan-wds',
  languages: ['en', 'fr'],
  attribution: (lang) => (lang === 'fr' ? ATTRIBUTION.fr : ATTRIBUTION.en),
  tableUrl: (lang, tableId) =>
    `https://www150.statcan.gc.ca/t1/tbl1/${lang === 'fr' ? 'fr' : 'en'}/tv.action?pid=${tableId}01`,
  instructions: `Official statistics for Canada from the data tables of Statistics Canada. This server is not affiliated with or endorsed by Statistics Canada.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in English ("en") or French ("fr"). Table ids are 8-digit product ids, for example 18100004. Results marked "archived" are tables that are no longer updated; prefer current tables.
2. Call \`get_table_metadata\` on the best table. Variables are numbered by position (1 = geography in most tables); use \`valueFilter\` to find a province, city or product by name. The "time" variable lists periods for monthly, quarterly and annual tables.
3. Call \`query_table\` with one or a few members per variable. Not every combination of members exists. Use \`latest\` on "time" for recent periods.

Always cite the source line that each result ends with. If you change the data or calculate new figures, write "Adapted from Statistics Canada".`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      { terms: ['inflation', 'cpi'], query: 'consumer price index monthly' },
      { terms: ['population'], query: 'population estimates' },
      {
        terms: ['salary', 'salaries', 'wage'],
        query: 'average weekly earnings'
      },
      {
        terms: ['housing price', 'house price', 'home price', 'property price'],
        query: 'new housing price index'
      }
    ],
    fr: [
      {
        terms: ['inflation', 'ipc'],
        query: 'indice des prix à la consommation mensuel'
      },
      {
        terms: ['salaire', 'salaires'],
        query: 'rémunération hebdomadaire moyenne'
      }
    ]
  }
};
