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
import {
  createTableIndexLoader,
  type TableDoc,
  type TableListOptions,
  preferCrawled
} from '@/table-index';

const TABLE_ID_PATTERN = /^P\d{1,6}$/;
const DEFAULT_MAX_CELLS = 5_000;
const MAX_CACHED_TABLES = 8;
/** The API refuses a larger page size. */
const PAGE_SIZE = 100;
/** Parallel page requests; the anonymous limit is 5 requests per second. */
const PAGE_BATCH = 4;
const MAX_VARIABLE_PAGES = 20;
const VAR_IDS_PER_CALL = PAGE_SIZE;
const DIMENSION_FIELDS = ['n1', 'n2', 'n3', 'n4', 'n5'] as const;
const UNIT_CODE = 'unit';
const YEAR_CODE = 'year';
const POLAND = '000000000000';
const COUNTRY_LEVEL = 0;
const VOIVODESHIP_LEVEL = 2;
const VOIVODESHIPS: [string, string][] = [
  ['030200000000', 'Dolnośląskie'],
  ['040400000000', 'Kujawsko-pomorskie'],
  ['060600000000', 'Lubelskie'],
  ['020800000000', 'Lubuskie'],
  ['051000000000', 'Łódzkie'],
  ['011200000000', 'Małopolskie'],
  ['071400000000', 'Mazowieckie'],
  ['031600000000', 'Opolskie'],
  ['061800000000', 'Podkarpackie'],
  ['062000000000', 'Podlaskie'],
  ['042200000000', 'Pomorskie'],
  ['012400000000', 'Śląskie'],
  ['052600000000', 'Świętokrzyskie'],
  ['042800000000', 'Warmińsko-mazurskie'],
  ['023000000000', 'Wielkopolskie'],
  ['023200000000', 'Zachodniopomorskie']
];
/** Attributes "x", "X", "-" and "n": the value field holds 0, but there is no value. */
const MISSING_ATTRIBUTES = new Set([4, 14, 15, 50, 91]);
const ARCHIVE_GROUP = /archival|archiwaln/i;

const LABELS: Readonly<
  Record<
    string,
    {
      unit: string;
      year: string;
      measure: string;
      value: string;
      poland: string;
      dimension: string;
    }
  >
> = {
  pl: {
    unit: 'Jednostka terytorialna',
    year: 'Rok',
    measure: 'Jednostka miary',
    value: 'Wartość',
    poland: 'Polska',
    dimension: 'Wymiar'
  },
  en: {
    unit: 'Territorial unit',
    year: 'Year',
    measure: 'Measure unit',
    value: 'Value',
    poland: 'Poland',
    dimension: 'Dimension'
  }
};

export interface BdlClientOptions extends HttpOptions, TableListOptions {
  /** API root, for example "https://bdl.stat.gov.pl/api/v1". */
  baseUrl: string;
  /** Free BDL API key, sent as `X-ClientId`; it raises the request limits tenfold. */
  clientId?: string;
  /** Upper limit of cells in one data request. */
  maxCells?: number;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

const subjectListSchema = z.object({
  totalRecords: z.number(),
  results: z.array(
    z.object({
      id: z.string(),
      parentId: z.string().nullish(),
      name: z.string(),
      hasVariables: z.boolean()
    })
  )
});

const subjectSchema = z.object({
  name: z.string(),
  years: z.array(z.number()).default([]),
  dimensions: z.array(z.string()).default([])
});

const variablesSchema = z.object({
  totalRecords: z.number(),
  results: z.array(
    z.object({
      id: z.number(),
      n1: z.string().nullish(),
      n2: z.string().nullish(),
      n3: z.string().nullish(),
      n4: z.string().nullish(),
      n5: z.string().nullish(),
      level: z.number(),
      measureUnitName: z.string().nullish()
    })
  )
});

const yearValuesSchema = z.array(
  z.object({ year: z.string(), val: z.number().nullable(), attrId: z.number() })
);

const dataByUnitSchema = z.object({
  results: z.array(z.object({ id: z.number(), values: yearValuesSchema }))
});

const dataByVariableSchema = z.object({
  results: z.array(z.object({ id: z.string(), values: yearValuesSchema }))
});

type YearValues = z.infer<typeof yearValuesSchema>;

interface Series {
  id: number;
  /** Value code of each dimension, in dimension order. */
  codes: string[];
  measure: string | null;
}

interface BdlTable {
  metadata: TableMetadata;
  dimensions: TableVariable[];
  units: TableVariable;
  years: TableVariable;
  series: Series[];
}

interface Cell {
  unit: string;
  series: number;
  values: YearValues;
}

function labelsFor(lang: string) {
  const labels = LABELS[lang];
  if (!labels) {
    throw new PxwebError(`Language "${lang}" is not supported.`, 400);
  }
  return labels;
}

function notFound(tableId: string): PxwebError {
  return new PxwebError(
    `Table "${tableId}" was not found. Use search_tables to find a table id.`,
    404
  );
}

/** The API's own error reason, from a body such as `{"errors":[{"errorReason":"…"}]}`. */
function upstreamReason(message: string): string {
  const reason = /"errorReason"\s*:\s*"([^"]+)"/.exec(message)?.[1];
  return reason ?? message.replace(/^.*?HTTP \d+:\s*/, '');
}

