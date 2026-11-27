import { z } from 'zod';

import {
  createRequester,
  DATA_TTL_SECONDS,
  METADATA_TTL_SECONDS,
  PxwebError,
  SEARCH_TTL_SECONDS,
  type HttpOptions
} from '@/http';
import type {
  PxwebClient,
  PxwebSelection,
  TableMetadata,
  TableVariable
} from '@/pxweb-client';
import { rankSearchHits } from '@/search-ranking';

const ONS_SITE = 'https://www.ons.gov.uk';
const TABLE_ID_PATTERN = /^([A-Z0-9]{1,20})\/([A-Z0-9]{1,20})$/i;
const FREQUENCY_CODE = 'frequency';
const FREQUENCY_LABEL = 'Frequency';
const TIME_CODE = 'period';
const TIME_LABEL = 'Period';
const SEARCH_LIMIT = 50;
const DEFAULT_MAX_CELLS = 5000;
const MAX_KNOWN_URIS = 1000;
const FREQUENCIES = [
  { key: 'years', code: 'A', label: 'Annual' },
  { key: 'quarters', code: 'Q', label: 'Quarterly' },
  { key: 'months', code: 'M', label: 'Monthly' }
] as const;
const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC'
];

export interface OnsClientOptions extends HttpOptions {
  /** Search API root, for example "https://api.beta.ons.gov.uk/v1". */
  baseUrl: string;
  /** Upper limit of rows in one query result. */
  maxCells?: number;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

const searchSchema = z.object({
  items: z.array(
    z.object({
      cdid: z.string().nullish(),
      dataset_id: z.string().nullish(),
      release_date: z.string().nullish(),
      title: z.string(),
      uri: z.string()
    })
  )
});

const pointsSchema = z
  .array(
    z.object({
      date: z.string(),
      value: z.string(),
      label: z.string().nullish()
    })
  )
  .nullish();

const seriesSchema = z.object({
  description: z.object({
    title: z.string(),
    unit: z.string().nullish(),
    preUnit: z.string().nullish(),
    datasetId: z.string(),
    releaseDate: z.string().nullish(),
    nextRelease: z.string().nullish()
  }),
  years: pointsSchema,
  quarters: pointsSchema,
  months: pointsSchema
});

type SearchItem = z.infer<typeof searchSchema>['items'][number];
type Series = z.infer<typeof seriesSchema>;

interface Point {
  code: string;
  label: string;
  value: number | null;
}

interface OnsTable {
  metadata: TableMetadata;
  points: ReadonlyMap<string, readonly Point[]>;
}

// PxwebPreset.tableUrl is synchronous and gets only the id, but the page uri has a
// topic path that only a search gives. Every resolution in this process is noted here.
const knownUris = new Map<string, string>();

function rememberUri(tableId: string, uri: string): void {
  knownUris.delete(tableId);
  knownUris.set(tableId, uri);
  const oldest = knownUris.keys().next().value;
  if (knownUris.size > MAX_KNOWN_URIS && oldest !== undefined) {
    knownUris.delete(oldest);
  }
}

/** The series page after this process resolved the id, otherwise an ONS search for its CDID. */
export function onsTableUrl(tableId: string): string {
  const id = tableId.trim().toUpperCase();
  const uri = knownUris.get(id);
  if (uri) return `${ONS_SITE}${uri}`;
  const cdid = id.split('/').at(-1) ?? id;
  return `${ONS_SITE}/search?q=${encodeURIComponent(cdid)}&filter=time_series`;
}

function hitId(item: SearchItem): string | undefined {
  if (!item.cdid || !item.dataset_id || !item.uri.startsWith('/')) {
    return undefined;
  }
  const id = `${item.dataset_id}/${item.cdid}`.toUpperCase();
  return TABLE_ID_PATTERN.test(id) ? id : undefined;
}

/** ONS writes UK midnight as UTC ("2026-09-29T23:00Z" is 30 September); noon keeps the UK day. */
function ukDate(timestamp: string | null | undefined): string | undefined {
  const time = Date.parse(timestamp ?? '');
  if (Number.isNaN(time)) return undefined;
  return new Date(time + 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** "2025" → "2025", "2026 Q3" → "2026-Q3", "2026 OCT" → "2026-10". */
function periodCode(date: string): string {
  const [year, part] = date.trim().split(/\s+/);
  if (!part) return date.trim();
  const month = MONTHS.indexOf(part.toUpperCase());
  if (month >= 0) return `${year}-${String(month + 1).padStart(2, '0')}`;
  return `${year}-${part}`;
}

function numeric(value: string): number | null {
  const number = Number(value);
  return value.trim() === '' || !Number.isFinite(number) ? null : number;
}

function seriesTitle(tableId: string, series: Series): string {
  const { description } = series;
  const unit = `${description.preUnit ?? ''}${description.unit ?? ''}`.trim();
  const released = ukDate(description.releaseDate);
  const notes = [
    `dataset ${description.datasetId.toUpperCase()}`,
    unit && `unit: ${unit}`,
    released && `last update: ${released}`,
    description.nextRelease && `next release: ${description.nextRelease}`
  ].filter(Boolean);
  return `${description.title.trim() || tableId} (${notes.join('; ')})`;
}

function toTable(tableId: string, series: Series): OnsTable {
  const points = new Map<string, Point[]>();
  for (const frequency of FREQUENCIES) {
    const list = (series[frequency.key] ?? []).map((point) => ({
      code: periodCode(point.date),
      label: point.label?.trim() || point.date.trim(),
      value: numeric(point.value)
    }));
    if (list.length > 0) points.set(frequency.code, list);
  }
  const present = FREQUENCIES.filter((frequency) => points.has(frequency.code));
  const periods = [...points.values()].flat();
  return {
    metadata: {
      title: seriesTitle(tableId, series),
      variables: [
        {
          code: FREQUENCY_CODE,
          label: FREQUENCY_LABEL,
          values: present.map((frequency) => frequency.code),
          valueLabels: present.map((frequency) => frequency.label),
          eliminable: false,
          isTime: false
        },
        {
          code: TIME_CODE,
          label: TIME_LABEL,
          values: periods.map((point) => point.code),
          valueLabels: periods.map((point) => point.label),
          eliminable: false,
          isTime: true
        }
      ]
    },
    points
  };
}

function chosenFrequencies(
  variable: TableVariable | undefined,
  selection: PxwebSelection | undefined
): string[] {
  const codes = variable?.values ?? [];
  if (!selection || selection.selection.filter === 'all') return codes;
  const { filter, values } = selection.selection;
  if (filter === 'item') return values;
  return codes.slice(-Math.max(1, Number(values[0]) || 1));
}

function chosenPoints(
  points: readonly Point[],
  selection: PxwebSelection | undefined
): readonly Point[] {
  if (!selection || selection.selection.filter === 'all') return points;
  const { filter, values } = selection.selection;
  if (filter === 'top')
    return points.slice(-Math.max(1, Number(values[0]) || 1));
  const wanted = new Set(values);
  return points.filter((point) => wanted.has(point.code));
}

function notFound(tableId: string): PxwebError {
  return new PxwebError(
    `Table "${tableId}" was not found. Use search_tables to find a table id.`,
    404
  );
}

function checkLanguage(lang: string): void {
  if (lang !== 'en') {
    throw new PxwebError(`Language "${lang}" is not supported.`, 400);
  }
}

/**
 * ONS time series client. One table is one time series, with the id
 * `<DATASET>/<CDID>` in upper case, for example "MM23/D7G7" (CPI annual rate).
 * Lower case input is accepted.
 *
 * - Search uses the live search API (`/search?content_type=timeseries`); there is
 *   no crawled index. Hits keep the API order, adjusted for release recency.
 * - An id resolves to its page uri through a search for the CDID; the hit must
 *   match both the CDID and the dataset. The requester cache keeps the answer.
 * - Metadata and data come from one request, `https://www.ons.gov.uk/<uri>/data`.
 *   The variables are "frequency" (A, Q, M; only those that the series has) and
 *   "period" (codes "2025", "2026-Q3", "2026-10"; labels as ONS gives them, for
 *   example "2026 JUL-SEP" for a rolling quarter). The title gives the dataset,
 *   the unit, the release date and the next release.
 * - `latest` on "period" gives the newest N periods of each selected frequency.
 * - The beta dataset API (`/v1/datasets`) is not used: it is out of date.
 */
export function createOnsClient(options: OnsClientOptions): PxwebClient {
  const root = options.baseUrl.replace(/\/+$/, '');
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;
  const now = options.now ?? (() => new Date());
  const request = createRequester(options);

  async function get<T>(
    url: string,
    schema: z.ZodType<T>,
    ttlSeconds: number,
    tableId?: string
  ): Promise<T> {
    try {
      return await request(
        url,
        { method: 'GET' },
        schema,
        (data) => data,
        ttlSeconds,
        url
      );
    } catch (err) {
      if (!(err instanceof PxwebError)) throw err;
      if (tableId && err.status === 404) throw notFound(tableId);
      if (err.status >= 400 && err.status < 500) {
        throw new PxwebError(
          `ONS refused the request (HTTP ${err.status}). Change the query and try again.`,
          400
        );
      }
      throw new PxwebError(
        `ONS could not answer (HTTP ${err.status}). Try again later.`,
        502
      );
    }
  }

  function searchUrl(query: string): string {
    return `${root}/search?q=${encodeURIComponent(query)}&content_type=timeseries&limit=${SEARCH_LIMIT}`;
  }

  async function loadTable(lang: string, tableId: string): Promise<OnsTable> {
    checkLanguage(lang);
    const id = tableId.trim().toUpperCase();
    const match = TABLE_ID_PATTERN.exec(id);
    if (!match?.[2]) {
      throw new PxwebError(
        `Invalid table id "${tableId}". Use the id exactly as search_tables returns it, for example "MM23/D7G7".`,
        400
      );
    }
    const { items } = await get(
      searchUrl(match[2]),
      searchSchema,
      METADATA_TTL_SECONDS
    );
    const uri = items.find((item) => hitId(item) === id)?.uri;
    if (!uri) throw notFound(tableId);
    rememberUri(id, uri);
    const series = await get(
      `${ONS_SITE}${uri}/data`,
      seriesSchema,
      DATA_TTL_SECONDS,
      tableId
    );
    return toTable(id, series);
  }

  return {
    async search(lang, query) {
      checkLanguage(lang);
      const { items } = await get(
        searchUrl(query),
        searchSchema,
        SEARCH_TTL_SECONDS
      );
      const seen = new Set<string>();
      const hits = items.flatMap((item) => {
        const tableId = hitId(item);
        if (!tableId || seen.has(tableId)) return [];
        seen.add(tableId);
        const dataset = tableId.split('/')[0];
        return [
          {
            tableId,
            title: `${item.title.trim()} (dataset ${dataset})`,
            published: ukDate(item.release_date)
          }
        ];
      });
      return rankSearchHits(hits, now().getUTCFullYear());
    },

    async getMetadata(lang, tableId) {
      return (await loadTable(lang, tableId)).metadata;
    },

    async query(lang, tableId, selections) {
      const table = await loadTable(lang, tableId);
      const [frequency] = table.metadata.variables;
      const byCode = new Map(
        selections.map((selection) => [selection.code, selection])
      );
      const wanted = new Set(
        chosenFrequencies(frequency, byCode.get(FREQUENCY_CODE))
      );
      const rows = FREQUENCIES.filter((item) => wanted.has(item.code)).flatMap(
        (item) =>
          chosenPoints(
            table.points.get(item.code) ?? [],
            byCode.get(TIME_CODE)
          ).map((point) => [item.label, point.label, point.value])
      );
      if (rows.length > maxCells) {
        throw new PxwebError(
          `The query would return ${rows.length} cells, above the limit of ${maxCells}. Select fewer values.`,
          400
        );
      }
      return {
        label: table.metadata.title,
        columns: [FREQUENCY_LABEL, TIME_LABEL, 'Value'],
        rows
      };
    }
  };
}
