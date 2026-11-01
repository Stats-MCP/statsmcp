import type { PxwebPreset } from 'pxweb-mcp';

// The Croatian Bureau of Statistics publishes under the Open Licence of the Republic
// of Croatia. It asks for the source, the date of the last update and a link to the table.
const LICENCE = 'https://web.dzs.hr/Hrv/about_us/Legals/Open%20Licence.pdf';
const ATTRIBUTION = {
  hr: `Izvor: Državni zavod za statistiku. Contains public sector information licensed under the Open Data Licence (${LICENCE})`,
  en: `Source: Croatian Bureau of Statistics. Contains public sector information licensed under the Open Data Licence (${LICENCE})`
} as const;

export const dzsPreset: PxwebPreset = {
  name: 'dzs',
  title:
    'PX-Web database of the Croatian Bureau of Statistics (official statistics)',
  version: '0.1.0',
  apiBaseUrl: 'https://web.dzs.hr/PXWeb/api/v1',
  database: [
    'Cijene',
    'Energija',
    'Građevinarstvo',
    'Industrija',
    'Nacionalni racuni',
    'Naselja i stanovništvo Republike Hrvatske',
    'Okolis',
    'Osobna potrošnja i pokazatelji siromaštva',
    'Poljoprivreda, lov, šumarstvo i ribarstvo',
    'Popis poljoprivrede 2020',
    'Pravosudje',
    'Robna razmjena s inozemstvom',
    'Stanovništvo',
    'Strukturne poslovne statistike',
    'Subnacionalne statistike',
    'Transport i komunikacije',
    'Trgovina na malo',
    'Turizam',
    'Zaposlenost i plaće',
    'Znanost, tehnologija i informacijsko društvo'
  ],
  search: 'index',
  languages: ['hr', 'en'],
  attribution: (lang) => (lang === 'hr' ? ATTRIBUTION.hr : ATTRIBUTION.en),
  tableUrl: (lang, tableId) => {
    const pageLang = lang === 'hr' ? 'hr' : 'en';
    const segments = tableId.split('/').map(encodeURIComponent);
    const file = segments.pop() ?? tableId;
    return `https://web.dzs.hr/PXWeb/pxweb/${pageLang}/${segments[0]}/${segments.join('__')}/${file}/`;
  },
  instructions: `Official statistics for Croatia from the PX-Web database of the Croatian Bureau of Statistics (Državni zavod za statistiku, DZS). This server is not affiliated with or endorsed by the Croatian Bureau of Statistics.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in Croatian ("hr") or English ("en"). Table ids contain the database and folder names; use them exactly as search_tables returns them. You can also search for a table number such as ME_PS09 if no other table has the same number.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Use \`valueFilter\` to find a county, town or municipality by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods.

The bureau allows 10 API calls per 10 seconds, so request only the tables you need. Registered unemployment is published by the Croatian Employment Service, not in this database.

Always cite the source line that each result ends with, and the date of the last update that search_tables shows for the table. If you change the data or calculate new figures, say so, for example "Croatian Bureau of Statistics and own calculations".`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['inflation', 'consumer prices'],
        query: 'consumer price indices'
      },
      {
        terms: ['salary', 'salaries', 'wage', 'wages'],
        query: 'average monthly gross and net earnings'
      },
      {
        terms: ['housing price', 'house price', 'home price', 'property price'],
        query: 'house price indices'
      }
    ],
    hr: [
      { terms: ['inflacija', 'cijene'], query: 'indeksi potrošačkih cijena' },
      {
        terms: ['plaća', 'plaće'],
        query: 'prosječna mjesečna bruto i neto plaća'
      },
      {
        terms: ['cijene stanova', 'cijene nekretnina'],
        query: 'indeksi cijena stambenih objekata'
      }
    ]
  }
};
