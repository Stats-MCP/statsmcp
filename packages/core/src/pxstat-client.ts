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
import { jsonStatDatasetSchema } from '@/json-stat';
import type {
  PxwebClient,
  PxwebSelection,
  TableMetadata
} from '@/pxweb-client';
import { createTableIndexLoader, type TableDoc } from '@/table-index';

const MATRIX_PATTERN = /^[A-Za-z0-9]+$/;

export interface PxstatClientOptions extends HttpOptions {
  /** PxStat root without the API name, for example "https://ws.cso.ie/public". */
  baseUrl: string;
  /** Full table list (the crawled snapshot); PxStat has no search. */
  tableList?: (lang: string) => Promise<readonly TableDoc[]>;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

const metadataSchema = z.object({
  label: z.string(),
  id: z.array(z.string()),
  dimension: z.record(
    z.string(),
    z.object({
      label: z.string().optional(),
      category: z.object({
        index: z.union([z.array(z.string()), z.record(z.string(), z.number())]),
        label: z.record(z.string(), z.string()).optional()
      })
    })
  ),
  role: z.object({ time: z.array(z.string()).optional() }).optional(),
  extension: z
    .object({
      elimination: z.record(z.string(), z.string().nullable()).optional()
    })
    .optional()
});

const rpcSchema = z.object({
  result: jsonStatDatasetSchema.nullable().optional(),
  error: z.object({ message: z.string().optional() }).optional()
});

interface PxstatTable {
  metadata: TableMetadata;
  elimination: Readonly<Record<string, string>>;
}

function categoryCodes(
  index: z.infer<
    typeof metadataSchema
  >['dimension'][string]['category']['index']
): string[] {
  if (Array.isArray(index)) return index;
  return Object.entries(index)
    .toSorted((a, b) => a[1] - b[1])
    .map(([code]) => code);
}

function toTable(data: z.infer<typeof metadataSchema>): PxstatTable {
  const elimination = Object.fromEntries(
    Object.entries(data.extension?.elimination ?? {}).filter(
      (entry): entry is [string, string] => entry[1] !== null
    )
  );
  const timeCodes = new Set(data.role?.time ?? []);
  return {
    elimination,
    metadata: {
      title: data.label,
      variables: data.id.map((code) => {
        const dimension = data.dimension[code];
        const values = dimension ? categoryCodes(dimension.category.index) : [];
        return {
          code,
          label: dimension?.label ?? code,
          values,
          valueLabels: values.map(
            (value) => dimension?.category.label?.[value] ?? value
          ),
          eliminable: Object.hasOwn(elimination, code),
          isTime: timeCodes.has(code)
        };
      })
    }
  };
}

function notFound(tableId: string): PxwebError {
  return new PxwebError(
    `Table "${tableId}" was not found. Use search_tables to find a table id.`,
    404
  );
}

function checkTableId(tableId: string): void {
  if (!MATRIX_PATTERN.test(tableId)) {
    throw new PxwebError(
      `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
      400
    );
  }
}

function requestedCodes(
  values: readonly string[],
  selection: PxwebSelection | undefined,
  total: string | undefined
): string[] | undefined {
  if (!selection) return total === undefined ? undefined : [total];
  const { filter, values: chosen } = selection.selection;
  if (filter === 'all') return undefined;
  if (filter === 'top') {
    return values.slice(-Math.max(1, Number(chosen[0]) || 1));
  }
  return chosen;
}

export function createPxstatClient(options: PxstatClientOptions): PxwebClient {
  const root = options.baseUrl.replace(/\/+$/, '');
  const now = options.now ?? (() => new Date());
  const request = createRequester(options);
  const tableIndex = createTableIndexLoader(
    async (lang) => {
      if (!options.tableList) {
        throw new PxwebError('The table list is not available now.', 503);
      }
      return options.tableList(lang);
    },
    {
      ttlSeconds: SEARCH_TTL_SECONDS,
      currentYear: () => now().getUTCFullYear()
    }
  );

  async function loadTable(
    lang: string,
    tableId: string
  ): Promise<PxstatTable> {
    checkTableId(tableId);
    const url = `${root}/api.restful/PxStat.Data.Cube_API.ReadMetadata/${tableId}/JSON-stat/2.0/${encodeURIComponent(lang)}`;
    try {
      return await request(
        url,
        { method: 'GET' },
        metadataSchema,
        toTable,
        METADATA_TTL_SECONDS,
        `meta:${url}`
      );
    } catch (err) {
      if (err instanceof PxwebError && err.status === 404)
        throw notFound(tableId);
      throw err;
    }
  }

  return {
    async search(lang, query, searchOptions) {
      return (await tableIndex(lang)).search(query, searchOptions);
    },

    async getMetadata(lang, tableId) {
      return (await loadTable(lang, tableId)).metadata;
    },

    async query(lang, tableId, selections) {
      const { metadata, elimination } = await loadTable(lang, tableId);
      const byCode = new Map(
        selections.map((selection) => [selection.code, selection])
      );
      const dimension: Record<string, { category: { index: string[] } }> = {};
      for (const variable of metadata.variables) {
        const codes = requestedCodes(
          variable.values,
          byCode.get(variable.code),
          elimination[variable.code]
        );
        if (codes) dimension[variable.code] = { category: { index: codes } };
      }
      const params = {
        class: 'query',
        id: Object.keys(dimension),
        dimension,
        extension: {
          language: { code: lang },
          format: { type: 'JSON-stat', version: '2.0' },
          matrix: tableId
        },
        version: '2.0'
      };
      const body = JSON.stringify({
        jsonrpc: '2.0',
        method: 'PxStat.Data.Cube_API.ReadDataset',
        params,
        id: 1
      });
      const url = `${root}/api.jsonrpc`;
      return request(
        url,
        {
          method: 'POST',
          body,
          headers: { 'content-type': 'application/json' }
        },
        rpcSchema,
        (data) => {
          if (data.error) {
            throw new PxwebError(
              `PxStat refused the query: ${data.error.message ?? 'unknown error'}`,
              400
            );
          }
          if (!data.result) throw notFound(tableId);
          return toFlatTable(data.result);
        },
        DATA_TTL_SECONDS,
        `data:${url}:${body}`
      );
    }
  };
}
