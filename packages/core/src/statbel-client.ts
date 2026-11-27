import { z } from 'zod';

import {
  createTextRequester,
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
  TableVariable
} from '@/pxweb-client';
import {
  createTableIndexLoader,
  type TableDoc,
  type TableListOptions
} from '@/table-index';
import { normalize } from '@/text';

const VIEW_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANGUAGES = new Set(['nl', 'fr', 'en', 'de']);
const DEFAULT_MAX_CELLS = 5000;
const MAX_CACHED_TABLES = 20;
const TIME_CODE = 'period';
const MEASURE_CODE = 'indicator';
/** Code of the row that a view writes with an empty (null) cell: the total over that column. */
const TOTAL_CODE = '_T';
/** Measures carry float noise, for example 100.75000000000036. */
const SIGNIFICANT_DIGITS = 12;

interface Texts {
  period: string;
  measure: string;
  value: string;
  total: string;
  updated: string;
}

const EN_TEXTS: Texts = {
  period: 'Period',
  measure: 'Indicator',
  value: 'Value',
  total: 'Total',
  updated: 'last update'
};

const TEXTS: Readonly<Record<string, Texts>> = {
  en: EN_TEXTS,
  nl: {
    period: 'Periode',
    measure: 'Indicator',
    value: 'Waarde',
    total: 'Totaal',
    updated: 'laatst bijgewerkt'
  },
  fr: {
    period: 'Période',
    measure: 'Indicateur',
    value: 'Valeur',
    total: 'Total',
    updated: 'dernière mise à jour'
  },
  de: {
    period: 'Zeitraum',
    measure: 'Indikator',
    value: 'Wert',
    total: 'Insgesamt',
    updated: 'letzte Aktualisierung'
  }
};

type PeriodKind = 'month' | 'quarter' | 'half' | 'year';

const REFERENCE = '(?:reference ?|referentie|referenz)?';
const TIME_COLUMNS: readonly [PeriodKind, RegExp][] = [
  ['month', new RegExp(`^${REFERENCE}(?:month|maand|mois|monat)$`)],
  ['quarter', /^(?:quarter|kwartaal|trimester|trimestre|quartal)$/],
  ['half', /^(?:semester|semestre|halbjahr)$/],
  ['year', new RegExp(`^${REFERENCE}(?:year|jaar|annee|jahr)$`)]
];
const PERIOD_LETTERS: Readonly<Record<PeriodKind, string>> = {
  month: 'M',
  quarter: 'Q',
  half: 'S',
  year: ''
};
const PERIOD_MAX: Readonly<Record<PeriodKind, number>> = {
  month: 12,
  quarter: 4,
  half: 2,
  year: 0
};

const MONTH_NAMES: readonly (readonly string[])[] = [
  ['january', 'januari', 'janvier', 'januar'],
  ['february', 'februari', 'fevrier', 'februar'],
  ['march', 'maart', 'mars', 'marz'],
  ['april', 'avril'],
  ['may', 'mei', 'mai'],
  ['june', 'juni', 'juin'],
  ['july', 'juli', 'juillet'],
  ['august', 'augustus', 'aout'],
  ['september', 'septembre'],
  ['october', 'oktober', 'octobre'],
  ['november', 'novembre'],
  ['december', 'decembre', 'dezember']
];
const MONTHS = new Map(
  MONTH_NAMES.flatMap((names, index) =>
    names.map((name) => [name, index + 1] as const)
  )
);

