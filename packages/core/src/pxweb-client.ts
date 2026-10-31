import { z } from 'zod';

import { createMemoryCache, type Cache } from '@/cache';
import {
  flattenJsonStat,
  jsonStatDatasetSchema,
  type FlatTable
} from '@/json-stat';

const SEARCH_TTL_SECONDS = 60 * 60;
const METADATA_TTL_SECONDS = 24 * 60 * 60;
const DATA_TTL_SECONDS = 60 * 60;
const ERROR_BODY_MAX_CHARS = 300;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const DATABASE_PATTERN = /^[A-Za-z0-9_-]+$/;
const TABLE_ID_PATTERN = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.px$/;

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
    const body = await response.text();
    if (!response.ok) {
      throw new PxwebError(
        `PxWeb returned HTTP ${response.status}: ${body.slice(0, ERROR_BODY_MAX_CHARS)}`,
        response.status
      );
    }
    if (body.length > MAX_RESPONSE_BYTES) {
      throw new PxwebError('PxWeb response is too large.', 502);
    }
    return body;
  }

  async function request<T>(
    url: string,
    init: RequestInit,
    schema: z.ZodType<T>,
    ttlSeconds: number,
    cacheKey: string
  ): Promise<T> {
    const cached = await cache.get(cacheKey);
    if (cached !== undefined) return parseBody(cached, schema);

    const body = await fetchBody(url, init);
    const data = parseBody(body, schema);
    await cache.set(cacheKey, body, ttlSeconds);
    return data;
  }

  function tableUrl(lang: string, tableId: string): string {
    if (!isValidTableId(tableId)) {
      throw new PxwebError(
        `Invalid table id "${tableId}". Expected an id like "0156101S.px".`,
        400
      );
    }
    return `${baseUrl}/${encodeURIComponent(lang)}/${database}/${tableId}`;
  }

  return {
    async search(lang, query) {
      const url = `${baseUrl}/${encodeURIComponent(lang)}/${database}?query=${encodeURIComponent(query)}`;
      const hits = await request(
        url,
        { method: 'GET' },
        z.array(searchHitSchema),
        SEARCH_TTL_SECONDS,
        `search:${url}`
      );
      return hits.map((hit) => ({
        tableId: hit.path
          ? `${hit.path.replace(/^\/|\/$/g, '')}/${hit.id}`
          : hit.id,
        title: hit.title,
        published: hit.published
      }));
    },

    async getMetadata(lang, tableId) {
      const url = tableUrl(lang, tableId);
      const parsed = await request(
        url,
        { method: 'GET' },
        metadataSchema,
        METADATA_TTL_SECONDS,
        `meta:${url}`
      );
      return {
        title: parsed.title,
        variables: parsed.variables.map((variable) => ({
          code: variable.code,
          label: variable.text,
          values: variable.values,
          valueLabels: variable.valueTexts,
          eliminable: variable.elimination ?? false,
          isTime: variable.time ?? false
        }))
      };
    },

    async query(lang, tableId, selections) {
      const url = tableUrl(lang, tableId);
      const body = JSON.stringify({
        query: selections,
        response: { format: 'json-stat2' }
      });
      const dataset = await request(
        url,
        {
          method: 'POST',
          body,
          headers: { 'content-type': 'application/json' }
        },
        jsonStatDatasetSchema,
        DATA_TTL_SECONDS,
        `data:${url}:${body}`
      );
      return flattenJsonStat(dataset);
    }
  };
}
