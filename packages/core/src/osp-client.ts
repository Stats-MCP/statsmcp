import { z } from 'zod';

import { createMemoryCache } from '@/cache';
import {
  createTextRequester,
  DATA_TTL_SECONDS,
  METADATA_TTL_SECONDS,
  PxwebError,
  readCappedText,
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
  createGenericDataReader,
  footerMessage,
  parseDataflows,
  parseStructure,
  textIn,
  type SdmxMlCode,
  type SdmxMlDataHeader,
  type SdmxMlDataflow,
  type SdmxMlObservation,
  type SdmxMlStructure
} from '@/sdmx-ml';
import {
  createTableIndexLoader,
  type TableDoc,
  type TableListOptions
} from '@/table-index';

const AGENCY = 'LSD';
const LANGUAGES = ['lt', 'en'] as const;
type Language = (typeof LANGUAGES)[number];
const TABLE_ID_PATTERN = /^(?!\.{1,2}$)[\w.-](?:[\w. -]{0,62}[\w.-])?$/;
const DEFAULT_MAX_CELLS = 5_000;
/**
 * OSP cannot filter by dimension, so every code of every dimension is downloaded:
 * about 400 bytes and 0.3 ms per observation, streamed and filtered here.
 */
const DEFAULT_MAX_DOWNLOAD_OBSERVATIONS = 60_000;
const MAX_DATA_BYTES = 64 * 1024 * 1024;
const MAX_CACHED_TABLES = 8;
/** Separate period runs are fetched one request each, up to this many. */
const MAX_PERIOD_RANGES = 4;
const NO_DATA_MESSAGE = /did not return the data/i;
const MAX_LISTED_PERIODS = 5_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const XML_ACCEPT = 'application/xml';
const STATUS_CONCEPT = 'OBS_STATUS';
const TOTAL_LABEL =
  /^(?:total|total by .+|all-items|males and females|republic of lithuania|urban and rural areas|miestas ir kaimas|iš viso|iš viso pagal .+|vyrai ir moterys|lietuvos respublika)$/i;

const TEXTS: Readonly<
  Record<
    Language,
    {
      value: string;
      status: string;
      updated: string;
      retrieved: string;
      noData: string;
    }
  >
> = {
  lt: {
    value: 'Reikšmė',
    status: 'Sutartinis simbolis',
    updated: 'atnaujinta',
    retrieved: 'gauta',
    noData: 'Pasirinktais laikotarpiais duomenų nėra.'
  },
  en: {
    value: 'Value',
    status: 'Status',
    updated: 'last update',
    retrieved: 'retrieved',
    noData: 'No data for the selected periods.'
  }
};

export interface OspClientOptions extends HttpOptions, TableListOptions {
  /** SDMX-ML root, for example "https://osp-rs.stat.gov.lt/ords/ipospp/ospp/rest_xml". */
  baseUrl: string;
  /** Upper limit of cells in one result. */
  maxCells?: number;
  /** Upper limit of observations downloaded for one result (every code of every dimension). */
  maxDownloadObservations?: number;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

const flatTableSchema = z.object({
  label: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()])))
});

interface Description {
  dimensions: string;
  first: string | undefined;
  last: string | undefined;
  updated: string | undefined;
  discontinued: boolean;
}

interface OspTable {
  flowId: string;
  metadata: TableMetadata;
  /** Dimension code → code of its total, for dimensions that can be left out. */
  totals: ReadonlyMap<string, string>;
  statusTexts: ReadonlyMap<string, string>;
}

function isLanguage(lang: string): lang is Language {
  return LANGUAGES.some((language) => language === lang);
}

function checkLanguage(lang: string): Language {
  if (!isLanguage(lang)) {
    throw new PxwebError(`Language "${lang}" is not supported.`, 400);
  }
  return lang;
}

function notFound(tableId: string): PxwebError {
  return new PxwebError(
    `Table "${tableId}" was not found. Use search_tables to find a table id.`,
    404
  );
}

