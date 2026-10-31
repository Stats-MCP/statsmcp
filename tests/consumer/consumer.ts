import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import {
  createMemoryCache,
  createPresetServer,
  createPxwebClient,
  createPxwebServer,
  flattenJsonStat,
  planQuery,
  PxwebError,
  QueryPlanError,
  toCsv,
  type ApiBaseUrl,
  type Cache,
  type FlatTable,
  type JsonStatDataset,
  type MemoryCacheOptions,
  type PxwebClient,
  type PxwebClientOptions,
  type PresetServerOptions,
  type PxwebPreset,
  type PxwebSelection,
  type QueryPlan,
  type SearchAlias,
  type SelectionInput,
  type TableMetadata,
  type TableSearchHit,
  type TableVariable
} from 'pxweb-mcp';
import {
  createSistatServer,
  sistatPreset,
  type SistatServerOptions
} from 'sistat-mcp';

const preset: PxwebPreset = {
  name: 'statfin',
  title: 'Statistics Finland',
  version: '0.1.0',
  apiBaseUrl: 'https://pxdata.stat.fi/PXWeb/api/v1',
  languages: ['fi', 'en', 'sv'],
  attribution: () => 'Source: Statistics Finland',
  tableUrl: (lang) => `https://pxdata.stat.fi/PxWeb/pxweb/${lang}/StatFin/`,
  instructions: 'Official statistics for Finland. Call search_tables first.',
  maxCells: 5000,
  searchLimit: 10
};

const perLanguageRoot: ApiBaseUrl = {
  en: 'https://pxdata.stat.fi/PXWeb/api/v1'
};

const cacheOptions: MemoryCacheOptions = { maxEntries: 10, maxChars: 1024 };
const cache: Cache = createMemoryCache(cacheOptions);
const clientOptions: PxwebClientOptions = {
  baseUrl: preset.apiBaseUrl,
  database: 'StatFin',
  cache,
  fetch,
  userAgent: 'consumer',
  timeoutMs: 1000
};
const client: PxwebClient = createPxwebClient(clientOptions);

const hits: TableSearchHit[] = await client.search('en', 'population');
const metadata: TableMetadata = await client.getMetadata('en', 'T1.px');
const variables: TableVariable[] = metadata.variables;
const inputs: SelectionInput[] = [{ code: 'MESEC', latest: 1 }];
const plan: QueryPlan = planQuery(metadata, inputs, preset.maxCells);
const selections: PxwebSelection[] = plan.selections;
const table: FlatTable = await client.query('en', 'T1.px', selections);
const dataset: JsonStatDataset = {
  class: 'dataset',
  id: [],
  size: [],
  dimension: {},
  value: []
};

export const summary: string[] = [
  hits[0]?.tableId ?? '',
  variables[0]?.code ?? '',
  toCsv(table),
  toCsv(flattenJsonStat(dataset)),
  sistatPreset.title,
  String(Object.keys(perLanguageRoot))
];

export function describeError(err: unknown): string {
  if (err instanceof PxwebError) return `HTTP ${err.status}`;
  if (err instanceof QueryPlanError) return err.message;
  return 'unknown';
}

const sistatOptions: SistatServerOptions = {
  cache: createMemoryCache(),
  userAgent: 'my-app/1.0'
};

const aliases: SearchAlias[] = [{ terms: ['salary'], query: 'earnings' }];
const presetOptions: PresetServerOptions = { cache, userAgent: 'consumer' };

await createPxwebServer(preset, client).connect(new StdioServerTransport());
await createPresetServer(
  { ...preset, database: 'StatFin', searchAliases: { en: aliases } },
  presetOptions
).connect(new StdioServerTransport());
await createSistatServer(sistatOptions).connect(new StdioServerTransport());
