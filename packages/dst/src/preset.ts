import type { PxwebPreset } from '@statsmcp/core';

// Statistics Denmark: CC BY 4.0, commercial use allowed, cite "Statistics Denmark":
// https://www.dst.dk/en/Statistik/brug-statistikken/kildeangivelse
const LICENCE = 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)';
const ATTRIBUTION = {
  da: `Kilde: Danmarks Statistik, ${LICENCE}`,
  en: `Source: Statistics Denmark, ${LICENCE}`
} as const;

export const dstPreset: PxwebPreset = {
  name: 'dst',
  title: 'StatBank Denmark (Statistics Denmark official statistics)',
  version: '0.3.0',
  apiBaseUrl: 'https://api.statbank.dk/v1',
  api: 'statbank-dk',
  languages: ['da', 'en'],
  attribution: (lang) => (lang === 'da' ? ATTRIBUTION.da : ATTRIBUTION.en),
  tableUrl: (lang, tableId) =>
    lang === 'da'
      ? `https://www.statistikbanken.dk/${tableId}`
      : `https://www.statbank.dk/${tableId}`,
  instructions: `Official statistics for Denmark from StatBank Denmark, the database of Statistics Denmark (Danmarks Statistik). This server is not affiliated with or endorsed by Statistics Denmark.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in Danish ("da") or English ("en"). Table ids look like FOLK1A or PRIS01. Results marked "archived" are tables that are no longer updated; prefer current tables.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Use \`valueFilter\` to find a municipality, region or industry by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods.

Always cite the source line that each result ends with. If you calculate new figures, write "Own calculations based on data from Statistics Denmark".`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      { terms: ['salary', 'salaries', 'wage'], query: 'earnings' },
      {
        terms: ['inflation', 'consumer prices'],
        query: 'consumer price index'
      },
      {
        terms: ['housing price', 'house price', 'home price', 'property price'],
        query: 'price index for sales of property'
      }
    ],
    da: [
      { terms: ['inflation', 'prisstigning'], query: 'forbrugerprisindeks' },
      { terms: ['lønninger', 'indtjening'], query: 'løn' },
      {
        terms: ['boligpris', 'huspris', 'ejendomspris'],
        query: 'prisindeks for ejendomssalg'
      }
    ]
  }
};
