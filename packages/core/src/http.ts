import { createMemoryCache, type Cache } from '@/cache';
import {
  flattenJsonStat,
  type FlatTable,
  type JsonStatDataset
} from '@/json-stat';

import type { z } from 'zod';

export const SEARCH_TTL_SECONDS = 60 * 60;
export const METADATA_TTL_SECONDS = 24 * 60 * 60;
export const DATA_TTL_SECONDS = 60 * 60;
const ERROR_BODY_MAX_CHARS = 300;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

export class PxwebError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'PxwebError';
  }
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

export function toFlatTable(dataset: JsonStatDataset): FlatTable {
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

export interface HttpOptions {
  cache?: Cache;
  fetch?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
}

export type Requester = <T, R>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  map: (data: T) => R,
  ttlSeconds: number,
  cacheKey: string
) => Promise<R>;

function createFetcher(
  options: HttpOptions
): (url: string, init: RequestInit) => Promise<string> {
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
    const body = await readCappedText(response);
    if (!response.ok) {
      throw new PxwebError(
        `PxWeb returned HTTP ${response.status}: ${body.slice(0, ERROR_BODY_MAX_CHARS)}`,
        response.status
      );
    }
    return body;
  }

  return fetchBody;
}

/** Fetches with a timeout and a size cap, caches raw bodies and parses them through a schema. */
export function createRequester(options: HttpOptions): Requester {
  const cache = options.cache ?? createMemoryCache();
  const fetchBody = createFetcher(options);

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

  return request;
}

export type TextRequester = <R>(
  url: string,
  init: RequestInit,
  map: (text: string) => R,
  ttlSeconds: number,
  cacheKey: string
) => Promise<R>;

/** Like `createRequester`, for APIs that answer with XML or TSV instead of JSON. */
export function createTextRequester(options: HttpOptions): TextRequester {
  const cache = options.cache ?? createMemoryCache();
  const fetchBody = createFetcher(options);

  return async (url, init, map, ttlSeconds, cacheKey) => {
    const cached = await cache.get(cacheKey);
    if (cached !== undefined) return map(cached);
    const body = await fetchBody(url, init);
    const result = map(body);
    await cache.set(cacheKey, body, ttlSeconds);
    return result;
  };
}