export interface StatbelClientOptions extends HttpOptions, TableListOptions {
  /** be.STAT API root, for example "https://bestat.statbel.fgov.be/bestat/api". */
  baseUrl: string;
  /** Upper limit of cells (rows × indicators) in one result. */
  maxCells?: number;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

const viewSchema = z.object({
  id: z.string(),
  name: z.string(),
  locale: z.string(),
  dataSourceId: z.string().nullish(),
  lastPublishDate: z.number().nullish(),
  inapplicable: z.boolean().nullish()
});

const dataSourceSchema = z.object({
  id: z.string(),
  descriptions: z.record(z.string(), z.string().nullable()).nullish(),
  lastDataUpdateDate: z.number().nullish()
});

const resultSchema = z.object({
  facts: z.array(
    z.record(z.string(), z.union([z.string(), z.number(), z.null()]))
  )
});

type Fact = z.infer<typeof resultSchema>['facts'][number];

interface Period {
  code: string;
  label: string;
}

interface Row {
  /** One code per variable, the indicator left out. */
  codes: string[];
  values: (number | null)[];
}

interface StatbelTable {
  metadata: TableMetadata;
  /** Variables without the indicator, in the order of `Row.codes`. */
  variables: TableVariable[];
  indicator: TableVariable;
  rows: Row[];
  texts: Texts;
}

function parseJson<T>(text: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PxwebError('Statbel returned a response that is not JSON.', 502);
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new PxwebError('Statbel returned an unexpected response shape.', 502);
  }
  return result.data;
}

function isoDate(ms: number | null | undefined): string | undefined {
  return ms ? new Date(ms).toISOString().slice(0, 10) : undefined;
}

function checkLanguage(lang: string): void {
  if (!LANGUAGES.has(lang)) {
    throw new PxwebError(`Language "${lang}" is not supported.`, 400);
  }
}

function notFound(tableId: string): PxwebError {
  return new PxwebError(
    `Table "${tableId}" was not found. Use search_tables to find a table id.`,
    404
  );
}

function timeKind(column: string): PeriodKind | undefined {
  const name = normalize(column.trim(), 'en');
  return TIME_COLUMNS.find(([, pattern]) => pattern.test(name))?.[0];
}

/** "October 2025", "Octobre 2025", " 1", "3rd quarter 2025", "1ste kwartaal 2024", "2026". */
function parsePeriod(
  kind: PeriodKind,
  text: string
): { year?: string; part?: number } | undefined {
  const year = /(?<!\d)(\d{4})(?!\d)/.exec(text)?.[1];
  if (kind === 'year') return /^\d{4}$/.test(text) ? { year: text } : undefined;
  const rest = normalize(text.replace(year ?? '', ''), 'en').trim();
  const part =
    kind === 'month' && !/^\d+$/.test(rest)
      ? MONTHS.get(rest)
      : Number(/^(\d{1,2})(?!\d)/.exec(rest)?.[1]);
  if (!part || part > PERIOD_MAX[kind]) return undefined;
  return { ...(year && { year }), part };
}

/** The finest period of a row: null when every time cell is empty (a total), undefined when one does not parse. */
function rowPeriod(
  fact: Fact,
  columns: readonly [string, PeriodKind][]
): Period | null | undefined {
  let year: string | undefined;
  let finest: { kind: PeriodKind; part: number; label: string } | undefined;
  for (const [column, kind] of columns) {
    const cell = fact[column];
    if (typeof cell !== 'string') continue;
    const label = cell.trim();
    const parsed = parsePeriod(kind, label);
    if (!parsed) return undefined;
    year ??= parsed.year;
    if (parsed.part && (!finest || PERIOD_MAX[kind] > PERIOD_MAX[finest.kind]))
      finest = { kind, part: parsed.part, label };
  }
  if (!year && !finest) return null;
  if (!year) return undefined;
  if (!finest) return { code: year, label: year };
  const width = finest.kind === 'month' ? 2 : 1;
  const code = `${year}${PERIOD_LETTERS[finest.kind]}${String(finest.part).padStart(width, '0')}`;
  return { code, label: finest.label.includes(year) ? finest.label : code };
}