function upstreamError(err: unknown): unknown {
  if (!(err instanceof PxwebError)) return err;
  if (err.status === 429) {
    // runTool rewrites 429 to "wait a few seconds", but the BDL limits are per 15 minutes and 12 hours.
    return new PxwebError(
      'Statistics Poland (BDL) refused the request because its request limit for this server is reached. Try again in 15 minutes or later.',
      503
    );
  }
  if (err.status >= 500) {
    return new PxwebError(
      `Statistics Poland (BDL) could not answer (HTTP ${err.status}). Try again later.`,
      502
    );
  }
  return err;
}

async function inBatches<T, R>(
  items: readonly T[],
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += PAGE_BATCH) {
    results.push(
      ...(await Promise.all(items.slice(start, start + PAGE_BATCH).map(run)))
    );
  }
  return results;
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  return range(Math.ceil(items.length / size)).map((index) =>
    items.slice(index * size, (index + 1) * size)
  );
}

function chosenCodes(
  variable: TableVariable,
  selection: PxwebSelection | undefined
): string[] {
  if (!selection) {
    return variable.code === UNIT_CODE ? [POLAND] : variable.values;
  }
  const { filter, values } = selection.selection;
  if (filter === 'all') return variable.values;
  if (filter === 'top') {
    return variable.values.slice(-Math.max(1, Number(values[0]) || 1));
  }
  return values;
}

function valueLabel(variable: TableVariable, code: string): string {
  return variable.valueLabels[variable.values.indexOf(code)] ?? code;
}

function toValue(entry: YearValues[number]): number | null {
  return MISSING_ATTRIBUTES.has(entry.attrId) ? null : entry.val;
}

async function allPages<T extends { totalRecords: number }>(
  load: (page: number) => Promise<T>,
  maxPages: number
): Promise<T[]> {
  const first = await load(0);
  const pages = Math.ceil(first.totalRecords / PAGE_SIZE);
  if (pages > maxPages) {
    throw new PxwebError(
      `Statistics Poland (BDL) lists ${first.totalRecords} entries here, more than this server reads.`,
      400
    );
  }
  return [first, ...(await inBatches(range(pages).slice(1), load))];
}

