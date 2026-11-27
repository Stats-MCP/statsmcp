import type { PxwebPreset } from '@statsmcp/core';

// INE allows reuse under CC BY 4.0 if the source and the last update are cited and no
// INE support is suggested: https://www.ine.es/dyngs/AYU/index.htm?cid=125
const TERMS = 'https://www.ine.es/dyngs/AYU/index.htm?cid=125';
const ATTRIBUTION = {
  es: `Fuente: Sitio web del INE: www.ine.es, CC BY 4.0 (${TERMS})`,
  en: `Source: INE website (Statistics Spain): www.ine.es, CC BY 4.0 (${TERMS})`
} as const;

export const ineEsPreset: PxwebPreset = {
  name: 'ine-es',
  title: 'INE Spain Tempus3 database (official statistics)',
  version: '0.5.0',
  apiBaseUrl: 'https://servicios.ine.es/wstempus/js',
  api: 'ine-es',
  languages: ['es', 'en'],
  attribution: (lang) => (lang === 'es' ? ATTRIBUTION.es : ATTRIBUTION.en),
  tableUrl: (lang, tableId) =>
    `https://www.ine.es/jaxiT3/Tabla.htm?t=${encodeURIComponent(tableId)}&L=${lang === 'es' ? '0' : '1'}`,
  instructions: `Official statistics for Spain from the Tempus3 database of the National Statistics Institute (INE). This server is not affiliated with or endorsed by INE.

To answer a question with data:
1. Call \`search_tables\` with short topic keywords in Spanish ("es") or English ("en"). Each result shows the date of the last update.
2. Call \`get_table_metadata\` on the best table to see its variables and value codes. The "period" variable lists the periods of one sample series; other series can be longer, so use \`latest\` for recent data. Use \`valueFilter\` to find a region or a province by name.
3. Call \`query_table\` with only the values you need. Use \`latest\` on "period" for recent periods. Variables that you leave out return all their values.

Always cite the source line that each result ends with and the date of the last update from \`search_tables\`. If you change the data or calculate new figures, say so, for example "Elaboración propia con datos extraídos del sitio web del INE: www.ine.es". Do not suggest that INE supports the answer.`,
  maxCells: 5000,
  searchLimit: 10,
  searchAliases: {
    en: [
      {
        terms: ['population', 'inhabitants'],
        query: 'Resident population by date, sex and age'
      },
      {
        terms: ['inflation', 'consumer price index', 'consumer prices', 'cpi'],
        query: 'National General Index'
      },
      {
        terms: ['house price', 'housing price', 'home price', 'property price'],
        query: 'new dwelling and second-hand dwelling'
      }
    ],
    es: [
      {
        terms: ['población', 'poblacion', 'habitantes'],
        query: 'Población residente por fecha, sexo y edad'
      },
      {
        terms: ['inflación', 'inflacion', 'precios de consumo'],
        query: 'Índice general nacional'
      },
      {
        terms: ['precio de la vivienda', 'precios de vivienda'],
        query: 'vivienda nueva y de segunda mano'
      }
    ]
  }
};