/** `latest` picks the newest periods of each frequency, so annual and monthly rows both get data. */
function newestPerFrequency(codes: readonly string[], count: number): string[] {
  const byShape = new Map<string, string[]>();
  for (const code of codes) {
    if (code === TOTAL_CODE) continue;
    const shape = code.replace(/\d/g, '9');
    byShape.set(shape, [...(byShape.get(shape) ?? []), code]);
  }
  return [...byShape.values()].flatMap((list) => list.slice(-count));
}

function chosenCodes(
  variable: TableVariable,
  selection: PxwebSelection | undefined
): string[] | undefined {
  if (!selection || selection.selection.filter === 'all') return undefined;
  const { filter, values } = selection.selection;
  if (filter === 'top') {
    const count = Math.max(1, Number(values[0]) || 1);
    if (variable.isTime) return newestPerFrequency(variable.values, count);
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

/** The total, when the column has one, comes first. */
function toVariable(
  code: string,
  label: string,
  labels: ReadonlyMap<string, string>,
  total: string | undefined,
  isTime: boolean
): TableVariable {
  const head: [string, string][] =
    total === undefined ? [] : [[TOTAL_CODE, total]];
  const entries = [...head, ...labels];
  return {
    code,
    label,
    values: entries.map(([value]) => value),
    valueLabels: entries.map(([, text]) => text),
    eliminable: total !== undefined,
    isTime
  };
}

function round(value: string | number | null | undefined): number | null {
  return typeof value === 'number'
    ? Number(value.toPrecision(SIGNIFICANT_DIGITS))
    : null;
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (const [index, value] of a.entries()) {
    const difference = value - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function toTable(
  facts: readonly Fact[],
  title: string,
  texts: Texts
): StatbelTable {
  const kinds = new Map<string, 'dimension' | 'measure'>();
  for (const fact of facts) {
    for (const [column, cell] of Object.entries(fact)) {
      if (typeof cell === 'string') kinds.set(column, 'dimension');
      else if (typeof cell === 'number' && !kinds.has(column))
        kinds.set(column, 'measure');
    }
  }
  const columnsOf = (kind: 'dimension' | 'measure') =>
    [...kinds].filter(([, value]) => value === kind).map(([column]) => column);
  const measures = columnsOf('measure');
  const timed = columnsOf('dimension').flatMap(
    (column): [string, PeriodKind][] => {
      const kind = timeKind(column);
      return kind ? [[column, kind]] : [];
    }
  );
  const periods = facts.map((fact) => rowPeriod(fact, timed));
  const hasTime =
    timed.length > 0 && periods.every((period) => period !== undefined);
  const timeColumns = new Set(hasTime ? timed.map(([column]) => column) : []);
  const dimensions = columnsOf('dimension').filter(
    (column) => !timeColumns.has(column)
  );

  const labels = [...dimensions, ...(hasTime ? [TIME_CODE] : [])].map(
    () => new Map<string, string>()
  );
  const rows = facts.map((fact, index): Row => {
    const cells: (Period | null | undefined)[] = dimensions.map((column) => {
      const cell = fact[column];
      return typeof cell === 'string'
        ? { code: cell.trim(), label: cell.trim() }
        : null;
    });
    if (hasTime) cells.push(periods[index]);
    cells.forEach((cell, position) => {
      if (cell) labels[position]?.set(cell.code, cell.label);
    });
    return {
      codes: cells.map((cell) => cell?.code ?? TOTAL_CODE),
      values: measures.map((measure) => round(fact[measure]))
    };
  });
  const totalOf = (position: number) =>
    rows.some((row) => row.codes[position] === TOTAL_CODE)
      ? texts.total
      : undefined;

  const variables = dimensions.map((column, position) =>
    toVariable(
      column.trim(),
      column.trim(),
      labels[position] ?? new Map(),
      totalOf(position),
      false
    )
  );
  if (hasTime) {
    const sorted = [...(labels[dimensions.length] ?? [])].toSorted(([a], [b]) =>
      a.localeCompare(b, 'en', { numeric: true })
    );
    variables.push(
      toVariable(
        TIME_CODE,
        texts.period,
        new Map(sorted),
        totalOf(dimensions.length),
        true
      )
    );
  }
  const indicator = toVariable(
    MEASURE_CODE,
    texts.measure,
    new Map(measures.map((measure) => [measure, measure.trim()])),
    undefined,
    false
  );
  return {
    metadata: { title, variables: [...variables, indicator] },
    variables,
    indicator,
    rows,
    texts
  };
}

/**
 * Client for be.STAT, the open data API of Statbel (Belgium).
 *
 * - Table id = be.STAT view id (a UUID). A view exists in one language only, so the
 *   same table in another language has another id. Labels follow the view's language.
 * - Search: a local index over `GET /views/` (all 1,377 views in one call) joined with
 *   `GET /datasources/` for the subject description (path) and the last data update.
 *   Both lists are one call each and cached for an hour, so no crawled snapshot is
 *   needed; `listFallback` can still supply one. The list is in no useful order, so
 *   the catalogue order is the last data update, newest first: an old copy of a view
 *   (same title, a data source that stopped) then ranks below the current one.
 *   "Inapplicable" views answer with an empty body and are marked discontinued.
 * - Metadata and query read `GET /views/{id}/result/JSON`, a flat list of facts.
 *   String columns are dimensions, number columns are indicators (one variable).
 *   Value codes are the trimmed labels; a null cell is the total over that column
 *   (code "_T"), so a variable with totals is optional and a left-out optional
 *   variable keeps only its total rows when there are any. Time columns (Year, Month,
 *   Quarter, Semester in en/nl/fr/de) merge into one "period" variable with codes
 *   such as "2026", "2026M10", "2026Q2" and "2026S1".
 * - The query filters the cached facts locally and returns one row per indicator.
 */
export function createStatbelClient(
  options: StatbelClientOptions
): Required<PxwebClient> {
  const root = options.baseUrl.replace(/\/+$/, '');
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;
  const now = options.now ?? (() => new Date());
  const request = createTextRequester(options);

  function get<R>(
    path: string,
    map: (text: string) => R,
    ttlSeconds: number
  ): Promise<R> {
    const url = `${root}/${path}`;
    return request(url, { method: 'GET' }, map, ttlSeconds, url);
  }

  async function listTables(lang: string): Promise<TableDoc[]> {
    checkLanguage(lang);
    const [views, dataSources] = await Promise.all([
      get(
        'views/',
        (text) => parseJson(text, z.array(viewSchema)),
        SEARCH_TTL_SECONDS
      ),
      get(
        'datasources/',
        (text) => parseJson(text, z.array(dataSourceSchema)),
        SEARCH_TTL_SECONDS
      ).catch(() => [])
    ]);
    const sources = new Map(dataSources.map((source) => [source.id, source]));
    return views
      .filter((view) => view.locale === lang)
      .map((view): TableDoc => {
        const source = sources.get(view.dataSourceId ?? '');
        const description = source?.descriptions?.[lang]?.trim();
        const updated = isoDate(
          source?.lastDataUpdateDate ?? view.lastPublishDate
        );
        return {
          id: view.id,
          title: view.name.trim(),
          ...(description && { path: [description] }),
          ...(updated && { updated }),
          ...(view.inapplicable && { discontinued: true })
        };
      })
      .toSorted((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
  }

  const tableIndex = createTableIndexLoader(listTables, {
    fallback: options.listFallback,
    ttlSeconds: SEARCH_TTL_SECONDS,
    currentYear: () => now().getUTCFullYear()
  });

  async function loadTable(
    lang: string,
    tableId: string
  ): Promise<StatbelTable> {
    checkLanguage(lang);
    if (!VIEW_ID_PATTERN.test(tableId)) {
      throw new PxwebError(
        `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
        400
      );
    }
    const [view, result] = await Promise.all([
      get(
        `views/${tableId}`,
        (text) => parseJson(text, viewSchema),
        METADATA_TTL_SECONDS
      ),
      get(
        `views/${tableId}/result/JSON`,
        (text) => (text.trim() ? parseJson(text, resultSchema) : undefined),
        DATA_TTL_SECONDS
      )
    ]).catch((err: unknown) => {
      if (err instanceof PxwebError && err.status === 404)
        throw notFound(tableId);
      if (err instanceof PxwebError && err.status >= 500) {
        throw new PxwebError(
          `Statbel could not answer for table "${tableId}" (HTTP ${err.status}). Try again later or use another table.`,
          502
        );
      }
      throw err;
    });
    if (!result || result.facts.length === 0) {
      throw new PxwebError(
        `Table "${tableId}" has no data now. Use search_tables to find a current table.`,
        404
      );
    }
    const texts = TEXTS[view.locale] ?? EN_TEXTS;
    const updated = view.dataSourceId
      ? await get(
          `datasources/${view.dataSourceId}`,
          (text) =>
            isoDate(parseJson(text, dataSourceSchema).lastDataUpdateDate),
          DATA_TTL_SECONDS
        ).catch(() => undefined)
      : undefined;
    const name = view.name.trim();
    const title = updated ? `${name} (${texts.updated}: ${updated})` : name;
    return toTable(result.facts, title, texts);
  }

  // A large view is above the shared cache's entry size, so the parsed table is kept
  // here. Only finished tables are kept: on Workers, a pending load can belong to a
  // request that the runtime stopped.
  const tables = new Map<string, { expires: number; table: StatbelTable }>();

  async function cachedTable(
    lang: string,
    tableId: string
  ): Promise<StatbelTable> {
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

  return {
    listTables,

    async search(lang, query, searchOptions) {
      checkLanguage(lang);
      return (await tableIndex(lang)).search(query, searchOptions);
    },

    async getMetadata(lang, tableId) {
      return (await cachedTable(lang, tableId)).metadata;
    },

    async query(lang, tableId, selections): Promise<FlatTable> {
      const table = await cachedTable(lang, tableId);
      const byCode = new Map(
        selections.map((selection) => [selection.code, selection])
      );
      let rows = table.rows;
      table.variables.forEach((variable, position) => {
        const codes = chosenCodes(variable, byCode.get(variable.code));
        if (!codes) return;
        const wanted = new Set(codes);
        rows = rows.filter((row) => wanted.has(row.codes[position] ?? ''));
      });
      table.variables.forEach((variable, position) => {
        if (!variable.eliminable || byCode.has(variable.code)) return;
        const totals = rows.filter((row) => row.codes[position] === TOTAL_CODE);
        if (totals.length > 0) rows = totals;
      });
      const indicators = (
        chosenCodes(table.indicator, byCode.get(MEASURE_CODE)) ??
        table.indicator.values
      ).map((code) => table.indicator.values.indexOf(code));
      const cells = rows.length * indicators.length;
      if (cells > maxCells) {
        throw new PxwebError(
          `The query returns ${cells} cells, above the limit of ${maxCells}. Select fewer values.`,
          400
        );
      }
      const positions = table.variables.map(
        (variable) =>
          new Map(variable.values.map((value, index) => [value, index]))
      );
      const sorted = rows
        .map((row) => ({
          row,
          key: row.codes.map(
            (code, position) => positions[position]?.get(code) ?? 0
          )
        }))
        .toSorted((a, b) => compareKeys(a.key, b.key));
      return {
        label: table.metadata.title,
        columns: [
          ...table.variables.map((variable) => variable.label),
          table.indicator.label,
          table.texts.value
        ],
        rows: sorted.flatMap(({ row, key }) =>
          indicators.map((index) => [
            ...row.codes.map(
              (code, position) =>
                table.variables[position]?.valueLabels[key[position] ?? -1] ??
                code
            ),
            table.indicator.valueLabels[index] ?? '',
            row.values[index] ?? null
          ])
        )
      };
    }
  };
}
