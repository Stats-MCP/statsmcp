import type { PxwebPreset } from '@statsmcp/core';

// Statbel publishes its data under CC BY 4.0: credit "Source: Statbel", link the licence,
// and say when you changed the data: https://statbel.fgov.be/en/cc-40
const TERMS = 'https://statbel.fgov.be/en/cc-40';
const ATTRIBUTION = {
  nl: `Bron: Statbel, CC BY 4.0 (${TERMS})`,
  fr: `Source : Statbel, CC BY 4.0 (${TERMS})`,
  en: `Source: Statbel, CC BY 4.0 (${TERMS})`
} as const;

function attribution(lang: string): string {
  if (lang === 'nl') return ATTRIBUTION.nl;
  if (lang === 'fr') return ATTRIBUTION.fr;
  return ATTRIBUTION.en;
}

export const statbelPreset: PxwebPreset = {
  name: 'statbel',
  title: 'Be.STAT, the database of Statbel (official statistics of Belgium)',
  version: '0.4.1',
  apiBaseUrl: 'https://bestat.statbel.fgov.be/bestat/api',
  api: 'statbel',
  languages: ['nl', 'fr', 'en'],
  attribution,
  tableUrl: (_lang, tableId) =>
    `https://bestat.statbel.fgov.be/bestat/crosstable.xhtml?view=${encodeURIComponent(tableId)}`,
  instructions: `Official statistics for Belgium from Be.STAT, the database of Statbel. This server is not affiliated with or endorsed by Statbel.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in Dutch ("nl"), French ("fr") or English ("en"). Each table (view) exists in one language only, so use a table id only in the language that returned it. Many views cover only the last 13 months or the last quarters; prefer the view with the latest update.
2. Call \`get_table_metadata\` on the best view to see its variables and value codes. An optional variable that you leave out returns its total; a required one returns all its values.
3. Call \`query_table\` with only the values you need. Use \`latest\` on the period for recent periods.

Rates are fractions: 0.061 means 6.1 %. Always cite the source line that each result ends with. If you change the data or calculate new figures, say so.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      { terms: ['inflation', 'cpi'], query: 'consumer price index' },
      { terms: ['jobless'], query: 'unemployment rate' }
    ],
    nl: [
      { terms: ['inflatie'], query: 'consumptieprijsindex' },
      { terms: ['werkloosheid'], query: 'werkloosheidsgraad' }
    ],
    fr: [{ terms: ['inflation'], query: 'indice des prix à la consommation' }]
  }
};
