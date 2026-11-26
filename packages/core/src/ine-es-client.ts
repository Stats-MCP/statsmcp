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

const TABLE_ID_PATTERN = /^\d+$/;
const LANGUAGES: Readonly<Record<string, string>> = { es: 'ES', en: 'EN' };
const TIME_CODE = 'period';
const TIME_LABELS: Readonly<Record<string, string>> = {
  es: 'Periodo',
  en: 'Period'
};
const VALUE_LABELS: Readonly<Record<string, string>> = {
  es: 'Valor',
  en: 'Value'
};
/** The INE licence asks reusers to give the date of the last update. */
const UPDATED_LABELS: Readonly<Record<string, string>> = {
  es: 'última actualización',
  en: 'last update'
};
/** DATOS_TABLA without nult or date sends the full history of every series. */
const PROBE_PERIODS = 10_000;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

export interface IneEsClientOptions extends HttpOptions {
  /** Tempus3 JSON root, for example "https://servicios.ine.es/wstempus/js". */
  baseUrl: string;
  /** Full table list (the crawled snapshot); Tempus3 has no search. */
  tableList?: (lang: string) => Promise<readonly TableDoc[]>;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

const operationsSchema = z.array(
  z.object({ Id: z.number(), Nombre: z.string() })
);

const tablesSchema = z.array(
  z.object({
    Id: z.number(),
    Nombre: z.string(),
    Ultima_Modificacion: z.string().optional(),
    FK_Periodo_fin: z.number().optional(),
    Anyo_Periodo_fin: z.string().optional()
  })
);

const groupsSchema = z.array(z.object({ Id: z.number(), Nombre: z.string() }));

const valuesSchema = z.array(
  z.object({ Id: z.number(), FK_Variable: z.number(), Nombre: z.string() })
);

const seriesSchema = z.array(
  z.object({
    MetaData: z.array(z.object({ Id: z.number() })).default([]),
    Data: z.array(
      z.object({
        Fecha: z.number(),
        FK_Periodo: z.number(),
        Anyo: z.number(),
        Valor: z.number().nullish(),
        Secreto: z.boolean().optional()
      })
    )
  })
);

type Series = z.infer<typeof seriesSchema>;
type Point = Series[number]['Data'][number];

interface IneTable {
  metadata: TableMetadata;
  /** Value code → Tempus variable id, for the `tv=<variable>:<value>` filter. */
  variableOf: ReadonlyMap<string, number>;
  /** Period code → its first day as YYYYMMDD, for the `date` filter. */
  periodDates: ReadonlyMap<string, string>;
}

function periodCode(year: number, period: number): string | undefined {
  if (period >= 1 && period <= 12)
    return `${year}M${String(period).padStart(2, '0')}`;
  if (period >= 19 && period <= 22) return `${year}Q${period - 18}`;
  if (period === 28) return String(year);
  return undefined;
}

/** Fecha is midnight in Madrid; noon UTC of the same instant keeps its calendar day. */
function madridDate(fecha: number): string {
  return new Date(fecha + 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function pointCode(point: Point): string {
  return periodCode(point.Anyo, point.FK_Periodo) ?? madridDate(point.Fecha);
}

/** "Fri Nov 13 09:00:00 CET 2026" → "2026-11-13". */
function isoDate(text: string | undefined): string | undefined {
  const match = /^\w{3} (\w{3}) (\d{2}) \S+ \S+ (\d{4})$/.exec(text ?? '');
  const month = MONTHS.indexOf(match?.[1] ?? '');
  if (!match || month < 0) return undefined;
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[2]}`;
}

function notFound(tableId: string): PxwebError {
  return new PxwebError(
    `Table "${tableId}" was not found. Use search_tables to find a table id.`,
    404
  );
}

function pathLanguage(lang: string): string {
  const code = LANGUAGES[lang];
  if (!code) throw new PxwebError(`Language "${lang}" is not supported.`, 400);
  return code;
}

function chosenCodes(
  variable: TableVariable,
  selection: PxwebSelection | undefined
): string[] {
  if (!selection || selection.selection.filter === 'all') return [];
  const { filter, values } = selection.selection;
  if (filter === 'top') {
    return variable.values.slice(-Math.max(1, Number(values[0]) || 1));
  }
  return values;
}

function timeParams(
  table: IneTable,
  selection: PxwebSelection | undefined
): { params: string[]; keep?: ReadonlySet<string> } {
  const periods = table.periodDates.size;
  if (!selection || selection.selection.filter === 'all') {
    if (periods === 0) {
      throw new PxwebError(
        `The periods of this table are not known. Use latest on "${TIME_CODE}".`,
        400
      );
    }
    return { params: [`nult=${periods}`] };
  }
  const { filter, values } = selection.selection;
  if (filter === 'top') {
    return { params: [`nult=${Math.max(1, Number(values[0]) || 1)}`] };
  }
  const dates = values
    .map((code) => table.periodDates.get(code))
    .filter((date): date is string => date !== undefined)
    .toSorted();
  const [first] = dates;
  const last = dates.at(-1);
  if (!first || !last) {
    throw new PxwebError(
      `Unknown periods ${values.join(', ')}. Call get_table_metadata to see valid periods.`,
      400
    );
  }
  return { params: [`date=${first}:${last}`], keep: new Set(values) };
}

export function createIneEsClient(
  options: IneEsClientOptions
): Required<PxwebClient> {
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

  function get<T, R>(
    url: string,
    schema: z.ZodType<T>,
    map: (data: T) => R,
    ttlSeconds: number
  ): Promise<R> {
    return request(url, { method: 'GET' }, schema, map, ttlSeconds, url);
  }

  async function titleOf(lang: string, tableId: string): Promise<string> {
    const hit = await tableIndex(lang)
      .then((index) => index.search(tableId)[0])
      .catch(() => undefined);
    if (hit?.tableId !== tableId) return `INE ${tableId}`;
    if (!hit.published) return hit.title;
    return `${hit.title} (${UPDATED_LABELS[lang] ?? UPDATED_LABELS.en}: ${hit.published})`;
  }

  async function loadTable(lang: string, tableId: string): Promise<IneTable> {
    if (!TABLE_ID_PATTERN.test(tableId)) {
      throw new PxwebError(
        `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
        400
      );
    }
    const base = `${root}/${pathLanguage(lang)}`;
    const groups = await get(
      `${base}/GRUPOS_TABLA/${tableId}`,
      groupsSchema,
      (data) => data,
      METADATA_TTL_SECONDS
    ).catch((err: unknown) => {
      if (err instanceof PxwebError && err.status === 404)
        throw notFound(tableId);
      throw err;
    });
    if (groups.length === 0) throw notFound(tableId);
    const groupValues = await Promise.all(
      groups.map((group) =>
        get(
          `${base}/VALORES_GRUPOSTABLA/${tableId}/${group.Id}`,
          valuesSchema,
          (data) => data,
          METADATA_TTL_SECONDS
        )
      )
    );
    const variableOf = new Map<string, number>();
    const variables: TableVariable[] = groups.map((group, index) => {
      const values = groupValues[index] ?? [];
      for (const value of values) {
        if (!variableOf.has(String(value.Id)))
          variableOf.set(String(value.Id), value.FK_Variable);
      }
      return {
        code: String(group.Id),
        label: group.Nombre.trim(),
        values: values.map((value) => String(value.Id)),
        valueLabels: values.map((value) => value.Nombre.trim()),
        eliminable: false,
        isTime: false
      };
    });
    const probe = groupValues
      .map((values) => values[0])
      .filter((value) => value !== undefined)
      .map((value) => `tv=${value.FK_Variable}:${value.Id}`);
    const [series] = await get(
      `${base}/DATOS_TABLA/${tableId}?${[...probe, `nult=${PROBE_PERIODS}`, 'tip=M'].join('&')}`,
      seriesSchema,
      (data) => data,
      DATA_TTL_SECONDS
    ).catch(() => []);
    const periodDates = new Map(
      (series?.Data ?? [])
        .toSorted((a, b) => a.Fecha - b.Fecha)
        .map((point) => [
          pointCode(point),
          madridDate(point.Fecha).replaceAll('-', '')
        ])
    );
    const periods = [...periodDates.keys()];
    variables.push({
      code: TIME_CODE,
      label: TIME_LABELS[lang] ?? TIME_CODE,
      values: periods,
      valueLabels: periods,
      eliminable: false,
      isTime: true,
      ...(periods.length === 0 && { periodsIncomplete: true })
    });
    return {
      metadata: { title: await titleOf(lang, tableId), variables },
      variableOf,
      periodDates
    };
  }

  async function listTables(lang: string): Promise<TableDoc[]> {
    const base = `${root}/${pathLanguage(lang)}`;
    const operations = await get(
      `${base}/OPERACIONES_DISPONIBLES`,
      operationsSchema,
      (data) => data,
      SEARCH_TTL_SECONDS
    );
    const docs = new Map<string, TableDoc>();
    for (const operation of operations) {
      const tables = await get(
        `${base}/TABLAS_OPERACION/${operation.Id}`,
        tablesSchema,
        (data) => data,
        SEARCH_TTL_SECONDS
      );
      for (const table of tables) {
        const id = String(table.Id);
        if (docs.has(id)) continue;
        const updated = isoDate(table.Ultima_Modificacion);
        const endYear = table.Anyo_Periodo_fin;
        const lastPeriod =
          endYear &&
          (periodCode(Number(endYear), table.FK_Periodo_fin ?? 0) ?? endYear);
        docs.set(id, {
          id,
          title: table.Nombre.trim(),
          path: [operation.Nombre.trim()],
          ...(updated && { updated }),
          ...(lastPeriod && { lastPeriod })
        });
      }
    }
    return [...docs.values()];
  }

  return {
    listTables,

    async search(lang, query, searchOptions) {
      pathLanguage(lang);
      return (await tableIndex(lang)).search(query, searchOptions);
    },

    async getMetadata(lang, tableId) {
      return (await loadTable(lang, tableId)).metadata;
    },

    async query(lang, tableId, selections) {
      const table = await loadTable(lang, tableId);
      const byCode = new Map(
        selections.map((selection) => [selection.code, selection])
      );
      const groups = table.metadata.variables.filter(
        (variable) => !variable.isTime
      );
      const filters = groups.flatMap((variable) =>
        chosenCodes(variable, byCode.get(variable.code)).map((code) => {
          const variableId = table.variableOf.get(code);
          if (variableId === undefined) {
            throw new PxwebError(
              `Variable "${variable.code}" has no value ${code}. Call get_table_metadata to see valid value codes.`,
              400
            );
          }
          return `tv=${variableId}:${code}`;
        })
      );
      const time = timeParams(table, byCode.get(TIME_CODE));
      const url = `${root}/${pathLanguage(lang)}/DATOS_TABLA/${tableId}?${[...filters, ...time.params, 'tip=M'].join('&')}`;
      const labels = groups.map(
        (variable) =>
          new Map(
            variable.values.map((value, index) => [
              Number(value),
              variable.valueLabels[index] ?? value
            ])
          )
      );
      return get(
        url,
        seriesSchema,
        (series): FlatTable => ({
          label: table.metadata.title,
          columns: [
            ...groups.map((variable) => variable.label),
            TIME_LABELS[lang] ?? TIME_CODE,
            VALUE_LABELS[lang] ?? 'Value'
          ],
          rows: series.flatMap((item) => {
            const cells = labels.map(
              (byId) =>
                item.MetaData.map((meta) => byId.get(meta.Id)).find(
                  (label) => label !== undefined
                ) ?? null
            );
            return item.Data.toSorted((a, b) => a.Fecha - b.Fecha)
              .map((point) => ({ point, code: pointCode(point) }))
              .filter(({ code }) => !time.keep || time.keep.has(code))
              .map(({ point, code }) => [
                ...cells,
                code,
                point.Secreto ? null : (point.Valor ?? null)
              ]);
          })
        }),
        DATA_TTL_SECONDS
      ).catch((err: unknown) => {
        if (err instanceof PxwebError && err.status >= 500) {
          throw new PxwebError(
            `INE could not answer this selection (HTTP ${err.status}). Check the value codes with get_table_metadata, or select fewer values.`,
            502
          );
        }
        throw err;
      });
    }
  };
}