/**
 * Client for Statistics Poland (GUS), Local Data Bank (BDL) API, in Polish and English.
 *
 * - Table id: a BDL subgroup, the subject level that holds variables (for example "P2567").
 * - Search: a local index over every subject. `subjects/search?name=%` matches all
 *   2,700 subjects (28 pages of 100, the largest page size), which is far fewer calls
 *   than the K → G → P tree walk (about 300). Path is the subject's ancestors (domain,
 *   group); subjects under an "archival data" group are marked discontinued. The list
 *   has no years, so the docs have no `lastPeriod`.
 * - Metadata: `subjects/{id}` (years, dimension names) and `variables?subject-id=…`
 *   (one call per 100 variables). A BDL variable is one series: its labels n1…n5 are
 *   the dimensions, named by the subject's `dimensions`. Each dimension becomes a
 *   variable `n1`…`n5` with ordinal value codes in API order (the same in both
 *   languages). `unit` offers Poland (eliminable, the default) and, when the series
 *   go down to level 2 or deeper, the 16 voivodeships. `year` is the subject's years.
 * - Query: the selection picks the series whose labels match and the cell limit is
 *   checked on series × units × years. Data comes from `data/by-unit` (100 series per
 *   call for one unit) or `data/by-variable` (one series for Poland or all
 *   voivodeships per call), whichever needs fewer calls.
 * - Limits: anonymous clients get 100 requests per 15 minutes; `clientId` raises it.
 *   HTTP 429 becomes a 503 error that says to try again later.
 * - Caching: list pages, subjects and variables in the shared cache for a day, data
 *   for an hour; the parsed table in memory for an hour.
 */
