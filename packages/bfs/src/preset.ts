import type { PxwebPreset } from '@statsmcp/core';

// STAT-TAB states "Open use. Must provide the source." (opendata.swiss category OPEN BY):
// https://www.pxweb.bfs.admin.ch/pxweb/en/
const TERMS = 'https://opendata.swiss/en/terms-of-use';
const ATTRIBUTION = {
  de: `Quelle: Bundesamt für Statistik (BFS), STAT-TAB. Freie Nutzung, Quellenangabe ist Pflicht (${TERMS})`,
  fr: `Source : Office fédéral de la statistique (OFS), STAT-TAB. Utilisation libre, indication de la source obligatoire (${TERMS})`,
  it: `Fonte: Ufficio federale di statistica (UST), STAT-TAB. Uso libero, indicazione della fonte obbligatoria (${TERMS})`,
  en: `Source: Federal Statistical Office (FSO), STAT-TAB. Open use, the source must be given (${TERMS})`
} as const;

const PAGE_LANGUAGES: readonly string[] = ['de', 'fr', 'it', 'en'];

export const bfsPreset: PxwebPreset = {
  name: 'bfs',
  title: 'STAT-TAB (Swiss Federal Statistical Office official statistics)',
  version: '0.6.0',
  apiBaseUrl: 'https://www.pxweb.bfs.admin.ch/api/v1',
  databasePattern: /^px-x-\d{10}_\d{3}$/,
  search: 'index',
  languages: ['de', 'fr', 'it', 'en'],
  attribution: (lang) => {
    if (lang === 'de') return ATTRIBUTION.de;
    if (lang === 'fr') return ATTRIBUTION.fr;
    if (lang === 'it') return ATTRIBUTION.it;
    return ATTRIBUTION.en;
  },
  tableUrl: (lang, tableId) => {
    const pageLang = PAGE_LANGUAGES.includes(lang) ? lang : 'en';
    const [database = tableId, ...rest] = tableId.split('/');
    const file = rest.at(-1) ?? tableId;
    return `https://www.pxweb.bfs.admin.ch/pxweb/${pageLang}/${encodeURIComponent(database)}/-/${encodeURIComponent(file)}/`;
  },
  instructions: `Official statistics for Switzerland from STAT-TAB, the PxWeb database of the Swiss Federal Statistical Office (Bundesamt für Statistik BFS, Office fédéral de la statistique OFS, Ufficio federale di statistica UST). This server is not affiliated with or endorsed by the Federal Statistical Office.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in German ("de"), French ("fr"), Italian ("it") or English ("en"). German has the most tables; some tables are not in English, so try German or French when English results are poor.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Use \`valueFilter\` to find a canton, district or municipality by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods.

The office allows 50 API calls per 15 seconds, so request only the tables you need. Always cite the source line that each result ends with. If you calculate new figures from the data, say they are your own calculation based on Federal Statistical Office data.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    de: [
      { terms: ['lohn', 'löhne', 'gehalt', 'salär'], query: 'Bruttolohn' },
      { terms: ['einwohner', 'bevölkerung'], query: 'ständige Wohnbevölkerung' }
    ],
    fr: [{ terms: ['salaire', 'salaires'], query: 'salaire mensuel brut' }],
    en: [
      {
        terms: ['inhabitants', 'how many people'],
        query: 'resident population'
      }
    ]
  }
};
