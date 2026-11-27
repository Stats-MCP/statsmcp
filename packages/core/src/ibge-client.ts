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
  type TableListOptions
} from '@/table-index';

const TABLE_ID_PATTERN = /^\d{1,7}$/;
const LANGUAGE = 'pt';
const DEFAULT_SIDRA_URL = 'https://apisidra.ibge.gov.br/values';
const DEFAULT_MAX_CELLS = 5_000;
const MAX_CACHED_TABLES = 8;
const VARIABLE_CODE = 'variavel';
const LOCALITY_CODE = 'localidade';
const PERIOD_CODE = 'periodo';
const COUNTRY_LEVEL = 'N1';
/**
 * Brazil, major regions, states and municipalities. The localities endpoint answers
 * an empty list for metropolitan regions (N7) and some other levels, and one empty
 * level empties the whole answer, so only these are asked for.
 */
const LOCALITY_LEVELS = ['N1', 'N2', 'N3', 'N6'];
const LOCALITY_PATTERN = /^N(\d+):(\d+)$/;
/** "(série encerrada em 2021)", or a closed range such as "(de janeiro/2012 até dezembro/2019)". */
const CLOSED_TITLE =
  /s[ée]rie (encerrada|descontinuada|suspensa)|até (\p{L}+\/)?\d{4}\)\s*$/iu;
/**
 * Survey groups whose aggregates all ended long ago (checked on 2026-11-27):
 * PME (ended 2016-02), PNAD (2015), PIMES (2015-12), PIM Dados Gerais (2001),
 * the old PIA (1995), IPC-r (1995), IRSM and INPC-E (1994).
 */
const DISCONTINUED_GROUPS = new Set([
  'PE',
  'PD',
  'XY',
  'DG',
  'PI',
  'IL',
  'IJ',
  'PG'
]);

