import { z } from 'zod';

import { createMemoryCache, type Cache } from '@/cache';
import {
  flattenJsonStat,
  jsonStatDatasetSchema,
  type FlatTable,
  type JsonStatDataset
} from '@/json-stat';
import { rankSearchHits } from '@/search-ranking';

const SEARCH_TTL_SECONDS = 60 * 60;
const METADATA_TTL_SECONDS = 24 * 60 * 60;
const DATA_TTL_SECONDS = 60 * 60;
const ERROR_BODY_MAX_CHARS = 300;
const DEFAULT_TIMEOUT_MS = 30_000;
/** PxWeb answers an unknown table with 400 or 404 on the metadata GET; both are reported as "not found". */
const NOT_FOUND_STATUSES = new Set([400, 404]);
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const DATABASE_PATTERN = /^[A-Za-z0-9_-]+$/;
const TABLE_ID_PATTERN = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.px|\.PX)?$/;

const searchHitSchema = z.object({
  id: z.string(),
  path: z.string().optional(),
  title: z.string(),
  published: z.string().optional()
});

const variableSchema = z.object({
  code: z.string(),
  text: z.string(),
  values: z.array(z.string()),
  valueTexts: z.array(z.string()),
  elimination: z.boolean().optional(),
  time: z.boolean().optional()
});

const metadataSchema = z.object({
  title: z.string(),
  variables: z.array(variableSchema)
});

export interface TableSearchHit {
  tableId: string;
  title: string;
  published: string | undefined;
}

export interface TableVariable {
  code: string;
  label: string;
  values: string[];
  valueLabels: string[];
  eliminable: boolean;
  isTime: boolean;
}

export interface TableMetadata {
  title: string;
  variables: TableVariable[];
}

export interface PxwebSelection {
  code: string;
  selection: { filter: 'item' | 'top' | 'all'; values: string[] };
}

export interface PxwebClient {
  search(lang: string, query: string): Promise<TableSearchHit[]>;
  getMetadata(lang: string, tableId: string): Promise<TableMetadata>;
  query(
    lang: string,
    tableId: string,
    selections: PxwebSelection[]
  ): Promise<FlatTable>;
}

export interface PxwebClientOptions {
  baseUrl: string;
  /** Database segment after the language, "Data" on SiStat. */
  database?: string;
  cache?: Cache;
  fetch?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

export class PxwebError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'PxwebError';
  }
}

export function isValidTableId(tableId: string): boolean {
  return TABLE_ID_PATTERN.test(tableId);
}

async function readCappedText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new PxwebError('PxWeb response is too large.', 502);
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch (err) {
    if (err instanceof PxwebError) throw err;
    throw new PxwebError(
      `PxWeb response could not be read: ${err instanceof Error ? err.message : String(err)}`,
      502
    );
  }
  return text + decoder.decode();
}

function toFlatTable(dataset: JsonStatDataset): FlatTable {
  try {
    return flattenJsonStat(dataset);
  } catch {
    throw new PxwebError('PxWeb returned an invalid JSON-stat dataset.', 502);
  }
}

function parseBody<T>(body: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(body.replace(/^\uFEFF/, ''));
  } catch {
    throw new PxwebError('PxWeb returned a response that is not JSON.', 502);
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new PxwebError('PxWeb returned an unexpected response shape.', 502);
  }
  return result.data;
}

export function createPxwebClient(options: PxwebClientOptions): PxwebClient {
  const database = options.database ?? 'Data';
  if (!DATABASE_PATTERN.test(database)) {
    throw new Error(`Invalid PxWeb database "${database}".`);
  }
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const cache = options.cache ?? createMemoryCache();
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? (() => new Date());
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.userAgent) headers['user-agent'] = options.userAgent;

  async function fetchBody(url: string, init: RequestInit): Promise<string> {
    let response: Response;
    try {
      response = await doFetch(url, {
        ...init,
        headers: { ...headers, ...init.headers },
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (err) {
      throw new PxwebError(
        `PxWeb request failed: ${err instanceof Error ? err.message : String(err)}`,
        502
      );
    }
    const declaredSize = Number(response.headers.get('content-length') ?? 0);
    if (declaredSize > MAX_RESPONSE_BYTES) {
      throw new PxwebError('PxWeb response is too large.', 502);
    }
    const body = await readCappedText(response);
    if (!response.ok) {
      throw new PxwebError(
        `PxWeb returned HTTP ${response.status}: ${body.slice(0, ERROR_BODY_MAX_CHARS)}`,
        response.status
      );
    }
    return body;
  }

  async function request<T, R>(
    url: string,
    init: RequestInit,
    schema: z.ZodType<T>,
    map: (data: T) => R,
    ttlSeconds: number,
    cacheKey: string
  ): Promise<R> {
    const cached = await cache.get(cacheKey);
    if (cached !== undefined) return map(parseBody(cached, schema));

    const body = await fetchBody(url, init);
    const result = map(parseBody(body, schema));
    await cache.set(cacheKey, body, ttlSeconds);
    return result;
  }

  function tableUrl(lang: string, tableId: string): string {
    if (!isValidTableId(tableId)) {
      throw new PxwebError(
        `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
        400
      );
    }
    return `${baseUrl}/${encodeURIComponent(lang)}/${database}/${tableId}`;
  }

  return {
    async search(lang, query) {
      const url = `${baseUrl}/${encodeURIComponent(lang)}/${database}?query=${encodeURIComponent(query)}`;
      return request(
        url,
        { method: 'GET' },
        z.array(searchHitSchema),
        (hits) =>
          rankSearchHits(
            hits.map((hit) => ({
              tableId: hit.path
                ? `${hit.path.replace(/^\/|\/$/g, '')}/${hit.id}`
                : hit.id,
              title: hit.title,
              published: hit.published
            })),
            now().getUTCFullYear()
          ),
        SEARCH_TTL_SECONDS,
        `search:${url}`
      );
    },

    async getMetadata(lang, tableId) {
      const url = tableUrl(lang, tableId);
      try {
        return await request(
          url,
          { method: 'GET' },
          metadataSchema,
          (parsed) => ({
            title: parsed.title,
            variables: parsed.variables.map((variable) => ({
              code: variable.code,
              label: variable.text,
              values: variable.values,
              valueLabels: variable.valueTexts,
              eliminable: variable.elimination ?? false,
              isTime: variable.time ?? false
            }))
          }),
          METADATA_TTL_SECONDS,
          `meta:${url}`
        );
      } catch (err) {
        if (err instanceof PxwebError && NOT_FOUND_STATUSES.has(err.status)) {
          throw new PxwebError(
            `Table "${tableId}" was not found. Use search_tables to find a table id.`,
            404
          );
        }
        throw err;
      }
    },

    async query(lang, tableId, selections) {
      const url = tableUrl(lang, tableId);
      const body = JSON.stringify({
        query: selections,
        response: { format: 'json-stat2' }
      });
      return request(
        url,
        {
          method: 'POST',
          body,
          headers: { 'content-type': 'application/json' }
        },
        jsonStatDatasetSchema,
        toFlatTable,
        DATA_TTL_SECONDS,
        `data:${url}:${body}`
      );
    }
  };
}
