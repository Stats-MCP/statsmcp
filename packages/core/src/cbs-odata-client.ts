import { z } from 'zod';

import {
  createRequester,
  DATA_TTL_SECONDS,
  METADATA_TTL_SECONDS,
  PxwebError,
  SEARCH_TTL_SECONDS,
  type HttpOptions
} from '@/http';
import type { FlatTable } from '@/json-stat';
import type {
  PxwebClient,
  PxwebSelection,
  TableMetadata,
  TableVariable
} from '@/pxweb-client';
import {
  createTableIndexLoader,
  type TableDoc,
  type TableListOptions
} from '@/table-index';

const TABLE_ID_PATTERN = /^[A-Za-z0-9]+$/;
const NOT_FOUND_STATUSES = new Set([400, 404]);
const DISCONTINUED = new Set(['Gediscontinueerd', 'Discontinued']);
const DIMENSION_TYPES = new Set(['Dimension', 'TimeDimension', 'GeoDimension']);
/** Code of the synthetic variable that holds the measures (OData columns). */
const TOPICS_CODE = 'Topics';

const catalogueSchema = z.object({
  value: z.array(
    z.object({
      Identifier: z.string(),
      Title: z.string(),
      Language: z.string(),
      Modified: z.string().nullish(),
      OutputStatus: z.string().nullish(),
      Period: z.string().nullish()
    })
  )
});

const propertiesSchema = z.object({
  value: z.array(
    z.object({
      Type: z.string(),
      Key: z.string(),
      Title: z.string(),
      Unit: z.string().nullish()
    })
  )
});

const keysSchema = z.object({
  value: z.array(z.object({ Key: z.string(), Title: z.string() })),
  'odata.nextLink': z.string().optional()
});

const tableInfoSchema = z.object({
  value: z.array(z.object({ Title: z.string() })).min(1)
});

const v4DimensionsSchema = z.object({
  value: z.array(
    z.object({ Identifier: z.string(), Title: z.string(), Kind: z.string() })
  )
});

const v4CodesSchema = z.object({
  value: z.array(
    z.object({
      Identifier: z.string(),
      Title: z.string(),
      Unit: z.string().nullish()
    })
  ),
  '@odata.nextLink': z.string().optional()
});

const v4PropertiesSchema = z.object({ Title: z.string() });

const observationsSchema = z.object({
  value: z.array(
    z.record(z.string(), z.union([z.string(), z.number(), z.null()]))
  ),
  '@odata.nextLink': z.string().optional()
});

const rowsSchema = z.object({
  value: z.array(
    z.record(z.string(), z.union([z.string(), z.number(), z.null()]))
  ),
  'odata.nextLink': z.string().optional()
});

/** Guards against a run-away loop if the service keeps sending next links. */
const MAX_KEY_PAGES = 20;

