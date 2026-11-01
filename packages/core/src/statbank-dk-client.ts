import { z } from 'zod';

import {
  createRequester,
  DATA_TTL_SECONDS,
  METADATA_TTL_SECONDS,
  PxwebError,
  SEARCH_TTL_SECONDS,
  toFlatTable,
  type HttpOptions
} from '@/http';
import type { JsonStatDataset } from '@/json-stat';
import type {
  PxwebClient,
  PxwebSelection,
  TableMetadata,
  TableSearchHit
} from '@/pxweb-client';
import { rankSearchHits } from '@/search-ranking';
import { searchTitles } from '@/title-search';

const TABLE_ID_PATTERN = /^[\p{L}\p{N}_-]+$/u;
const NOT_FOUND_STATUSES = new Set([400, 404]);

const tableListSchema = z.array(
  z.object({
    id: z.string(),
    text: z.string(),
    updated: z.string().nullish(),
    active: z.boolean().optional()
  })
);

const tableInfoSchema = z.object({
  text: z.string(),
  variables: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      elimination: z.boolean().optional(),
      time: z.boolean().optional(),
      values: z.array(z.object({ id: z.string(), text: z.string() }))
    })
  )
});

const categorySchema = z.object({
  label: z.string().optional(),
  category: z.object({
    index: z.union([z.record(z.string(), z.number()), z.array(z.string())]),
    label: z.record(z.string(), z.string()).optional()
  })
});

/** JSON-stat 1.0 as StatBank returns it: id and size sit inside `dimension`. */
const jsonStat1Schema = z.object({
  dataset: z.object({
    label: z.string().optional(),
    source: z.string().optional(),
    dimension: z.record(z.string(), z.unknown()),
    value: z.array(z.number().nullable())
  })
});

const dimensionKeysSchema = z.object({
  id: z.array(z.string()),
  size: z.array(z.number())
});

export interface StatbankDkClientOptions extends HttpOptions {
  /** StatBank API root, for example "https://api.statbank.dk/v1". */
  baseUrl: string;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

function toJsonStat2(raw: z.infer<typeof jsonStat1Schema>): JsonStatDataset {
  const { dimension, label, source, value } = raw.dataset;
  const keys = dimensionKeysSchema.safeParse(dimension);
  if (!keys.success) {
    throw new PxwebError('PxWeb returned an unexpected response shape.', 502);
  }
  const dimensions: JsonStatDataset['dimension'] = {};
  for (const id of keys.data.id) {
    const parsed = categorySchema.safeParse(dimension[id]);
    if (!parsed.success) {
      throw new PxwebError('PxWeb returned an unexpected response shape.', 502);
    }
    dimensions[id] = parsed.data;
  }
  return {
    class: 'dataset',
    label,
    source,
    id: keys.data.id,
    size: keys.data.size,
    dimension: dimensions,
    value
  };
}

function toTableMetadata(info: z.infer<typeof tableInfoSchema>): TableMetadata {
  return {
    title: info.text,
    variables: info.variables.map((variable) => ({
      code: variable.id,
      label: variable.text,
      values: variable.values.map((value) => value.id),
      valueLabels: variable.values.map((value) => value.text),
      eliminable: variable.elimination ?? false,
      isTime: variable.time ?? false
    }))
  };
}

function valueCodes(selection: PxwebSelection): string[] {
  const { filter, values } = selection.selection;
  if (filter === 'top') return [`(-n+${values[0] ?? '1'})`];
  if (filter === 'all') return ['*'];
  return values;
}

function checkTableId(tableId: string): void {
  if (!TABLE_ID_PATTERN.test(tableId)) {
    throw new PxwebError(
      `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
      400
    );
  }
}

function post(body: Record<string, unknown>): RequestInit {
  return {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' }
  };
}

/**
 * Client for the StatBank API of Statistics Denmark. Its table search ignores the
 * search text, so the client loads the full table list and searches it locally.
 */
export function createStatbankDkClient(
  options: StatbankDkClientOptions
): PxwebClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const now = options.now ?? (() => new Date());
  const request = createRequester(options);

  const loading = new Map<string, Promise<TableSearchHit[]>>();

  /** Parallel searches (a query and its aliases) share one download of the list. */
  function tableList(lang: string): Promise<TableSearchHit[]> {
    const pending = loading.get(lang);
    if (pending) return pending;
    const url = `${baseUrl}/tables`;
    const promise = request(
      url,
      post({ lang }),
      tableListSchema,
      (list) =>
        list.map((table): TableSearchHit => ({
          tableId: table.id,
          title: table.text,
          published: table.updated ?? undefined,
          ...(table.active === false ? { archived: true as const } : {})
        })),
      SEARCH_TTL_SECONDS,
      `tables:${url}:${lang}`
    ).finally(() => loading.delete(lang));
    loading.set(lang, promise);
    return promise;
  }

  return {
    async search(lang, query) {
      const tables = await tableList(lang);
      return rankSearchHits(
        searchTitles(tables, query, lang),
        now().getUTCFullYear()
      );
    },

    async getMetadata(lang, tableId) {
      checkTableId(tableId);
      const url = `${baseUrl}/tableinfo/${encodeURIComponent(tableId)}?${new URLSearchParams({ lang }).toString()}`;
      try {
        return await request(
          url,
          { method: 'GET' },
          tableInfoSchema,
          toTableMetadata,
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
      checkTableId(tableId);
      const url = `${baseUrl}/data`;
      const body = {
        table: tableId,
        format: 'JSONSTAT',
        lang,
        variables: selections.map((selection) => ({
          code: selection.code,
          values: valueCodes(selection)
        }))
      };
      return request(
        url,
        post(body),
        jsonStat1Schema,
        (raw) => toFlatTable(toJsonStat2(raw)),
        DATA_TTL_SECONDS,
        `data:${url}:${JSON.stringify(body)}`
      );
    }
  };
}
