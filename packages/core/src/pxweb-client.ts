import { z } from 'zod';

import type { Cache } from '@/cache';
import {
  createRequester,
  DATA_TTL_SECONDS,
  METADATA_TTL_SECONDS,
  PxwebError,
  SEARCH_TTL_SECONDS,
  toFlatTable
} from '@/http';
import { jsonStatDatasetSchema, type FlatTable } from '@/json-stat';
import { rankSearchHits } from '@/search-ranking';
import type { TableDoc } from '@/table-doc';
import { createTableIndexLoader } from '@/table-index';

export { PxwebError } from '@/http';

/** PxWeb answers an unknown table with 400 or 404 on the metadata GET; both are reported as "not found". */
const NOT_FOUND_STATUSES = new Set([400, 404]);
/**
 * One path segment of a database or table id. Croatian ids have spaces, commas,
 * dashes and diacritics; "." and ".." and URL syntax characters are refused.
 */
const SEGMENT_PATTERN =
  /^(?!\.{1,2}$)[^\s/\\?#%\p{Cc}\p{Cs}](?:[^/\\?#%\p{Cc}\p{Cs}]*[^\s/\\?#%\p{Cc}\p{Cs}])?$/u;
const MAX_TABLE_ID_LENGTH = 400;

const searchHitSchema = z.object({
  id: z.string(),
  path: z.string().optional(),
  title: z.string(),
  published: z.string().optional(),
  score: z.number().optional()
});

export type SearchHit = z.infer<typeof searchHitSchema>;

function defaultTableId(hit: SearchHit): string {
  return hit.path ? `${hit.path.replace(/^\/|\/$/g, '')}/${hit.id}` : hit.id;
}

function uniqueByTableId(hits: TableSearchHit[]): TableSearchHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.tableId)) return false;
    seen.add(hit.tableId);
    return true;
  });
}

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
  /** The office has moved the table to its archive; ranked low and marked in results. */
  archived?: true;
}

type ScoredHit = TableSearchHit & { score: number };

/** Clients with a local index leave out discontinued tables unless asked. */
export interface TableSearchOptions {
  includeArchived?: boolean;
}

export interface TableVariable {
  code: string;
  label: string;
  values: string[];
  valueLabels: string[];
  eliminable: boolean;
  isTime: boolean;
  periodsIncomplete?: boolean;
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
  search(
    lang: string,
    query: string,
    options?: TableSearchOptions
  ): Promise<TableSearchHit[]>;
  getMetadata(lang: string, tableId: string): Promise<TableMetadata>;
  /** The full table catalogue, for clients that search a local index. */
  listTables?(lang: string): Promise<TableDoc[]>;
  query(
    lang: string,
    tableId: string,
    selections: PxwebSelection[]
  ): Promise<FlatTable>;
}

/** One API root, or one per language when each language has its own root. */
export type ApiBaseUrl = string | Readonly<Record<string, string>>;

export interface PxwebClientOptions {
  baseUrl: ApiBaseUrl;
  /**
   * Database segment after the language, "Data" on SiStat. With an array, search
   * covers every database in it and each table id starts with its database.
   */
  database?: string | readonly [string, ...string[]];
  cache?: Cache;
  fetch?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
  /** Builds the table id from a search hit; defaults to `path/id`. */
  tableIdFromHit?: (hit: SearchHit) => string;
  /** True when the office keeps the table in its archive, for example by its path. */
  isArchived?: (hit: SearchHit) => boolean;
  /**
   * Full table list (for example a crawled snapshot). When set, search uses a
   * local index over it instead of the API search.
   */
  tableList?: (lang: string) => Promise<readonly TableDoc[]>;
}

export function isValidTableId(tableId: string): boolean {
  return (
    tableId.length <= MAX_TABLE_ID_LENGTH &&
    tableId.split('/').every((segment) => SEGMENT_PATTERN.test(segment))
  );
}

const encodePath = (path: string): string =>
  path.split('/').map(encodeURIComponent).join('/');

function rootForLanguage(
  baseUrl: ApiBaseUrl,
  lang: string
): string | undefined {
  if (typeof baseUrl === 'string') return baseUrl;
  return Object.hasOwn(baseUrl, lang) ? baseUrl[lang] : undefined;
}

export function createPxwebClient(options: PxwebClientOptions): PxwebClient {
  const databases =
    typeof options.database === 'string' || options.database === undefined
      ? [options.database ?? 'Data']
      : [...options.database];
  for (const database of databases) {
    if (!SEGMENT_PATTERN.test(database)) {
      throw new Error(`Invalid PxWeb database "${database}".`);
    }
  }
  const [firstDatabase] = databases;
  const multiDatabase = Array.isArray(options.database);
  const languageRoot = (lang: string): string => {
    const root = rootForLanguage(options.baseUrl, lang);
    if (!root) {
      throw new PxwebError(`Language "${lang}" is not supported.`, 400);
    }
    return `${root.replace(/\/+$/, '')}/${encodeURIComponent(lang)}`;
  };
  const now = options.now ?? (() => new Date());
  const request = createRequester(options);
  const tableIdFor = (hit: SearchHit): string => {
    const custom = options.tableIdFromHit?.(hit).trim();
    return custom && isValidTableId(custom) ? custom : defaultTableId(hit);
  };

  function tableUrl(lang: string, tableId: string): string {
    if (!isValidTableId(tableId)) {
      throw new PxwebError(
        `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
        400
      );
    }
    if (!multiDatabase)
      return `${languageRoot(lang)}/${encodePath(`${firstDatabase}/${tableId}`)}`;
    const [database, ...rest] = tableId.split('/');
    if (rest.length === 0 || !databases.includes(database ?? '')) {
      throw new PxwebError(
        `Table "${tableId}" was not found. Use search_tables to find a table id.`,
        404
      );
    }
    return `${languageRoot(lang)}/${encodePath(tableId)}`;
  }

  async function searchDatabase(
    lang: string,
    database: string,
    query: string
  ): Promise<ScoredHit[]> {
    const url = `${languageRoot(lang)}/${encodeURIComponent(database)}?query=${encodeURIComponent(query)}`;
    const prefix = multiDatabase ? `${database}/` : '';
    return request(
      url,
      { method: 'GET' },
      z.array(searchHitSchema),
      (hits) =>
        hits.map((hit) => ({
          tableId: `${prefix}${tableIdFor(hit)}`,
          title: hit.title,
          published: hit.published,
          ...(options.isArchived?.(hit) ? { archived: true as const } : {}),
          score: hit.score ?? 0
        })),
      SEARCH_TTL_SECONDS,
      `search:${url}`
    );
  }

  const tableIndex = options.tableList
    ? createTableIndexLoader(options.tableList, {
        ttlSeconds: SEARCH_TTL_SECONDS,
        currentYear: () => now().getUTCFullYear()
      })
    : undefined;

  return {
    async search(lang, query, searchOptions) {
      if (tableIndex) {
        languageRoot(lang);
        return (await tableIndex(lang)).search(query, searchOptions);
      }
      const results = await Promise.allSettled(
        databases.map((database) => searchDatabase(lang, database, query))
      );
      const found = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : []
      );
      const failure = results.find((result) => result.status === 'rejected');
      if (found.length === 0 && failure) throw failure.reason;
      const merged = found.flat();
      const ordered = multiDatabase
        ? merged.toSorted((a, b) => b.score - a.score)
        : merged;
      const hits = ordered.map(({ score: _score, ...hit }) => hit);
      return rankSearchHits(uniqueByTableId(hits), now().getUTCFullYear());
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