export function createBdlClient(
  options: BdlClientOptions
): Required<PxwebClient> {
  const root = options.baseUrl.replace(/\/+$/, '');
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;
  const now = options.now ?? (() => new Date());
  const request = createRequester(options);
  const init: RequestInit = options.clientId
    ? { method: 'GET', headers: { 'X-ClientId': options.clientId } }
    : { method: 'GET' };

  function get<T>(
    path: string,
    params: [string, string][],
    lang: string,
    schema: z.ZodType<T>,
    ttlSeconds: number
  ): Promise<T> {
    const query = new URLSearchParams([
      ...params,
      ['lang', lang],
      ['format', 'json']
    ]);
    const url = `${root}/${path}?${query}`;
    return request(url, init, schema, (data) => data, ttlSeconds, url);
  }

  async function listTables(lang: string): Promise<TableDoc[]> {
    labelsFor(lang);
    const pages = await allPages(
      (page) =>
        get(
          'subjects/search',
          [
            ['name', '%'],
            ['sort', 'Id'],
            ['page-size', String(PAGE_SIZE)],
            ['page', String(page)]
          ],
          lang,
          subjectListSchema,
          METADATA_TTL_SECONDS
        ),
      Number.POSITIVE_INFINITY
    ).catch((err: unknown) => {
      throw upstreamError(err);
    });
    const subjects = pages.flatMap((page) => page.results);
    const byId = new Map(subjects.map((subject) => [subject.id, subject]));
    function ancestors(parentId: string | null | undefined): string[] {
      const names: string[] = [];
      const seen = new Set<string>();
      for (
        let parent = parentId ? byId.get(parentId) : undefined;
        parent && !seen.has(parent.id);
        parent = parent.parentId ? byId.get(parent.parentId) : undefined
      ) {
        seen.add(parent.id);
        names.unshift(parent.name.trim());
      }
      return names;
    }
    return subjects
      .filter((subject) => subject.hasVariables)
      .map((subject) => {
        const path = ancestors(subject.parentId);
        return {
          id: subject.id,
          title: subject.name.trim(),
          path,
          ...(path.some((name) => ARCHIVE_GROUP.test(name)) && {
            discontinued: true
          })
        };
      });
  }

  const tableIndex = createTableIndexLoader(
    preferCrawled(listTables, options.crawledList),
    {
      fallback: options.listFallback,
      ttlSeconds: SEARCH_TTL_SECONDS,
      currentYear: () => now().getUTCFullYear()
    }
  );

  async function loadTable(lang: string, tableId: string): Promise<BdlTable> {
    const labels = labelsFor(lang);
    const variablePage = (page: number) =>
      get(
        'variables',
        [
          ['subject-id', tableId],
          ['page-size', String(PAGE_SIZE)],
          ['page', String(page)]
        ],
        lang,
        variablesSchema,
        METADATA_TTL_SECONDS
      );
    const [subject, pages] = await Promise.all([
      get(`subjects/${tableId}`, [], lang, subjectSchema, METADATA_TTL_SECONDS),
      allPages(variablePage, MAX_VARIABLE_PAGES)
    ]).catch((err: unknown) => {
      if (err instanceof PxwebError && err.status === 404) {
        throw notFound(tableId);
      }
      throw upstreamError(err);
    });
    const variables = pages.flatMap((page) => page.results);
    if (variables.length === 0) throw notFound(tableId);

    const dimensionCount = Math.max(
      ...variables.map(
        (variable) =>
          DIMENSION_FIELDS.findLastIndex((field) => variable[field]) + 1
      )
    );
    const dimensions = DIMENSION_FIELDS.slice(0, dimensionCount).map(
      (field, index) => {
        const labelsInOrder = [
          ...new Set(variables.map((variable) => variable[field]?.trim() ?? ''))
        ];
        return {
          field,
          codes: new Map(
            labelsInOrder.map((label, position) => [
              label,
              String(position + 1)
            ])
          ),
          variable: {
            code: field,
            label:
              subject.dimensions[index]?.trim() ||
              `${labels.dimension} ${index + 1}`,
            values: labelsInOrder.map((_, position) => String(position + 1)),
            valueLabels: labelsInOrder,
            eliminable: false,
            isTime: false
          } satisfies TableVariable
        };
      }
    );
    const deepest = Math.max(...variables.map((variable) => variable.level));
    const units: (readonly [string, string])[] = [
      [POLAND, labels.poland],
      ...(deepest >= VOIVODESHIP_LEVEL ? VOIVODESHIPS : [])
    ];
    const years = subject.years.map(String);

    const dimensionVariables = dimensions.map(
      (dimension) => dimension.variable
    );
    const unitVariable: TableVariable = {
      code: UNIT_CODE,
      label: labels.unit,
      values: units.map(([id]) => id),
      valueLabels: units.map(([, name]) => name),
      eliminable: true,
      isTime: false
    };
    const yearVariable: TableVariable = {
      code: YEAR_CODE,
      label: labels.year,
      values: years,
      valueLabels: years,
      eliminable: false,
      isTime: true
    };
    return {
      metadata: {
        title: subject.name.trim(),
        variables: [...dimensionVariables, unitVariable, yearVariable]
      },
      dimensions: dimensionVariables,
      units: unitVariable,
      years: yearVariable,
      series: variables.map((variable) => ({
        id: variable.id,
        codes: dimensions.map(
          (dimension) =>
            dimension.codes.get(variable[dimension.field]?.trim() ?? '') ?? ''
        ),
        measure: variable.measureUnitName?.trim() || null
      }))
    };
  }

  // The parsed table is kept so metadata and query of one tool call share it. Only
  // finished tables are kept: on Workers, a pending load can belong to a request
  // that the runtime stopped.
  const tables = new Map<string, { expires: number; table: BdlTable }>();

  async function cachedTable(lang: string, tableId: string): Promise<BdlTable> {
    labelsFor(lang);
    if (!TABLE_ID_PATTERN.test(tableId)) {
      throw new PxwebError(
        `Invalid table id "${tableId}". Use the id exactly as search_tables returns it, for example "P2567".`,
        400
      );
    }
    const key = `${lang}:${tableId}`;
    const cached = tables.get(key);
    if (cached && cached.expires > Date.now()) return cached.table;
    const table = await loadTable(lang, tableId);
    tables.delete(key);
    tables.set(key, { expires: Date.now() + DATA_TTL_SECONDS * 1000, table });
    const oldest = tables.keys().next().value;
    if (tables.size > MAX_CACHED_TABLES && oldest !== undefined) {
      tables.delete(oldest);
    }
    return table;
  }

  async function fetchCells(
    lang: string,
    series: readonly Series[],
    units: readonly string[],
    yearParams: [string, string][]
  ): Promise<Cell[]> {
    const levels = [
      ...(units.includes(POLAND) ? [COUNTRY_LEVEL] : []),
      ...(units.some((unit) => unit !== POLAND) ? [VOIVODESHIP_LEVEL] : [])
    ];
    const byUnitCalls =
      units.length * Math.ceil(series.length / VAR_IDS_PER_CALL);
    const byVariableCalls = series.length * levels.length;
    if (byUnitCalls <= byVariableCalls) {
      const requests = units.flatMap((unit) =>
        chunks(series, VAR_IDS_PER_CALL).map((chunk) => ({ unit, chunk }))
      );
      const answers = await inBatches(requests, ({ unit, chunk }) =>
        get(
          `data/by-unit/${unit}`,
          [
            ...chunk.map((entry): [string, string] => [
              'var-id',
              String(entry.id)
            ]),
            ...yearParams,
            ['page-size', String(PAGE_SIZE)]
          ],
          lang,
          dataByUnitSchema,
          DATA_TTL_SECONDS
        ).then((data) =>
          data.results.map((result) => ({
            unit,
            series: result.id,
            values: result.values
          }))
        )
      );
      return answers.flat();
    }
    const requests = series.flatMap((entry) =>
      levels.map((level) => ({ entry, level }))
    );
    const answers = await inBatches(requests, ({ entry, level }) =>
      get(
        `data/by-variable/${entry.id}`,
        [
          ['unit-level', String(level)],
          ...yearParams,
          ['page-size', String(PAGE_SIZE)]
        ],
        lang,
        dataByVariableSchema,
        DATA_TTL_SECONDS
      ).then((data) =>
        data.results.map((result) => ({
          unit: result.id,
          series: entry.id,
          values: result.values
        }))
      )
    );
    return answers.flat();
  }

  return {
    listTables,

    async search(lang, query, searchOptions) {
      labelsFor(lang);
      return (await tableIndex(lang)).search(query, searchOptions);
    },

    async getMetadata(lang, tableId) {
      return (await cachedTable(lang, tableId)).metadata;
    },

    async query(lang, tableId, selections) {
      const labels = labelsFor(lang);
      const table = await cachedTable(lang, tableId);
      const byCode = new Map(
        selections.map((selection) => [selection.code, selection])
      );
      const pick = (variable: TableVariable) =>
        chosenCodes(variable, byCode.get(variable.code));
      const chosen = table.dimensions.map(pick);
      const units = pick(table.units);
      const years = pick(table.years);
      const series = table.series.filter((entry) =>
        entry.codes.every((code, index) => chosen[index]?.includes(code))
      );
      if (series.length === 0) {
        throw new PxwebError(
          'No series of this table has that combination of values. Choose other values with get_table_metadata.',
          400
        );
      }
      const cells = series.length * units.length * years.length;
      if (cells > maxCells) {
        throw new PxwebError(
          `The query could return ${cells} cells, above the limit of ${maxCells}. Select fewer values.`,
          400
        );
      }
      const yearParams = years.map((year): [string, string] => ['year', year]);
      const cellsByKey = new Map(
        (
          await fetchCells(
            lang,
            series,
            units,
            years.length === table.years.values.length ? [] : yearParams
          ).catch((err: unknown) => {
            if (
              err instanceof PxwebError &&
              (err.status === 400 || err.status === 412)
            ) {
              throw new PxwebError(
                `Statistics Poland (BDL) refused this selection: ${upstreamReason(err.message)}. Check the value codes with get_table_metadata.`,
                400
              );
            }
            throw upstreamError(err);
          })
        ).map((cell) => [`${cell.unit}|${cell.series}`, cell.values])
      );
      return {
        label: table.metadata.title,
        columns: [
          labels.unit,
          ...table.dimensions.map((dimension) => dimension.label),
          labels.year,
          labels.measure,
          labels.value
        ],
        rows: units.flatMap((unit) =>
          series.flatMap((entry) =>
            (cellsByKey.get(`${unit}|${entry.id}`) ?? []).map((value) => [
              valueLabel(table.units, unit),
              ...table.dimensions.map((dimension, index) =>
                valueLabel(dimension, entry.codes[index] ?? '')
              ),
              value.year,
              entry.measure,
              toValue(value)
            ])
          )
        )
      };
    }
  };
}