export interface IbgeClientOptions extends HttpOptions, TableListOptions {
  /** Aggregates API root, for example "https://servicodados.ibge.gov.br/api/v3/agregados". */
  baseUrl: string;
  /** SIDRA values API root; defaults to "https://apisidra.ibge.gov.br/values". */
  sidraUrl?: string;
  /** Upper limit of cells in one data request. */
  maxCells?: number;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

const catalogueSchema = z.array(
  z.object({
    id: z.string(),
    nome: z.string(),
    agregados: z.array(z.object({ id: z.string(), nome: z.string() }))
  })
);

const metadataSchema = z.object({
  nome: z.string(),
  nivelTerritorial: z.record(z.string(), z.array(z.string())),
  variaveis: z.array(
    z.object({
      id: z.number(),
      nome: z.string(),
      unidade: z.string().nullish()
    })
  ),
  classificacoes: z
    .array(
      z.object({
        id: z.number(),
        nome: z.string(),
        sumarizacao: z.object({ status: z.boolean() }),
        categorias: z.array(z.object({ id: z.number(), nome: z.string() }))
      })
    )
    .default([])
});

const periodsSchema = z.array(
  z.object({ id: z.string(), literals: z.array(z.string()) })
);

const localitiesSchema = z.array(
  z.object({
    id: z.string(),
    nome: z.string(),
    nivel: z.object({ id: z.string() })
  })
);

/** The first row holds the column titles; the rest are cells. */
const valuesSchema = z.array(z.record(z.string(), z.string()));

function notFound(tableId: string): PxwebError {
  return new PxwebError(
    `Table "${tableId}" was not found. Use search_tables to find a table id.`,
    404
  );
}

function checkLanguage(lang: string): void {
  if (lang !== LANGUAGE) {
    throw new PxwebError(`Language "${lang}" is not supported.`, 400);
  }
}

function upstreamError(err: unknown): unknown {
  if (err instanceof PxwebError && err.status >= 500) {
    return new PxwebError(
      `IBGE could not answer (HTTP ${err.status}). Try again later.`,
      502
    );
  }
  return err;
}

function withUnit(name: string, unit: string | null | undefined): string {
  const label = name.trim();
  if (!unit || unit === 'Nenhuma' || label.endsWith(')')) return label;
  return `${label} (${unit})`;
}

/** IBGE writes "-" for a true zero and "..", "..." or "X" for missing or withheld data. */
function toNumber(value: string | undefined): number | null {
  if (value === '-') return 0;
  const number = Number(value);
  return value && Number.isFinite(number) ? number : null;
}

function chosenCodes(
  variable: TableVariable,
  selection: PxwebSelection | undefined
): string[] | undefined {
  if (!selection || selection.selection.filter === 'all') return undefined;
  const { filter, values } = selection.selection;
  if (filter === 'item') return values;
  return variable.values.slice(-Math.max(1, Number(values[0]) || 1));
}

function localitySegments(codes: readonly string[]): string {
  const byLevel = new Map<string, string[]>();
  for (const code of codes) {
    const match = LOCALITY_PATTERN.exec(code);
    if (!match) {
      throw new PxwebError(
        `Unknown locality "${code}". Use the codes from get_table_metadata.`,
        400
      );
    }
    const level = `n${match[1]}`;
    byLevel.set(level, [...(byLevel.get(level) ?? []), match[2] ?? '']);
  }
  return [...byLevel]
    .map(([level, ids]) => `${level}/${ids.join(',')}`)
    .join('/');
}

function allLevels(variable: TableVariable): string {
  const levels = new Set(
    variable.values.map((code) => code.split(':')[0]?.toLowerCase())
  );
  return [...levels].map((level) => `${level}/all`).join('/');
}

/**
 * Client for IBGE (Instituto Brasileiro de Geografia e Estatística), in Portuguese.
 *
 * - Table id: the aggregate id, which is also the SIDRA table number (for example "1737").
 * - Search: a local index over the aggregates catalogue (`/agregados`, one 2 MB call
 *   cached for an hour); the survey group is the path. The catalogue has no dates, so
 *   there is no recency ranking. Aggregates are marked discontinued when the title
 *   says "série encerrada" (or "descontinuada", "suspensa"), ends with a closed range
 *   ("… até dezembro/2019)") or the survey ended long ago (`DISCONTINUED_GROUPS`).
 * - Metadata: `/agregados/{id}/metadados`, `/periodos` and `/localidades/{levels}`.
 *   Variables: `variavel` (the IBGE variables, with the unit in the label), one `c{id}`
 *   per classification (eliminable when IBGE sums it, which gives the total category
 *   when it is left out), `localidade` (codes "N1:1", "N3:35", "N6:3550308"; levels
 *   Brazil, regions, states and municipalities; eliminable when Brazil is offered) and
 *   `periodo` (ordered oldest first).
 * - Query: one SIDRA values request (`/t/{id}/n…/v/…/p/…/c…`), because SIDRA answers a
 *   refused selection with HTTP 400 and a message, where the aggregates API answers 500.
 *   The cell limit is checked first. SIDRA orders the columns as the request does
 *   (locality, variable, period, then classifications) and adds the left-out
 *   classifications after them, so only the requested ones become columns.
 * - Not found: the aggregates API answers HTTP 500 for an unknown id, so a failed
 *   metadata call is checked against the catalogue.
 * - Caching: catalogue, metadata and localities in the shared cache; the parsed table in
 *   memory for an hour.
 */
export function createIbgeClient(
  options: IbgeClientOptions
): Required<PxwebClient> {
  const root = options.baseUrl.replace(/\/+$/, '');
  const sidraRoot = (options.sidraUrl ?? DEFAULT_SIDRA_URL).replace(/\/+$/, '');
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;
  const now = options.now ?? (() => new Date());
  const request = createRequester(options);

  function get<T>(
    url: string,
    schema: z.ZodType<T>,
    ttlSeconds: number
  ): Promise<T> {
    return request(
      url,
      { method: 'GET' },
      schema,
      (data) => data,
      ttlSeconds,
      url
    );
  }

  async function listTables(lang: string): Promise<TableDoc[]> {
    checkLanguage(lang);
    const groups = await get(root, catalogueSchema, SEARCH_TTL_SECONDS);
    const docs = new Map<string, TableDoc>();
    for (const group of groups) {
      for (const aggregate of group.agregados) {
        if (docs.has(aggregate.id)) continue;
        docs.set(aggregate.id, {
          id: aggregate.id,
          title: aggregate.nome.trim(),
          path: [group.nome.trim()],
          ...((DISCONTINUED_GROUPS.has(group.id) ||
            CLOSED_TITLE.test(aggregate.nome)) && { discontinued: true })
        });
      }
    }
    return [...docs.values()];
  }

  const tableIndex = createTableIndexLoader(listTables, {
    fallback: options.listFallback,
    ttlSeconds: SEARCH_TTL_SECONDS,
    currentYear: () => now().getUTCFullYear()
  });

  async function missingOrUpstream(
    tableId: string,
    err: unknown
  ): Promise<unknown> {
    if (!(err instanceof PxwebError)) return err;
    const tables = await listTables(LANGUAGE).catch(() => undefined);
    if (tables && !tables.some((table) => table.id === tableId)) {
      return notFound(tableId);
    }
    return upstreamError(err);
  }

  async function loadTable(tableId: string): Promise<TableMetadata> {
    const base = `${root}/${tableId}`;
    const metadata = await get(
      `${base}/metadados`,
      metadataSchema,
      METADATA_TTL_SECONDS
    ).catch(async (err: unknown) => {
      throw await missingOrUpstream(tableId, err);
    });
    const offered = Object.values(metadata.nivelTerritorial).flat();
    const preferred = LOCALITY_LEVELS.filter((level) =>
      offered.includes(level)
    );
    const levels = preferred.length > 0 ? preferred : offered;
    const [periods, localities] = await Promise.all([
      get(`${base}/periodos`, periodsSchema, DATA_TTL_SECONDS),
      levels.length > 0
        ? get(
            `${base}/localidades/${levels.join('|')}`,
            localitiesSchema,
            METADATA_TTL_SECONDS
          )
        : []
    ]).catch((err: unknown) => {
      throw upstreamError(err);
    });
    const orderedPeriods = periods.toSorted((a, b) =>
      a.id.localeCompare(b.id, 'en', { numeric: true })
    );
    const orderedLocalities = levels.flatMap((level) =>
      localities.filter((locality) => locality.nivel.id === level)
    );
    return {
      title: metadata.nome.trim(),
      variables: [
        {
          code: VARIABLE_CODE,
          label: 'Variável',
          values: metadata.variaveis.map((variable) => String(variable.id)),
          valueLabels: metadata.variaveis.map((variable) =>
            withUnit(variable.nome, variable.unidade)
          ),
          eliminable: false,
          isTime: false
        },
        ...metadata.classificacoes.map((classification): TableVariable => ({
          code: `c${classification.id}`,
          label: classification.nome.trim(),
          values: classification.categorias.map((category) =>
            String(category.id)
          ),
          valueLabels: classification.categorias.map((category) =>
            category.nome.trim()
          ),
          eliminable: classification.sumarizacao.status,
          isTime: false
        })),
        {
          code: LOCALITY_CODE,
          label: 'Localidade',
          values: orderedLocalities.map(
            (locality) => `${locality.nivel.id}:${locality.id}`
          ),
          valueLabels: orderedLocalities.map((locality) =>
            locality.nome.trim()
          ),
          eliminable: levels.includes(COUNTRY_LEVEL),
          isTime: false
        },
        {
          code: PERIOD_CODE,
          label: 'Período',
          values: orderedPeriods.map((period) => period.id),
          valueLabels: orderedPeriods.map(
            (period) => period.literals[0] ?? period.id
          ),
          eliminable: false,
          isTime: true
        }
      ]
    };
  }

  // Municipality lists are hundreds of kilobytes, so the parsed table is kept here and
  // metadata and query of one tool call share it. Only finished tables are kept:
  // on Workers, a pending load can belong to a request that the runtime stopped.
  const tables = new Map<string, { expires: number; table: TableMetadata }>();

  async function cachedTable(
    lang: string,
    tableId: string
  ): Promise<TableMetadata> {
    checkLanguage(lang);
    if (!TABLE_ID_PATTERN.test(tableId)) {
      throw new PxwebError(
        `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
        400
      );
    }
    const cached = tables.get(tableId);
    if (cached && cached.expires > Date.now()) return cached.table;
    const table = await loadTable(tableId);
    tables.delete(tableId);
    tables.set(tableId, {
      expires: Date.now() + DATA_TTL_SECONDS * 1000,
      table
    });
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
      return cachedTable(lang, tableId);
    },

    async query(lang, tableId, selections) {
      const table = await cachedTable(lang, tableId);
      const byCode = new Map(
        selections.map((selection) => [selection.code, selection])
      );
      let locality = `${COUNTRY_LEVEL.toLowerCase()}/all`;
      let variables = 'v/all';
      let periods = 'p/all';
      const classificationPaths: string[] = [];
      const classifications: TableVariable[] = [];
      let cells = 1;
      for (const variable of table.variables) {
        const selection = byCode.get(variable.code);
        if (!selection && variable.eliminable) continue;
        const codes = chosenCodes(variable, selection);
        cells *= codes?.length ?? variable.values.length;
        const list = codes?.map(encodeURIComponent).join(',') ?? 'all';
        if (variable.code === LOCALITY_CODE) {
          locality = codes ? localitySegments(codes) : allLevels(variable);
        } else if (variable.code === VARIABLE_CODE) {
          variables = `v/${list}`;
        } else if (variable.code === PERIOD_CODE) {
          periods = `p/${list}`;
        } else {
          classifications.push(variable);
          classificationPaths.push(`${variable.code}/${list}`);
        }
      }
      if (cells > maxCells) {
        throw new PxwebError(
          `The query could return ${cells} cells, above the limit of ${maxCells}. Select fewer values.`,
          400
        );
      }
      const path = [
        `t/${tableId}`,
        locality,
        variables,
        periods,
        ...classificationPaths
      ].join('/');
      const rows = await get(
        `${sidraRoot}/${path}`,
        valuesSchema,
        DATA_TTL_SECONDS
      ).catch((err: unknown) => {
        if (err instanceof PxwebError && err.status === 400) {
          throw new PxwebError(
            `SIDRA refused this selection: ${err.message.replace(/^.*?HTTP 400:\s*/, '')}. Check the value codes with get_table_metadata.`,
            400
          );
        }
        throw upstreamError(err);
      });
      const variable = table.variables.find(
        (entry) => entry.code === VARIABLE_CODE
      );
      const variableLabels = new Map(
        variable?.values.map((code, index) => [
          code,
          variable.valueLabels[index] ?? code
        ])
      );
      return {
        label: table.title,
        columns: [
          'Localidade',
          'Variável',
          ...classifications.map((entry) => entry.label),
          'Período',
          'Valor'
        ],
        rows: rows
          .slice(1)
          .map((row) => [
            row.D1N ?? null,
            variableLabels.get(row.D2C ?? '') ?? row.D2N ?? null,
            ...classifications.map((_, index) => row[`D${index + 4}N`] ?? null),
            row.D3N ?? null,
            toNumber(row.V)
          ])
      };
    }
  };
}
