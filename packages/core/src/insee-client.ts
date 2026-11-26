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
  TableVariable
} from '@/pxweb-client';
import { createTableIndexLoader, type TableDoc } from '@/table-index';

const TABLE_ID_PATTERN = /^[A-Z][A-Z0-9_]{0,99}$/;
const LANGUAGES = new Set(['fr', 'en']);
const TIME_CODE = 'TIME_PERIOD';
/** Data answers name a territory with its vintage ("2025-DEP-976"); filters take "DEP-976". */
const GEO_VINTAGE = /^\d{4}-/;
const DEFAULT_MAX_CELLS = 100_000;
const MAX_CACHED_TABLES = 20;
const VALUE_LABELS: Readonly<Record<string, string>> = {
  fr: 'Valeur',
  en: 'Value'
};
/** Licence Ouverte asks reusers to give the date of the last update. */
const UPDATED_LABELS: Readonly<Record<string, string>> = {
  fr: 'dernière mise à jour',
  en: 'last update'
};

export interface InseeClientOptions extends HttpOptions {
  /** Melodi root, for example "https://api.insee.fr/melodi". */
  baseUrl: string;
  /** Full dataset list (the crawled snapshot); Melodi has no search. */
  tableList?: (lang: string) => Promise<readonly TableDoc[]>;
  /** Upper limit of observations in one data request. */
  maxCells?: number;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

const labelsSchema = z.record(z.string(), z.string()).optional();
const textsSchema = z
  .array(z.object({ content: z.string().optional(), lang: z.string() }))
  .nullish();

const rangeSchema = z.object({
  label: labelsSchema,
  range: z.array(
    z.object({
      concept: z.object({ code: z.string(), label: labelsSchema }),
      type: z.string(),
      values: z
        .array(
          z.object({
            code: z.string(),
            id: z.string().optional(),
            label: labelsSchema
          })
        )
        .nullish()
    })
  )
});

const dataSchema = z.object({
  observations: z.array(
    z.object({
      dimensions: z.record(z.string(), z.string().nullable()),
      measures: z
        .record(
          z.string(),
          z.object({ value: z.unknown().optional() }).nullable()
        )
        .optional()
    })
  )
});

const catalogSchema = z.array(
  z.object({
    identifier: z.string(),
    title: textsSchema,
    modified: z.string().nullish(),
    numObservations: z.number().nullish(),
    temporal: z.object({ endPeriod: z.string().optional() }).nullish(),
    theme: z
      .array(z.object({ label: textsSchema, themeTaxonomy: z.string() }))
      .nullish()
  })
);

type Range = z.infer<typeof rangeSchema>;
type Observation = z.infer<typeof dataSchema>['observations'][number];

interface MelodiTable {
  metadata: TableMetadata;
  geoCodes: ReadonlySet<string>;
}

function text(
  texts: z.infer<typeof textsSchema>,
  lang: string
): string | undefined {
  const pick = (wanted: string) =>
    texts?.find((item) => item.lang === wanted)?.content?.trim();
  return pick(lang) || pick('fr');
}

function label(
  labels: Readonly<Record<string, string>> | undefined,
  lang: string,
  fallback: string
): string {
  return (labels?.[lang] ?? labels?.fr ?? fallback).trim();
}

function byPeriod(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

/** "2026", "2026-09" and "2026-Q3" have different shapes: one per frequency. */
function periodShape(code: string): string {
  return code.replace(/\d/g, '9');
}

/** `latest` picks the newest periods of each frequency, so annual and monthly series both get data. */
function newestPerFrequency(codes: readonly string[], count: number): string[] {
  const byShape = new Map<string, string[]>();
  for (const code of codes) {
    const shape = periodShape(code);
    byShape.set(shape, [...(byShape.get(shape) ?? []), code]);
  }
  return [...byShape.values()].flatMap((list) => list.slice(-count));
}

function chosenCodes(
  variable: TableVariable,
  selection: PxwebSelection | undefined
): string[] {
  if (!selection || selection.selection.filter === 'all') return [];
  const { filter, values } = selection.selection;
  if (filter === 'item') return values;
  const count = Math.max(1, Number(values[0]) || 1);
  if (variable.isTime) return newestPerFrequency(variable.values, count);
  return variable.values.slice(-count);
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (const [index, value] of a.entries()) {
    const difference = value - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function notFound(tableId: string): PxwebError {
  return new PxwebError(
    `Table "${tableId}" was not found. Use search_tables to find a table id.`,
    404
  );
}

function checkLanguage(lang: string): void {
  if (!LANGUAGES.has(lang)) {
    throw new PxwebError(`Language "${lang}" is not supported.`, 400);
  }
}

function toVariables(
  range: Range,
  dimensions: ReadonlySet<string>,
  lang: string
): TableVariable[] {
  const variables = range.range
    .filter((entry) => dimensions.has(entry.concept.code))
    .map((entry) => {
      const values = (entry.values ?? []).map((value) => ({
        code:
          entry.type === 'geo' && value.id
            ? value.id.replace(GEO_VINTAGE, '')
            : value.code,
        label: label(value.label, lang, value.code)
      }));
      const isTime = entry.concept.code === TIME_CODE;
      if (isTime) values.sort((a, b) => byPeriod(a.code, b.code));
      return {
        code: entry.concept.code,
        label: label(entry.concept.label, lang, entry.concept.code),
        values: values.map((value) => value.code),
        valueLabels: values.map((value) => value.label),
        eliminable: false,
        isTime
      };
    });
  return [
    ...variables.filter((variable) => !variable.isTime),
    ...variables.filter((variable) => variable.isTime)
  ];
}

function measureValue(observation: Observation): number | null {
  const value = Object.values(observation.measures ?? {})[0]?.value;
  return typeof value === 'number' ? value : null;
}

export function createInseeClient(
  options: InseeClientOptions
): Required<PxwebClient> {
  const root = options.baseUrl.replace(/\/+$/, '');
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;
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

  function get<T, R>(
    url: string,
    schema: z.ZodType<T>,
    map: (data: T) => R,
    ttlSeconds: number
  ): Promise<R> {
    return request(
      url,
      // Ranges with every commune are 13 MB; gzip cuts the download from 31 s to 5 s.
      { method: 'GET', headers: { 'accept-encoding': 'gzip' } },
      schema,
      map,
      ttlSeconds,
      url
    );
  }

  async function titleOf(
    lang: string,
    tableId: string,
    title: string
  ): Promise<string> {
    const hit = await tableIndex(lang)
      .then((index) => index.search(tableId)[0])
      .catch(() => undefined);
    if (hit?.tableId !== tableId || !hit.published) return title;
    return `${title} (${UPDATED_LABELS[lang] ?? UPDATED_LABELS.en}: ${hit.published})`;
  }

  // A commune-level range is 13 MB, above the shared cache's entry size, so the parsed
  // table is kept here; metadata and query of one tool call share it.
  const tables = new Map<
    string,
    { expires: number; table: Promise<MelodiTable> }
  >();

  function cachedTable(lang: string, tableId: string): Promise<MelodiTable> {
    const key = `${lang}:${tableId}`;
    const cached = tables.get(key);
    if (cached && cached.expires > Date.now()) return cached.table;
    const table = loadTable(lang, tableId);
    tables.delete(key);
    tables.set(key, {
      expires: Date.now() + METADATA_TTL_SECONDS * 1000,
      table
    });
    table.catch(() => tables.delete(key));
    const oldest = tables.keys().next().value;
    if (tables.size > MAX_CACHED_TABLES && oldest !== undefined) {
      tables.delete(oldest);
    }
    return table;
  }

  async function loadTable(
    lang: string,
    tableId: string
  ): Promise<MelodiTable> {
    checkLanguage(lang);
    if (!TABLE_ID_PATTERN.test(tableId)) {
      throw new PxwebError(
        `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
        400
      );
    }
    const [range, probe] = await Promise.all([
      get(
        `${root}/range/${tableId}`,
        rangeSchema,
        (data) => data,
        METADATA_TTL_SECONDS
      ),
      get(
        `${root}/data/${tableId}?maxResult=1`,
        dataSchema,
        (data) => data.observations[0],
        METADATA_TTL_SECONDS
      )
    ]).catch((err: unknown) => {
      if (
        err instanceof PxwebError &&
        (err.status === 400 || err.status === 404)
      )
        throw notFound(tableId);
      throw err;
    });
    if (!probe) {
      throw new PxwebError(
        `Dataset "${tableId}" has no data. Use search_tables to find a current dataset.`,
        404
      );
    }
    const variables = toVariables(
      range,
      new Set(Object.keys(probe.dimensions)),
      lang
    );
    const geoCodes = new Set(
      range.range
        .filter((entry) => entry.type === 'geo')
        .map((entry) => entry.concept.code)
    );
    return {
      metadata: {
        title: await titleOf(lang, tableId, label(range.label, lang, tableId)),
        variables
      },
      geoCodes
    };
  }

  async function listTables(lang: string): Promise<TableDoc[]> {
    checkLanguage(lang);
    return get(
      `${root}/catalog/all`,
      catalogSchema,
      (datasets) =>
        datasets.map((dataset): TableDoc => {
          const theme = dataset.theme?.find(
            (item) => item.themeTaxonomy === 'inseeTheme'
          );
          const folder = theme && text(theme.label, lang);
          const updated = dataset.modified?.slice(0, 10);
          const lastPeriod = dataset.temporal?.endPeriod?.slice(0, 4);
          return {
            id: dataset.identifier,
            title: text(dataset.title, lang) ?? dataset.identifier,
            ...(folder && { path: [folder] }),
            ...(updated && { updated }),
            ...(lastPeriod && { lastPeriod }),
            ...(!dataset.numObservations && { discontinued: true })
          };
        }),
      SEARCH_TTL_SECONDS
    );
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
      const table = await cachedTable(lang, tableId);
      const { variables } = table.metadata;
      const byCode = new Map(
        selections.map((selection) => [selection.code, selection])
      );
      const params: string[] = [];
      let cells = 1;
      let periods: ReadonlySet<string> | undefined;
      for (const variable of variables) {
        const codes = chosenCodes(variable, byCode.get(variable.code));
        cells *= codes.length || variable.values.length;
        if (variable.isTime && codes.length > 0) periods = new Set(codes);
        for (const code of codes) {
          params.push(
            `${encodeURIComponent(variable.code)}=${encodeURIComponent(code)}`
          );
        }
      }
      if (cells > maxCells) {
        throw new PxwebError(
          `The query could return ${cells} cells, above the limit of ${maxCells}. Select fewer values.`,
          400
        );
      }
      const timeIndex = variables.findIndex((variable) => variable.isTime);
      // Melodi matches a period by its first day: "2025" also returns the monthly
      // "2025-01". The bound leaves room for one such match per frequency, and rows
      // outside the chosen periods are dropped.
      const frequencies =
        new Set(variables[timeIndex]?.values.map(periodShape)).size || 1;
      const url = `${root}/data/${tableId}?${[...params, `maxResult=${Math.max(1, cells * frequencies)}`].join('&')}`;
      const positions = variables.map(
        (variable) =>
          new Map(variable.values.map((value, index) => [value, index]))
      );
      const toRow = (observation: Observation) => {
        const codes = variables.map((variable) => {
          const raw = observation.dimensions[variable.code] ?? '';
          return table.geoCodes.has(variable.code)
            ? raw.replace(GEO_VINTAGE, '')
            : raw;
        });
        const key = codes.map(
          (code, index) =>
            positions[index]?.get(code) ?? Number.MAX_SAFE_INTEGER
        );
        return { codes, key, value: measureValue(observation) };
      };
      return get(
        url,
        dataSchema,
        (data): FlatTable => ({
          label: table.metadata.title,
          columns: [
            ...variables.map((variable) => variable.label),
            VALUE_LABELS[lang] ?? 'Value'
          ],
          rows: data.observations
            .map(toRow)
            .filter(
              ({ codes }) => !periods || periods.has(codes[timeIndex] ?? '')
            )
            .toSorted((a, b) => compareKeys(a.key, b.key))
            .map(({ codes, key, value }) => [
              ...codes.map(
                (code, index) =>
                  variables[index]?.valueLabels[key[index] ?? -1] ?? code
              ),
              value
            ])
        }),
        DATA_TTL_SECONDS
      ).catch((err: unknown) => {
        if (err instanceof PxwebError && err.status === 400) {
          throw new PxwebError(
            `INSEE refused this selection: ${err.message.replace(/^PxWeb returned HTTP 400: /, '')}. Check the value codes with get_table_metadata.`,
            400
          );
        }
        if (err instanceof PxwebError && err.status >= 500) {
          throw new PxwebError(
            `INSEE could not answer this selection (HTTP ${err.status}). Select fewer values or try again later.`,
            502
          );
        }
        throw err;
      });
    }
  };
}