function upstreamError(err: unknown): unknown {
  if (err instanceof PxwebError && ![400, 404, 502].includes(err.status)) {
    return new PxwebError(
      `Statistics Lithuania could not answer (HTTP ${err.status}). Try again later.`,
      502
    );
  }
  return err;
}

function parseCached(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** "Sex | Age (1996 - 2026) (Was renewed: 2026-05-07)" or "… (Not be renewed)". */
function parseDescription(text: string): Description {
  let rest = text;
  let updated: string | undefined;
  let discontinued = false;
  const status = /\(([^()]*)\)$/.exec(rest);
  if (status && !/^\S+ - \S+$/.test(status[1] ?? '')) {
    updated = /\d{4}-\d{2}-\d{2}/.exec(status[1] ?? '')?.[0];
    discontinued = updated === undefined;
    rest = rest.slice(0, status.index).trim();
  }
  const range = /\((\S+) - (\S+)\)$/.exec(rest);
  if (range) rest = rest.slice(0, range.index).trim();
  return {
    dimensions: rest,
    first: range?.[1],
    last: range?.[2],
    updated,
    discontinued
  };
}

function flowTitle(name: string, description: Description): string {
  const title = description.dimensions
    ? `${name}: ${description.dimensions}`
    : name;
  return description.first && description.last
    ? `${title} (${description.first} - ${description.last})`
    : title;
}

function toTableDoc(flow: SdmxMlDataflow, lang: Language): TableDoc {
  const description = parseDescription(textIn(flow.descriptions, lang) ?? '');
  return {
    id: flow.id,
    title: flowTitle(textIn(flow.names, lang) ?? flow.id, description),
    ...(description.updated && { updated: description.updated }),
    ...(description.last && { lastPeriod: description.last }),
    ...(description.discontinued && { discontinued: true })
  };
}

interface PeriodFormat {
  pattern: RegExp;
  perYear: number;
  code: (year: number, index: number) => string;
  /** The ISO form that `startPeriod` and `endPeriod` accept. */
  api: (match: RegExpExecArray, edge: 'start' | 'end') => string;
}

const PERIOD_FORMATS: readonly PeriodFormat[] = [
  {
    pattern: /^(\d{4})$/,
    perYear: 1,
    code: (year) => String(year),
    api: (match) => match[1] ?? ''
  },
  {
    pattern: /^(\d{4})P([12])$/,
    perYear: 2,
    code: (year, index) => `${year}P${index + 1}`,
    api: (match) => `${match[1]}-S${match[2]}`
  },
  {
    pattern: /^(\d{4})K([1-4])$/,
    perYear: 4,
    code: (year, index) => `${year}K${index + 1}`,
    api: (match) => `${match[1]}-Q${match[2]}`
  },
  {
    pattern: /^(\d{4})M(0[1-9]|1[0-2])$/,
    perYear: 12,
    code: (year, index) => `${year}M${String(index + 1).padStart(2, '0')}`,
    api: (match) => `${match[1]}-${match[2]}`
  },
  {
    // A school year ("2025-2026") matches only a range that starts and ends with it.
    pattern: /^(\d{4})-(\d{4})$/,
    perYear: 1,
    code: (year) => `${year}-${year + 1}`,
    api: (match, edge) => (edge === 'start' ? match[1] : match[2]) ?? ''
  }
];

function matchPeriod(
  code: string
): { format: PeriodFormat; match: RegExpExecArray } | undefined {
  for (const format of PERIOD_FORMATS) {
    const match = format.pattern.exec(code);
    if (match) return { format, match };
  }
  return undefined;
}

/** Position of a period on its format's scale; undefined for multi-year spans. */
function periodStep(
  format: PeriodFormat,
  match: RegExpExecArray
): number | undefined {
  const year = Number(match[1]);
  if (format.perYear === 1) {
    return match[2] === undefined || Number(match[2]) === year + 1
      ? year
      : undefined;
  }
  return year * format.perYear + Number(match[2]) - 1;
}

/**
 * The API lists no periods, so they come from the range in the dataflow description.
 * Multi-year spans ("2008-2010 - 2022-2024") and mixed ranges have gaps that cannot
 * be known, so only their first and last periods are listed.
 */
function periodList(first: string, last: string): string[] {
  const start = matchPeriod(first);
  const end = matchPeriod(last);
  const from = start && periodStep(start.format, start.match);
  const to = end && periodStep(end.format, end.match);
  if (
    !start ||
    start.format !== end?.format ||
    from === undefined ||
    to === undefined ||
    to < from ||
    to - from >= MAX_LISTED_PERIODS
  ) {
    return [...new Set([first, last])];
  }
  const { format } = start;
  const codes: string[] = [];
  for (let step = from; step <= to; step++) {
    codes.push(
      format.code(Math.floor(step / format.perYear), step % format.perYear)
    );
  }
  return codes;
}

function apiPeriod(code: string, edge: 'start' | 'end'): string {
  const found = matchPeriod(code);
  if (found) return found.format.api(found.match, edge);
  const years = code.match(/\d{4}/g) ?? [];
  return (edge === 'start' ? years[0] : years.at(-1)) ?? code;
}

function compareCodes(a: string, b: string): number {
  const numericA = /^\d+$/.test(a);
  const numericB = /^\d+$/.test(b);
  if (numericA && numericB) return Number(a) - Number(b) || a.length - b.length;
  if (numericA !== numericB) return numericA ? -1 : 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function totalCode(codes: readonly SdmxMlCode[]): string | undefined {
  const totals = codes.filter((code) =>
    [...code.names.values()].some((name) => TOTAL_LABEL.test(name))
  );
  return totals.length === 1 ? totals[0]?.id : undefined;
}

function buildTable(
  flow: SdmxMlDataflow,
  structure: SdmxMlStructure,
  lang: Language
): OspTable {
  const description = parseDescription(textIn(flow.descriptions, lang) ?? '');
  const totals = new Map<string, string>();
  const dimensions: TableVariable[] = [];
  let time: TableVariable | undefined;
  for (const dimension of structure.dimensions) {
    const label =
      textIn(structure.concepts.get(dimension.id), lang) ?? dimension.id;
    if (dimension.isTime) {
      const periods =
        description.first && description.last
          ? periodList(description.first, description.last)
          : [];
      time = {
        code: dimension.id,
        label,
        values: periods,
        valueLabels: periods,
        eliminable: false,
        isTime: true
      };
      continue;
    }
    const codes = structure.codelists.get(dimension.codelistId ?? '') ?? [];
    const total = codes.length > 1 ? totalCode(codes) : undefined;
    if (total !== undefined) totals.set(dimension.id, total);
    // OSP code lists come in no particular order; hierarchical codes sort into tree order.
    const ordered = codes.toSorted((a, b) => {
      if (a.id === total) return -1;
      if (b.id === total) return 1;
      return compareCodes(a.id, b.id);
    });
    dimensions.push({
      code: dimension.id,
      label,
      values: ordered.map((code) => code.id),
      valueLabels: ordered.map((code) => textIn(code.names, lang) ?? code.id),
      eliminable: total !== undefined,
      isTime: false
    });
  }
  if (!time) {
    throw new PxwebError(
      `Table "${flow.id}" has no time dimension in its data structure.`,
      502
    );
  }
  const statuses = structure.codelists.get(STATUS_CONCEPT) ?? [];
  return {
    flowId: flow.id,
    metadata: {
      title: flowTitle(textIn(flow.names, lang) ?? flow.id, description),
      variables: [...dimensions, time]
    },
    totals,
    statusTexts: new Map(
      statuses.map((code) => [code.id, textIn(code.names, lang) ?? code.id])
    )
  };
}

/**
 * Index ranges of the chosen periods: one per adjacent run, or one span over all
 * of them when there are many runs.
 */
function periodRanges(
  periods: readonly string[],
  chosen: ReadonlySet<string>
): [number, number][] {
  const runs: [number, number][] = [];
  periods.forEach((period, index) => {
    if (!chosen.has(period)) return;
    const last = runs.at(-1);
    if (last && last[1] === index - 1) last[1] = index;
    else runs.push([index, index]);
  });
  const first = runs[0];
  const end = runs.at(-1);
  if (runs.length <= MAX_PERIOD_RANGES || !first || !end) return runs;
  return [[first[0], end[1]]];
}

function chosenCodes(
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
  const known = new Set(variable.values);
  const unknown = values.filter((value) => !known.has(value));
  if (unknown.length > 0) {
    throw new PxwebError(
      `Variable "${variable.code}" has no values ${unknown.join(', ')}. Call get_table_metadata to see valid value codes.`,
      400
    );
  }
  return values;
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

interface RowFilter {
  /** Variable code → chosen codes, in metadata order; time last. */
  chosen: ReadonlyMap<string, ReadonlySet<string>>;
  /** Left-out dimensions with a total; filtered to it and not shown. */
  hidden: ReadonlySet<string>;
}

interface Selected extends RowFilter {
  /** Observations that OSP sends for one period: every code of every dimension. */
  perPeriod: number;
}

function selectCodes(
  table: OspTable,
  selections: readonly PxwebSelection[],
  maxCells: number
): Selected {
  const byCode = new Map(
    selections.map((selection) => [selection.code, selection])
  );
  const chosen = new Map<string, ReadonlySet<string>>();
  const hidden = new Set<string>();
  let cells = 1;
  let perPeriod = 1;
  for (const variable of table.metadata.variables) {
    const selection = byCode.get(variable.code);
    const total = table.totals.get(variable.code);
    if (!variable.isTime) perPeriod *= Math.max(1, variable.values.length);
    if (!selection && total !== undefined) {
      chosen.set(variable.code, new Set([total]));
      hidden.add(variable.code);
      continue;
    }
    const codes = chosenCodes(variable, selection);
    chosen.set(variable.code, new Set(codes));
    cells *= codes.length;
  }
  if (cells > maxCells) {
    throw new PxwebError(
      `The query could return ${cells} cells, above the limit of ${maxCells}. Select fewer values.`,
      400
    );
  }
  return { chosen, hidden, perPeriod };
}

interface RowCollector {
  add(observation: SdmxMlObservation): void;
  build(headers: readonly SdmxMlDataHeader[]): FlatTable;
}

function collectRows(
  table: OspTable,
  filter: RowFilter,
  lang: Language
): RowCollector {
  const variables = table.metadata.variables;
  const shown = variables.filter(
    (variable) => !filter.hidden.has(variable.code)
  );
  const timeCode = variables.at(-1)?.code ?? '';
  const dimensionCodes = new Set(
    variables.filter((variable) => !variable.isTime).map((v) => v.code)
  );
  const positions = new Map(
    variables.map((variable) => [
      variable.code,
      new Map(variable.values.map((value, index) => [value, index]))
    ])
  );
  const found: { order: number[]; cells: (string | number | null)[] }[] = [];
  let hasStatus = false;

  return {
    add(observation) {
      const codes = new Map<string, string>();
      for (const [id, code] of observation.key) {
        // The data names the time dimension "LAIKOTARPIS", the structure "TIME_PERIOD".
        codes.set(dimensionCodes.has(id) ? id : timeCode, code);
      }
      const matches = variables.every((variable) => {
        const code = codes.get(variable.code);
        return (
          code !== undefined && filter.chosen.get(variable.code)?.has(code)
        );
      });
      if (!matches) return;
      const status = observation.attributes.get(STATUS_CONCEPT);
      if (status) hasStatus = true;
      const order = shown.map(
        (variable) =>
          positions.get(variable.code)?.get(codes.get(variable.code) ?? '') ?? 0
      );
      found.push({
        order,
        cells: [
          ...shown.map(
            (variable, index) =>
              variable.valueLabels[order[index] ?? -1] ??
              codes.get(variable.code) ??
              ''
          ),
          toNumber(observation.value),
          status ? (table.statusTexts.get(status) ?? status) : null
        ]
      });
    },

    build(headers) {
      const header =
        headers.find((entry) => entry.attributes.size > 0) ?? headers[0];
      found.sort((a, b) => {
        for (const [index, value] of a.order.entries()) {
          const difference = value - (b.order[index] ?? 0);
          if (difference !== 0) return difference;
        }
        return 0;
      });
      const texts = TEXTS[lang];
      const updated = header?.attributes.get('DS_LAST_UPDATE');
      const retrieved = header?.prepared?.slice(0, 10);
      const dates = [
        updated && `${texts.updated}: ${updated}`,
        retrieved && `${texts.retrieved}: ${retrieved}`
      ].filter(Boolean);
      const title = dates.length
        ? `${table.metadata.title} (${dates.join('; ')})`
        : table.metadata.title;
      return {
        label: found.length ? title : `${title}. ${texts.noData}`,
        columns: [
          ...shown.map((variable) => variable.label),
          texts.value,
          ...(hasStatus ? [texts.status] : [])
        ],
        rows: found.map((row) =>
          hasStatus ? row.cells : row.cells.slice(0, -1)
        )
      };
    }
  };
}

/**
 * Client for the Official Statistics Portal (OSP) of Statistics Lithuania (State
 * Data Agency), an SDMX 2.1 REST service that answers only SDMX-ML, in Lithuanian
 * and English (every message carries both).
 *
 * - Table id: the dataflow id, for example "S7R121_M2020103_1". One indicator
 *   ("S7R121") has one dataflow per breakdown, so the title adds the dimensions
 *   and the period range from the dataflow description.
 * - Search: a local index over the full dataflow list (`dataflow/`, 7 MB, one call
 *   for both languages). The parsed list is kept in memory for an hour; it is too
 *   large for the shared cache. The description gives the update date, the last
 *   period and "not renewed" (discontinued) dataflows.
 * - Metadata: `dataflow/LSD/{id}` and `datastructure/LSD/{dsd}` (code lists and
 *   concept names). Code lists come unordered and are sorted by code. A dimension is
 *   eliminable only when exactly one code is labelled as a total ("Total by age",
 *   "Republic of Lithuania", "Males and females" …); left out, it is filtered to that
 *   code. The structure lists no periods, so they are expanded from the range in the
 *   dataflow description.
 * - Query: OSP supports only `startPeriod` and `endPeriod` (no key, no
 *   `lastNObservations`, so URLs stay far below its 1,000-character limit). Each
 *   run of adjacent chosen periods is one request (more than four runs become one
 *   span) with every code of every dimension; the message is streamed and filtered
 *   here, never held whole. `latest` picks the newest listed periods. The cell
 *   limit applies to the result, and a separate limit (60,000 observations, about
 *   20 s) to the download. Errors and "no data" come as HTTP 200 with a footer.
 * - Caching: dataflow and structure messages in the shared cache; the parsed table
 *   in memory for an hour (finished values only); the filtered result in the shared
 *   cache for an hour. Titles of results carry the data update and retrieval dates.
 */
export function createOspClient(
  options: OspClientOptions
): Required<PxwebClient> {
  const root = options.baseUrl.replace(/\/+$/, '');
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;
  const maxDownload =
    options.maxDownloadObservations ?? DEFAULT_MAX_DOWNLOAD_OBSERVATIONS;
  const now = options.now ?? (() => new Date());
  const cache = options.cache ?? createMemoryCache();
  const doFetch = options.fetch ?? fetch;
  const request = createTextRequester({ ...options, cache });
  const xmlGet: RequestInit = {
    method: 'GET',
    headers: { accept: XML_ACCEPT }
  };

  async function open(url: string): Promise<Response> {
    const response = await doFetch(url, {
      headers: {
        accept: XML_ACCEPT,
        ...(options.userAgent && { 'user-agent': options.userAgent })
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    }).catch((err: unknown) => {
      throw new PxwebError(
        `Statistics Lithuania request failed: ${err instanceof Error ? err.message : String(err)}`,
        502
      );
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw upstreamError(
        new PxwebError(
          `Statistics Lithuania returned HTTP ${response.status}.`,
          response.status
        )
      );
    }
    return response;
  }

  async function streamData(
    url: string,
    onObservation: (observation: SdmxMlObservation) => void
  ): Promise<SdmxMlDataHeader> {
    const response = await open(url);
    const reader = createGenericDataReader(onObservation);
    const decoder = new TextDecoder();
    const body = response.body?.getReader();
    let size = 0;
    try {
      for (;;) {
        const chunk = await body?.read();
        if (!chunk || chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_DATA_BYTES) {
          await body?.cancel().catch(() => undefined);
          throw new PxwebError(
            'Statistics Lithuania response is too large.',
            502
          );
        }
        reader.push(decoder.decode(chunk.value, { stream: true }));
      }
    } catch (err) {
      if (err instanceof PxwebError) throw err;
      throw new PxwebError(
        `Statistics Lithuania response could not be read: ${err instanceof Error ? err.message : String(err)}`,
        502
      );
    }
    reader.push(decoder.decode());
    return reader.finish();
  }

  // One download serves both languages. Only finished values are kept: on
  // Workers, a pending load can belong to a request that was stopped.
  let catalogue: { expires: number; flows: SdmxMlDataflow[] } | undefined;

  async function listTables(lang: string): Promise<TableDoc[]> {
    const language = checkLanguage(lang);
    if (!catalogue || catalogue.expires <= Date.now()) {
      const flows = parseDataflows(
        await readCappedText(await open(`${root}/dataflow/`))
      );
      if (flows.length === 0) {
        throw new PxwebError(
          'Statistics Lithuania returned no dataflows.',
          502
        );
      }
      catalogue = { expires: Date.now() + SEARCH_TTL_SECONDS * 1000, flows };
    }
    return catalogue.flows.map((flow) => toTableDoc(flow, language));
  }

  const tableIndex = createTableIndexLoader(listTables, {
    fallback: options.listFallback,
    ttlSeconds: SEARCH_TTL_SECONDS,
    currentYear: () => now().getUTCFullYear()
  });

  function getStructure<T>(
    path: string,
    ttlSeconds: number,
    parse: (xml: string) => T
  ): Promise<T> {
    const url = `${root}/${path}`;
    return request(url, xmlGet, parse, ttlSeconds, `osp:${url}`).catch(
      (err: unknown) => {
        throw upstreamError(err);
      }
    );
  }

  async function loadTable(lang: Language, tableId: string): Promise<OspTable> {
    if (!TABLE_ID_PATTERN.test(tableId)) {
      throw new PxwebError(
        `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
        400
      );
    }
    const flow = await getStructure(
      `dataflow/${AGENCY}/${encodeURIComponent(tableId)}`,
      SEARCH_TTL_SECONDS,
      (xml) => {
        const [found] = parseDataflows(xml);
        if (found?.id !== tableId || !found.structureId)
          throw notFound(tableId);
        return { ...found, structureId: found.structureId };
      }
    );
    const structure = await getStructure(
      `datastructure/${AGENCY}/${encodeURIComponent(flow.structureId)}`,
      METADATA_TTL_SECONDS,
      (xml) => {
        const footer = footerMessage(xml);
        if (footer) {
          throw new PxwebError(
            `Statistics Lithuania has no data structure for table "${tableId}": ${textIn(footer.texts, lang) ?? footer.code}`,
            502
          );
        }
        return parseStructure(xml);
      }
    );
    return buildTable(flow, structure, lang);
  }

  const tables = new Map<string, { expires: number; table: OspTable }>();

  async function cachedTable(lang: string, tableId: string): Promise<OspTable> {
    const language = checkLanguage(lang);
    const key = `${language}:${tableId}`;
    const cached = tables.get(key);
    if (cached && cached.expires > Date.now()) return cached.table;
    const table = await loadTable(language, tableId);
    tables.delete(key);
    tables.set(key, { expires: Date.now() + DATA_TTL_SECONDS * 1000, table });
    const oldest = tables.keys().next().value;
    if (tables.size > MAX_CACHED_TABLES && oldest !== undefined) {
      tables.delete(oldest);
    }
    return table;
  }

  return {
    listTables,

    async search(lang, query, searchOptions) {
      checkLanguage(lang);
      return (await tableIndex(lang)).search(query, searchOptions);
    },

    async getMetadata(lang, tableId) {
      return (await cachedTable(lang, tableId)).metadata;
    },

    async query(lang, tableId, selections) {
      const language = checkLanguage(lang);
      const table = await cachedTable(language, tableId);
      const { chosen, hidden, perPeriod } = selectCodes(
        table,
        selections,
        maxCells
      );
      const time = table.metadata.variables.at(-1);
      const ranges = periodRanges(
        time?.values ?? [],
        chosen.get(time?.code ?? '') ?? new Set()
      );
      const periods = ranges.reduce(
        (sum, [from, to]) => sum + to - from + 1,
        0
      );
      if (periods === 0 || !time) {
        throw new PxwebError(`Table "${tableId}" lists no periods.`, 400);
      }
      const download = perPeriod * periods;
      if (download > maxDownload) {
        const fit = Math.floor(maxDownload / perPeriod);
        throw new PxwebError(
          fit > 0
            ? `Statistics Lithuania sends every value of every dimension, so these periods mean about ${download} observations, above the limit of ${maxDownload}. Select at most ${fit} periods.`
            : `Statistics Lithuania sends every value of every dimension, about ${perPeriod} observations per period, above the limit of ${maxDownload}. Use a table with fewer dimensions.`,
          400
        );
      }
      const urls = ranges.map(
        ([from, to]) =>
          `${root}/data/${encodeURIComponent(table.flowId)}?startPeriod=${apiPeriod(time.values[from] ?? '', 'start')}&endPeriod=${apiPeriod(time.values[to] ?? '', 'end')}`
      );
      const signature = [...chosen]
        .map(([code, values]) => `${code}=${[...values].join(',')}`)
        .join('&');
      const cacheKey = `osp:rows:${language}:${urls.join(' ')}:${signature}`;
      const cached = await cache.get(cacheKey);
      const parsed = flatTableSchema.safeParse(parseCached(cached));
      if (parsed.success) return parsed.data;
      const rows = collectRows(table, { chosen, hidden }, language);
      const headers: SdmxMlDataHeader[] = [];
      for (const url of urls) {
        const header = await streamData(url, rows.add).catch((err: unknown) => {
          if (err instanceof PxwebError && err.status === 404) {
            throw notFound(tableId);
          }
          throw err;
        });
        const footer = header.footer;
        if (footer && !NO_DATA_MESSAGE.test(footer.texts.get('en') ?? '')) {
          throw new PxwebError(
            `Statistics Lithuania refused the request for table "${tableId}": ${textIn(footer.texts, language) ?? footer.code}`,
            502
          );
        }
        headers.push(header);
      }
      const result = rows.build(headers);
      await cache.set(cacheKey, JSON.stringify(result), DATA_TTL_SECONDS);
      return result;
    }
  };
}
