import type { PxwebPreset } from '@statsmcp/core';

// INSEE data is under Licence Ouverte 2.0: cite "Source : Insee" and the date of the last
// update, and do not change the meaning of the data: https://www.insee.fr/fr/information/2008466
const LICENCE = 'https://www.etalab.gouv.fr/licence-ouverte-open-licence';
const ATTRIBUTION = {
  fr: `Source : Insee, Licence Ouverte 2.0 (${LICENCE})`,
  en: `Source: Insee, Licence Ouverte / Open Licence 2.0 (${LICENCE})`
} as const;

export const inseePreset: PxwebPreset = {
  name: 'insee',
  title: 'INSEE Melodi data catalogue (official statistics of France)',
  version: '0.6.0',
  apiBaseUrl: 'https://api.insee.fr/melodi',
  api: 'insee',
  languages: ['fr', 'en'],
  attribution: (lang) => (lang === 'fr' ? ATTRIBUTION.fr : ATTRIBUTION.en),
  tableUrl: (lang, tableId) =>
    `https://catalogue-donnees.insee.fr/${lang === 'fr' ? 'fr' : 'en'}/catalogue/recherche/${encodeURIComponent(tableId)}`,
  instructions: `Official statistics for France from Melodi, the data catalogue of INSEE. This server is not affiliated with or endorsed by INSEE.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in French ("fr") or English ("en"). Melodi has about 160 large datasets; their ids start with DS_.
2. Call \`get_table_metadata\` on the best dataset. Datasets have many dimensions; use \`valueFilter\` to find a territory (GEO), for example a municipality code such as COM-75056 for Paris, or an item by name.
3. Call \`query_table\` with values for most dimensions. Dimensions that you leave out return all their values, which can exceed the size limit. Use \`latest\` on TIME_PERIOD for recent periods.

INSEE allows about 30 API calls per minute. Always cite the source line that each result ends with and the date of the last update in the title. Do not change the meaning of the data.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['inflation', 'consumer prices', 'cpi'],
        query: 'Consumption Price Index (CPI) - main dataset'
      }
    ],
    fr: [
      {
        terms: ['inflation', 'prix à la consommation', 'ipc'],
        query: 'Indice des prix à la consommation - jeu de données principal'
      }
    ]
  }
};