export interface CbsODataClientOptions extends HttpOptions, TableListOptions {
  /** Root of the CBS open data service, for example "https://opendata.cbs.nl". */
  baseUrl: string;
  /**
   * Root of the CBS OData v4 catalogue, used when the v3 service refuses a request.
   * Defaults to "https://datasets.cbs.nl/odata/v1/CBS".
   */
  datasetsUrl?: string;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

interface CbsTable {
  metadata: TableMetadata;
  /** Per dimension: trimmed code → key exactly as the API stores it. */
  rawKeys: Map<string, Map<string, string>>;
  /** Set when the table comes from the OData v4 service, with its v4 id. */
  datasetId?: string;
}

const DEFAULT_DATASETS_URL = 'https://datasets.cbs.nl/odata/v1/CBS';

function isNotFound(err: unknown): boolean {
  return err instanceof PxwebError && NOT_FOUND_STATUSES.has(err.status);
}

function isTransient(err: unknown): boolean {
  if (!(err instanceof PxwebError)) return true;
  return err.status === 429 || err.status >= 500;
}

function sameOriginLink(
  next: string | undefined,
  current: string
): string | undefined {
  if (!next) return undefined;
  try {
    return new URL(next).origin === new URL(current).origin ? next : undefined;
  } catch {
    return undefined;
  }
}

function notFound(tableId: string): PxwebError {
  return new PxwebError(
    `Table "${tableId}" was not found. Use search_tables to find a table id.`,
    404
  );
}

function tooLarge(): PxwebError {
  return new PxwebError(
    'The result is larger than one CBS response. Select fewer values.',
    400
  );
}

function quoted(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function odataUrl(base: string, params: Record<string, string>): string {
  const query = Object.entries({ $format: 'json', ...params })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `${base}?${query}`;
}

function checkTableId(tableId: string): void {
  if (!TABLE_ID_PATTERN.test(tableId)) {
    throw new PxwebError(
      `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
      400
    );
  }
}

function selectedCodes(
  variable: TableVariable,
  selection: PxwebSelection | undefined
): string[] {
  if (!selection || selection.selection.filter === 'all')
    return variable.values;
  const { filter, values } = selection.selection;
  if (filter === 'top') {
    const count = Math.max(1, Number(values[0]) || 1);
    return variable.values.slice(-count);
  }
  return values;
}

function cellValue(value: string | number | null): string | number | null {
  if (typeof value === 'string') return value.trim();
  return value;
}

const CARIBBEAN = /^(?:Caribisch Nederland|Caribbean Netherlands)\b/i;

/**
 * The index trusts catalogue order. Tables for Bonaire, Sint Eustatius and Saba
 * otherwise outrank the national tables for "population" or "GDP", so they go last.
 */
function caribbeanLast(docs: readonly TableDoc[]): TableDoc[] {
  return [
    ...docs.filter((doc) => !CARIBBEAN.test(doc.title)),
    ...docs.filter((doc) => CARIBBEAN.test(doc.title))
  ];
}

/**
 * Client for the OData v3 service of Statistics Netherlands (CBS), with OData v4 as
 * the fallback. Measures are table columns, so the client shows them as one extra
 * variable, "Topics".
 */
export function createCbsODataClient(
  options: CbsODataClientOptions
): PxwebClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const datasetsUrl = (options.datasetsUrl ?? DEFAULT_DATASETS_URL).replace(
    /\/+$/,
    ''
  );
  const now = options.now ?? (() => new Date());
  const request = createRequester(options);
  const get: RequestInit = { method: 'GET' };
  let loadingCatalogue:
    | Promise<z.infer<typeof catalogueSchema>['value']>
    | undefined;

  const listTables = async (lang: string): Promise<TableDoc[]> =>
    caribbeanLast(
      (await catalogue())
        .filter((entry) => entry.Language === lang)
        .map((entry): TableDoc => ({
          id: entry.Identifier,
          title: entry.Title,
          ...(entry.Modified ? { updated: entry.Modified } : {}),
          ...(entry.Period ? { lastPeriod: entry.Period } : {}),
          ...(DISCONTINUED.has(entry.OutputStatus ?? '')
            ? { discontinued: true }
            : {})
        }))
    );

  const tableIndex = createTableIndexLoader(listTables, {
    fallback: options.listFallback,
    ttlSeconds: SEARCH_TTL_SECONDS,
    currentYear: () => now().getUTCFullYear()
  });

  /** One download serves both languages and parallel searches. */
  function catalogue(): Promise<z.infer<typeof catalogueSchema>['value']> {
    loadingCatalogue ??= request(
      odataUrl(`${baseUrl}/ODataCatalog/Tables`, {
        $select: 'Identifier,Title,Language,Modified,OutputStatus,Period'
      }),
      get,
      catalogueSchema,
      (data) => data.value,
      SEARCH_TTL_SECONDS,
      `catalogue:${baseUrl}`
    ).finally(() => {
      loadingCatalogue = undefined;
    });
    return loadingCatalogue;
  }

  /** Large dimensions (for example neighbourhoods) come in pages of 10000 keys. */
  async function keyList(
    firstUrl: string
  ): Promise<z.infer<typeof keysSchema>['value']> {
    const keys: z.infer<typeof keysSchema>['value'] = [];
    let url: string | undefined = firstUrl;
    for (let page = 0; url && page < MAX_KEY_PAGES; page++) {
      const data: z.infer<typeof keysSchema> = await request(
        url,
        get,
        keysSchema,
        (parsed) => parsed,
        METADATA_TTL_SECONDS,
        `meta:${url}`
      );
      keys.push(...data.value);
      url = sameOriginLink(data['odata.nextLink'], firstUrl);
    }
    return keys;
  }

  async function loadTable(tableId: string): Promise<CbsTable> {
    const tableBase = `${baseUrl}/ODataApi/odata/${tableId}`;
    const [info, properties] = await Promise.all([
      request(
        odataUrl(`${tableBase}/TableInfos`, { $select: 'Title' }),
        get,
        tableInfoSchema,
        (data) => data.value[0]?.Title ?? tableId,
        METADATA_TTL_SECONDS,
        `meta:${tableBase}/TableInfos`
      ),
      request(
        odataUrl(`${tableBase}/DataProperties`, {}),
        get,
        propertiesSchema,
        (data) => data.value,
        METADATA_TTL_SECONDS,
        `meta:${tableBase}/DataProperties`
      )
    ]);
    const dimensions = properties.filter((property) =>
      DIMENSION_TYPES.has(property.Type)
    );
    const topics = properties.filter((property) => property.Type === 'Topic');
    const keyLists = await Promise.all(
      dimensions.map((dimension) =>
        keyList(
          odataUrl(`${tableBase}/${dimension.Key}`, { $select: 'Key,Title' })
        )
      )
    );
    const rawKeys = new Map<string, Map<string, string>>();
    const variables: TableVariable[] = dimensions.map((dimension, index) => {
      const keys = keyLists[index] ?? [];
      rawKeys.set(
        dimension.Key,
        new Map(keys.map((key) => [key.Key.trim(), key.Key]))
      );
      return {
        code: dimension.Key,
        label: dimension.Title,
        values: keys.map((key) => key.Key.trim()),
        valueLabels: keys.map((key) => key.Title),
        eliminable: false,
        isTime: dimension.Type === 'TimeDimension'
      };
    });
    variables.push({
      code: TOPICS_CODE,
      label: TOPICS_CODE,
      values: topics.map((topic) => topic.Key),
      valueLabels: topics.map((topic) =>
        topic.Unit ? `${topic.Title} (${topic.Unit})` : topic.Title
      ),
      eliminable: false,
      isTime: false
    });
    return { metadata: { title: info, variables }, rawKeys };
  }

  async function v4Codes(
    firstUrl: string
  ): Promise<z.infer<typeof v4CodesSchema>['value']> {
    const codes: z.infer<typeof v4CodesSchema>['value'] = [];
    let url: string | undefined = firstUrl;
    for (let page = 0; url && page < MAX_KEY_PAGES; page++) {
      const data: z.infer<typeof v4CodesSchema> = await request(
        url,
        get,
        v4CodesSchema,
        (parsed) => parsed,
        METADATA_TTL_SECONDS,
        `meta:${url}`
      );
      codes.push(...data.value);
      url = sameOriginLink(data['@odata.nextLink'], firstUrl);
    }
    return codes;
  }

  /**
   * CBS refuses requests from Cloudflare Workers on the v3 service, so the same table
   * comes from v4. The v4 catalogue has only Dutch tables: an English id maps to its
   * Dutch twin, with Dutch labels.
   */
  async function loadV4Table(tableId: string): Promise<CbsTable> {
    const datasetId = tableId.replace(/ENG$/i, 'NED');
    const tableBase = `${datasetsUrl}/${datasetId}`;
    const [title, dimensions, measures] = await Promise.all([
      request(
        `${tableBase}/Properties`,
        get,
        v4PropertiesSchema,
        (data) => data.Title,
        METADATA_TTL_SECONDS,
        `meta:${tableBase}/Properties`
      ),
      request(
        `${tableBase}/Dimensions`,
        get,
        v4DimensionsSchema,
        (data) => data.value,
        METADATA_TTL_SECONDS,
        `meta:${tableBase}/Dimensions`
      ),
      v4Codes(
        odataUrl(`${tableBase}/MeasureCodes`, {
          $select: 'Identifier,Title,Unit'
        })
      )
    ]);
    const codeLists = await Promise.all(
      dimensions.map((dimension) =>
        v4Codes(
          odataUrl(`${tableBase}/${dimension.Identifier}Codes`, {
            $select: 'Identifier,Title'
          })
        )
      )
    );
    const rawKeys = new Map<string, Map<string, string>>();
    const variables: TableVariable[] = dimensions.map((dimension, index) => {
      const codes = codeLists[index] ?? [];
      rawKeys.set(
        dimension.Identifier,
        new Map(codes.map((code) => [code.Identifier.trim(), code.Identifier]))
      );
      return {
        code: dimension.Identifier,
        label: dimension.Title,
        values: codes.map((code) => code.Identifier.trim()),
        valueLabels: codes.map((code) => code.Title),
        eliminable: false,
        isTime: dimension.Kind === 'TimeDimension'
      };
    });
    variables.push({
      code: TOPICS_CODE,
      label: TOPICS_CODE,
      values: measures.map((measure) => measure.Identifier),
      valueLabels: measures.map((measure) =>
        measure.Unit ? `${measure.Title} (${measure.Unit})` : measure.Title
      ),
      eliminable: false,
      isTime: false
    });
    const mapped = datasetId === tableId ? '' : ` (Dutch table ${datasetId})`;
    return {
      metadata: { title: `${title}${mapped}`, variables },
      rawKeys,
      datasetId
    };
  }

  async function table(tableId: string): Promise<CbsTable> {
    checkTableId(tableId);
    try {
      return await loadTable(tableId);
    } catch (err) {
      if (isNotFound(err)) throw notFound(tableId);
      try {
        return await loadV4Table(tableId);
      } catch (v4Err) {
        if (isNotFound(v4Err)) throw isTransient(err) ? err : notFound(tableId);
        throw v4Err;
      }
    }
  }

  function v4DataUrl(
    datasetId: string,
    filters: { code: string; codes: string[] }[],
    topics: readonly string[]
  ): string {
    const clauses = [
      `Measure in (${topics.map(quoted).join(',')})`,
      ...filters.map(
        (filter) => `${filter.code} in (${filter.codes.map(quoted).join(',')})`
      )
    ];
    return odataUrl(`${datasetsUrl}/${datasetId}/Observations`, {
      $filter: clauses.join(' and ')
    });
  }

  return {
    listTables,

    async search(lang, query, searchOptions) {
      return (await tableIndex(lang)).search(query, searchOptions);
    },

    async getMetadata(_lang, tableId) {
      return (await table(tableId)).metadata;
    },

    async query(_lang, tableId, selections) {
      const { metadata, rawKeys, datasetId } = await table(tableId);
      const byCode = new Map(
        selections.map((selection) => [selection.code, selection])
      );
      const dimensions = metadata.variables.filter(
        (variable) => variable.code !== TOPICS_CODE
      );
      const topicVariable = metadata.variables.find(
        (variable) => variable.code === TOPICS_CODE
      );
      const topics = topicVariable
        ? selectedCodes(topicVariable, byCode.get(TOPICS_CODE))
        : [];
      if (topics.length === 0) {
        throw new PxwebError(
          `Table "${tableId}" has no measures to query.`,
          502
        );
      }
      const unknownTopics = topics.filter(
        (topic) => !topicVariable?.values.includes(topic)
      );
      if (unknownTopics.length) {
        throw new PxwebError(
          `Variable "${TOPICS_CODE}" has no values ${unknownTopics.join(', ')}. Call get_table_metadata to see valid value codes.`,
          400
        );
      }
      const filters: { code: string; codes: string[] }[] = [];
      for (const dimension of dimensions) {
        const selection = byCode.get(dimension.code);
        const codes = selectedCodes(dimension, selection);
        if (!selection || selection.selection.filter === 'all') continue;
        if (codes.length === 0) continue;
        const raw = rawKeys.get(dimension.code);
        filters.push({
          code: dimension.code,
          codes: codes.map((code) => raw?.get(code) ?? code)
        });
      }
      const labels = new Map(
        metadata.variables.map((variable) => [
          variable.code,
          new Map(
            variable.values.map((value, index) => [
              value,
              variable.valueLabels[index] ?? value
            ])
          )
        ])
      );
      const label = (code: string, value: string | number | null): string => {
        const trimmed = String(value ?? '').trim();
        return labels.get(code)?.get(trimmed) ?? trimmed;
      };
      const columns = [
        ...dimensions.map((dimension) => dimension.label),
        TOPICS_CODE,
        'Value'
      ];

      if (datasetId) {
        const url = v4DataUrl(datasetId, filters, topics);
        return request(
          url,
          get,
          observationsSchema,
          (data): FlatTable => {
            if (data['@odata.nextLink']) throw tooLarge();
            return {
              label: metadata.title,
              columns,
              rows: data.value.map((observation) => [
                ...dimensions.map((dimension) =>
                  label(dimension.code, observation[dimension.code] ?? null)
                ),
                label(TOPICS_CODE, observation.Measure ?? null),
                cellValue(observation.Value ?? observation.StringValue ?? null)
              ])
            };
          },
          DATA_TTL_SECONDS,
          `data:${url}`
        );
      }

      const clauses = filters.map(
        (filter) =>
          `(${filter.codes.map((code) => `${filter.code} eq ${quoted(code)}`).join(' or ')})`
      );
      const params: Record<string, string> = {
        $select: [
          ...dimensions.map((dimension) => dimension.code),
          ...topics
        ].join(',')
      };
      if (clauses.length) params.$filter = clauses.join(' and ');
      const url = odataUrl(
        `${baseUrl}/ODataApi/odata/${tableId}/TypedDataSet`,
        params
      );
      return request(
        url,
        get,
        rowsSchema,
        (data): FlatTable => {
          if (data['odata.nextLink']) throw tooLarge();
          const rows: (string | number | null)[][] = [];
          for (const record of data.value) {
            const cells = dimensions.map((dimension) =>
              label(dimension.code, record[dimension.code] ?? null)
            );
            for (const topic of topics) {
              rows.push([
                ...cells,
                label(TOPICS_CODE, topic),
                cellValue(record[topic] ?? null)
              ]);
            }
          }
          return { label: metadata.title, columns, rows };
        },
        DATA_TTL_SECONDS,
        `data:${url}`
      );
    }
  };
}
