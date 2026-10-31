import type { PxwebPreset } from 'pxweb-mcp';

// Statistics Finland publishes under CC BY 4.0:
// https://stat.fi/en/about-us/get-to-know-statistics-finland/legislation/terms-of-use
const LICENCE = 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)';
const ATTRIBUTION = {
  fi: `Lähde: Tilastokeskus, ${LICENCE}`,
  sv: `Källa: Statistikcentralen, ${LICENCE}`,
  en: `Source: Statistics Finland, ${LICENCE}`
} as const;

export const statfinPreset: PxwebPreset = {
  name: 'statfin',
  title: 'StatFin (Statistics Finland official statistics)',
  version: '0.1.0',
  apiBaseUrl: 'https://pxdata.stat.fi/PXWeb/api/v1',
  database: 'StatFin',
  languages: ['fi', 'sv', 'en'],
  attribution: (lang) => {
    if (lang === 'fi') return ATTRIBUTION.fi;
    if (lang === 'sv') return ATTRIBUTION.sv;
    return ATTRIBUTION.en;
  },
  tableUrl: (lang, tableId) => {
    const pageLang = ['fi', 'sv'].includes(lang) ? lang : 'en';
    const segments = tableId.split('/');
    const file = segments.pop() ?? tableId;
    const folder = ['StatFin', ...segments].join('__');
    return `https://pxdata.stat.fi/PxWeb/pxweb/${pageLang}/StatFin/${folder}/${file}/`;
  },
  instructions: `Official statistics for Finland from StatFin, the database of Statistics Finland (Tilastokeskus). This server is not affiliated with or endorsed by Statistics Finland.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in Finnish ("fi"), Swedish ("sv") or English ("en"). Try another language when results are poor.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Use \`valueFilter\` to find a municipality, region or industry by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods.

Statistics Finland allows about 40 API calls per minute, so avoid unnecessary calls. Always cite the source line that each result ends with. If you calculate new figures from the data, say they are your own calculation based on Statistics Finland data.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['inflation', 'consumer prices'],
        query: 'CPI'
      },
      { terms: ['salary', 'salaries', 'wage'], query: 'earnings' },
      {
        terms: ['housing price', 'house price', 'home price', 'property price'],
        query: 'prices of dwellings'
      }
    ],
    fi: [
      { terms: ['inflaatio', 'hintataso'], query: 'kuluttajahintaindeksi' },
      { terms: ['palkka', 'palkat', 'palkko'], query: 'ansiotasoindeksi' },
      {
        terms: ['asuntojen hin', 'asuntohin'],
        query: 'osakeasuntojen hinnat'
      }
    ],
    sv: [
      { terms: ['inflation'], query: 'konsumentprisindex' },
      { terms: ['lön', 'löner'], query: 'förtjänstnivåindex' }
    ]
  }
};
