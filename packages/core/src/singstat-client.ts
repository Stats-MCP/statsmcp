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
  TableSearchHit
} from '@/pxweb-client';
import { rankSearchHits } from '@/search-ranking';
import { searchTitles } from '@/title-search';

const TABLE_ID_PATTERN = /^[A-Za-z0-9]+$/;
const SERIES_CODE = 'series';
const TIME_CODE = 'time';
const TIME_SERIES = 'time series';

const searchSchema = z.object({
  StatusCode: z.number().nullish(),
  Message: z.string().nullish(),
  Data: z
    .object({
      records: z
        .array(
          z.object({
            id: z.string(),
            title: z.string(),
            tableType: z.string().nullish()
          })
        )
        .nullish()
    })
    .nullish()
});

const metadataSchema = z.object({
  StatusCode: z.number().nullish(),
  Message: z.string().nullish(),
  Data: z
    .object({
      records: z.object({
        title: z.string(),
        row: z.array(
          z.object({
            seriesNo: z.string(),
            rowText: z.string(),
            uoM: z.string().nullish()
          })
        )
      })
    })
    .nullish()
});

const dataSchema = z.object({
  StatusCode: z.number().nullish(),
  Message: z.string().nullish(),
  Data: z
    .object({
      row: z.array(
        z.object({
          seriesNo: z.string(),
          rowText: z.string(),
          uoM: z.string().nullish(),
          columns: z.array(
            z.object({ key: z.string(), value: z.string().nullish() })
          )
        })
      )
    })
    .nullish()
});

export interface SingstatClientOptions extends HttpOptions {
  /** Table Builder API root, for example "https://tablebuilder.singstat.gov.sg/api/table". */
  baseUrl: string;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

interface Envelope<T> {
  StatusCode?: number | null;
  Message?: string | null;
  Data?: T | null;
}

/** The API can answer HTTP 200 with an error status in the body. */
function unwrap<T>(envelope: Envelope<T>): T {
  const status = envelope.StatusCode ?? 200;
  if (status !== 200 || !envelope.Data) {
    throw new PxwebError(
      `SingStat returned ${status}: ${envelope.Message ?? 'no data'}`,
      status === 200 ? 502 : status
    );
  }
  return envelope.Data;
}

function checkTableId(tableId: string): void {
  if (!TABLE_ID_PATTERN.test(tableId)) {
    throw new PxwebError(
      `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
      400
    );
  }
}

function notFound(tableId: string): PxwebError {
  return new PxwebError(
    `Table "${tableId}" was not found. Use search_tables to find a table id.`,
    404
  );
}

function numberOrNull(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const parsed = Number(value.replaceAll(',', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function selected(
  values: string[],
  selection: PxwebSelection | undefined
): string[] | undefined {
  if (!selection || selection.selection.filter === 'all') return undefined;
  const picked =
    selection.selection.filter === 'top'
      ? values.slice(-Math.max(1, Number(selection.selection.values[0]) || 1))
      : selection.selection.values;
  // Every value selected: leave the filter out, so the URL stays short.
  return picked.length >= values.length ? undefined : picked;
}

/**
 * Client for the SingStat Table Builder API of the Singapore Department of
 * Statistics. Tables are series (rows) by periods (columns); the client shows
 * them as two variables, "series" and "time".
 */
export function createSingstatClient(
  options: SingstatClientOptions
): PxwebClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const now = options.now ?? (() => new Date());
  const request = createRequester(options);
  const get: RequestInit = { method: 'GET' };

  async function metadata(tableId: string): Promise<TableMetadata> {
    const url = `${baseUrl}/metadata/${tableId}`;
    const records = await request(
      url,
      get,
      metadataSchema,
      (data) => unwrap(data).records,
      METADATA_TTL_SECONDS,
      `meta:${url}`
    ).catch((err: unknown) => {
      if (err instanceof PxwebError && err.status === 404) {
        throw notFound(tableId);
      }
      throw err;
    });
    const first = records.row[0];
    if (!first) throw notFound(tableId);
    const periodsUrl = `${baseUrl}/tabledata/${tableId}?seriesNoORrowNo=${encodeURIComponent(first.seriesNo)}`;
    const periods = await request(
      periodsUrl,
      get,
      dataSchema,
      (data) => unwrap(data).row[0]?.columns.map((column) => column.key) ?? [],
      METADATA_TTL_SECONDS,
      `meta:${periodsUrl}`
    );
    return {
      title: records.title,
      variables: [
        {
          code: SERIES_CODE,
          label: 'Series',
          values: records.row.map((row) => row.seriesNo),
          valueLabels: records.row.map((row) =>
            row.uoM ? `${row.rowText} (${row.uoM})` : row.rowText
          ),
          eliminable: false,
          isTime: false
        },
        {
          code: TIME_CODE,
          label: 'Period',
          values: periods,
          valueLabels: periods,
          eliminable: false,
          isTime: true
        }
      ]
    };
  }

  return {
    async search(_lang, query) {
      const params = new URLSearchParams({
        keyword: query,
        searchOption: 'all'
      });
      const url = `${baseUrl}/resourceid?${params.toString()}`;
      const hits = await request(
        url,
        get,
        searchSchema,
        (data) =>
          (unwrap(data).records ?? [])
            .filter(
              (record) => (record.tableType ?? TIME_SERIES) === TIME_SERIES
            )
            .map((record): TableSearchHit => ({
              tableId: record.id,
              title: record.title,
              published: undefined
            })),
        SEARCH_TTL_SECONDS,
        `search:${url}`
      );
      const inTitle = searchTitles(hits, query, 'en');
      const titled = new Set(inTitle.map((hit) => hit.tableId));
      return rankSearchHits(
        [...inTitle, ...hits.filter((hit) => !titled.has(hit.tableId))],
        now().getUTCFullYear()
      );
    },

    async getMetadata(_lang, tableId) {
      checkTableId(tableId);
      return metadata(tableId);
    },

    async query(_lang, tableId, selections) {
      checkTableId(tableId);
      const table = await metadata(tableId);
      const byCode = new Map(
        selections.map((selection) => [selection.code, selection])
      );
      const [seriesVariable, timeVariable] = table.variables;
      const series = selected(
        seriesVariable?.values ?? [],
        byCode.get(SERIES_CODE)
      );
      const periods = selected(
        timeVariable?.values ?? [],
        byCode.get(TIME_CODE)
      );
      if (series?.length === 0 || periods?.length === 0) {
        throw new PxwebError(
          'Select at least one value for every variable.',
          400
        );
      }
      const params: string[] = [];
      if (series)
        params.push(`seriesNoORrowNo=${encodeURIComponent(series.join(','))}`);
      if (periods)
        params.push(`timeFilter=${encodeURIComponent(periods.join(','))}`);
      const url = `${baseUrl}/tabledata/${tableId}${params.length ? `?${params.join('&')}` : ''}`;
      return request(
        url,
        get,
        dataSchema,
        (data): FlatTable => {
          const rows = unwrap(data).row.flatMap((row) =>
            row.columns.map((column) => [
              row.rowText,
              row.uoM ?? '',
              column.key,
              numberOrNull(column.value)
            ])
          );
          if (rows.length === 0) {
            throw new PxwebError(
              'No data for this selection. Select other series or periods.',
              404
            );
          }
          return {
            label: table.title,
            columns: ['Series', 'Unit', 'Period', 'Value'],
            rows
          };
        },
        DATA_TTL_SECONDS,
        `data:${url}`
      );
    }
  };
}
