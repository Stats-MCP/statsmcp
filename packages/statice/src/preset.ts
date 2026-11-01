import type { PxwebPreset } from 'pxweb-mcp';

// Statistics Iceland publishes under CC BY 4.0: https://statice.is/publications/open-data-access
const TERMS = 'https://statice.is/publications/open-data-access';
const ATTRIBUTION = {
  is: `Heimild: Hagstofa Íslands, CC BY 4.0 (${TERMS})`,
  en: `Source: Statistics Iceland, CC BY 4.0 (${TERMS})`
} as const;

export const staticePreset: PxwebPreset = {
  name: 'statice',
  title: 'PX-Web database of Statistics Iceland (official statistics)',
  version: '0.3.0',
  apiBaseUrl: {
    en: 'https://px.hagstofa.is/pxen/api/v1',
    is: 'https://px.hagstofa.is/pxis/api/v1'
  },
  database: ['Atvinnuvegir', 'Efnahagur', 'Ibuar', 'Samfelag', 'Umhverfi'],
  search: 'index',
  languages: ['en', 'is'],
  attribution: (lang) => (lang === 'is' ? ATTRIBUTION.is : ATTRIBUTION.en),
  tableUrl: (lang, tableId) => {
    const pageLang = lang === 'is' ? 'is' : 'en';
    const segments = tableId.split('/').map(encodeURIComponent);
    const file = segments.pop() ?? tableId;
    return `https://px.hagstofa.is/px${pageLang}/pxweb/${pageLang}/${segments[0]}/${segments.join('__')}/${file}/`;
  },
  instructions: `Official statistics for Iceland from the PX-Web database of Statistics Iceland (Hagstofa Íslands). This server is not affiliated with or endorsed by Statistics Iceland.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in English ("en") or Icelandic ("is"). The English and Icelandic table lists are not the same, so use a table id only in the language that returned it. You can also search for a table number such as MAN00101 if no other table has the same number.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. Use \`valueFilter\` to find a municipality or industry by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` for recent periods.

Always cite the source line that each result ends with. If you change the data or calculate new figures, say so, for example "Statistics Iceland and own calculations".`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['inflation', 'consumer prices'],
        query: 'consumer price index'
      },
      { terms: ['salary', 'salaries', 'wage', 'wages'], query: 'wage index' },
      {
        terms: ['housing price', 'house price', 'home price', 'property price'],
        query: 'residential property market price index'
      },
      {
        terms: ['unemployment', 'jobless'],
        query: 'employment unemployment and labour force monthly'
      }
    ],
    is: [
      { terms: ['verðbólga', 'verðlag'], query: 'vísitala neysluverðs' },
      { terms: ['laun'], query: 'launavísitala' }
    ]
  }
};
