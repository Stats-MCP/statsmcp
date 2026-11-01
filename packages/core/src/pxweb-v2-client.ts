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
import { jsonStatDatasetSchema, orderedCodes } from '@/json-stat';
import type {
  PxwebClient,
  PxwebSelection,
  SearchHit,
  TableMetadata,
  TableSearchHit
} from '@/pxweb-client';
import { rankSearchHits } from '@/search-ranking';
import {
  createTableIndexLoader,
  type TableDoc,
  type TableListOptions
} from '@/table-index';

const TABLE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SEARCH_PAGE_SIZE = 50;
const LIST_PAGE_SIZE = 1000;
/** Guards against a run-away loop if the API keeps reporting more pages. */
const MAX_LIST_PAGES = 50;
const NOT_FOUND_STATUSES = new Set([400, 404]);

const tableListSchema = z.object({
  tables: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      updated: z.string().nullish(),
      lastPeriod: z.string().nullish(),
      discontinued: z.boolean().nullish(),
      paths: z.array(z.array(z.object({ label: z.string() }))).nullish()
    })
  ),
  page: z.object({ totalPages: z.number().optional() }).nullish()
});

const metadataSchema = z.object({
  label: z.string(),
  id: z.array(z.string()),
  role: z.object({ time: z.array(z.string()).optional() }).optional(),
  dimension: z.record(
    z.string(),
    z.object({
      label: z.string().optional(),
      category: z.object({
        index: z.union([z.record(z.string(), z.number()), z.array(z.string())]),
        label: z.record(z.string(), z.string()).optional()
      }),
      extension: z.object({ elimination: z.boolean().optional() }).optional()
    })
  )
});

type V2Metadata = z.infer<typeof metadataSchema>;

export interface PxwebV2ClientOptions extends HttpOptions, TableListOptions {
  /** PxWeb API v2 root, for example "https://statistikdatabasen.scb.se/api/v2". */
  baseUrl: string;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
  /** True when the office keeps the table in its archive, for example by its title. */
  isArchived?: (hit: SearchHit) => boolean;
  /** "index" lists every table once an hour and searches locally; "api" uses the API search. */
  search?: 'api' | 'index';
}

function toTableMetadata(data: V2Metadata): TableMetadata {
  const timeCodes = data.role?.time ?? [];
  return {
    title: data.label,
    variables: data.id.map((code) => {
      const dimension = data.dimension[code];
      if (!dimension) {
        throw new PxwebError(
          'PxWeb returned an unexpected response shape.',
          502
        );
      }
      const values = orderedCodes(dimension.category.index);
      return {
        code,
        label: dimension.label ?? code,
        values,
        valueLabels: values.map(
          (value) => dimension.category.label?.[value] ?? value
        ),
        eliminable: dimension.extension?.elimination ?? false,
        isTime: timeCodes.includes(code)
      };
    })
  };
}

function valueCodes(selection: PxwebSelection): string[] {
  const { filter, values } = selection.selection;
  if (filter === 'top') return [`top(${values[0] ?? '1'})`];
  if (filter === 'all') return ['*'];
  return values;
}

/** Client for the PxWeb API v2, with the same interface as the v1 client. */
export function createPxwebV2Client(
  options: PxwebV2ClientOptions
): PxwebClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const now = options.now ?? (() => new Date());
  const request = createRequester(options);

  function tablePath(tableId: string): string {
    if (!TABLE_ID_PATTERN.test(tableId)) {
      throw new PxwebError(
        `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
        400
      );
    }
    return `${baseUrl}/tables/${tableId}`;
  }

  const listTables = async (lang: string): Promise<TableDoc[]> => {
    const docs: TableDoc[] = [];
    for (let page = 1; page <= MAX_LIST_PAGES; page++) {
      const params = new URLSearchParams({
        lang,
        pageSize: String(LIST_PAGE_SIZE),
        pageNumber: String(page)
      });
      const url = `${baseUrl}/tables?${params.toString()}`;
      const data = await request(
        url,
        { method: 'GET' },
        tableListSchema,
        (parsed) => parsed,
        SEARCH_TTL_SECONDS,
        `tables:${url}`
      );
      for (const table of data.tables) {
        const archived =
          table.discontinued === true ||
          (options.isArchived?.({ id: table.id, title: table.label }) ?? false);
        docs.push({
          id: table.id,
          title: table.label,
          path: (table.paths?.[0] ?? []).map((part) => part.label),
          ...(table.updated ? { updated: table.updated } : {}),
          ...(table.lastPeriod ? { lastPeriod: table.lastPeriod } : {}),
          ...(archived ? { discontinued: true } : {})
        });
      }
      const totalPages = data.page?.totalPages;
      const lastPage =
        totalPages === undefined
          ? data.tables.length < LIST_PAGE_SIZE
          : page >= totalPages;
      if (lastPage) break;
    }
    return docs;
  };

  const tableIndex = createTableIndexLoader(listTables, {
    fallback: options.listFallback,
    ttlSeconds: SEARCH_TTL_SECONDS,
    currentYear: () => now().getUTCFullYear()
  });

  return {
    listTables,

    async search(lang, query, searchOptions) {
      if (options.search === 'index') {
        return (await tableIndex(lang)).search(query, searchOptions);
      }
      const params = new URLSearchParams({
        query,
        lang,
        pageSize: String(SEARCH_PAGE_SIZE)
      });
      const url = `${baseUrl}/tables?${params.toString()}`;
      const hits = await request(
        url,
        { method: 'GET' },
        tableListSchema,
        ({ tables }) =>
          tables.map((table): TableSearchHit => {
            const hit = {
              id: table.id,
              title: table.label,
              published: table.updated ?? undefined
            };
            const archived =
              table.discontinued === true ||
              (options.isArchived?.(hit) ?? false);
            return {
              tableId: table.id,
              title: table.label,
              published: hit.published,
              ...(archived ? { archived: true as const } : {})
            };
          }),
        SEARCH_TTL_SECONDS,
        `search:${url}`
      );
      return rankSearchHits(hits, now().getUTCFullYear());
    },

    async getMetadata(lang, tableId) {
      const url = `${tablePath(tableId)}/metadata?${new URLSearchParams({ lang }).toString()}`;
      try {
        return await request(
          url,
          { method: 'GET' },
          metadataSchema,
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
      const params = new URLSearchParams({ lang, outputFormat: 'json-stat2' });
      const url = `${tablePath(tableId)}/data?${params.toString()}`;
      const body = JSON.stringify({
        selection: selections.map((selection) => ({
          variableCode: selection.code,
          valueCodes: valueCodes(selection)
        }))
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
