import { z } from 'zod';

import {
  createRequester,
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
import { createTableIndexLoader, type TableDoc } from '@/table-index';

const INDICATOR_PATTERN = /^\d{7}$/;
const TIME_DIMENSION = '1';
const GEOGRAPHY_DIMENSION = '2';
const NOT_FOUND_CODE = '1';
/** INE refuses requests above 1,000,000 rows. */
const API_MAX_CELLS = 1_000_000;
/** The full catalogue is about 21 MB of XML; downloads have taken from 30 s to more than 120 s. */
const CATALOGUE_MAX_BYTES = 64 * 1024 * 1024;
const CATALOGUE_TIMEOUT_MS = 300_000;

export interface InePtClientOptions extends HttpOptions {
  /** Root of the INE web services, for example "https://www.ine.pt/ine". */
  baseUrl: string;
  /** Full table list (the crawled snapshot); INE has no search. */
  tableList?: (lang: string) => Promise<readonly TableDoc[]>;
  /** Refuses larger queries before the request. Default 1,000,000 (the API limit). */
  maxCells?: number;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

const failureSchema = z.object({
  Sucesso: z.object({
    Falso: z.array(
      z.object({ Msg: z.string().optional(), Cod: z.string().optional() })
    )
  })
});

const categorySchema = z.object({
  dim_num: z.string(),
  cat_id: z.string(),
  categ_dsg: z.string(),
  categ_ord: z.string().optional()
});

const indicatorSchema = z.object({
  IndicadorNome: z.string(),
  Dimensoes: z.object({
    Descricao_Dim: z.array(z.object({ dim_num: z.string(), abrv: z.string() })),
    Categoria_Dim: z.array(z.record(z.string(), z.array(categorySchema)))
  })
});

const dataSetSchema = z.object({
  Dados: z.record(z.string(), z.array(z.record(z.string(), z.unknown())))
});

const metadataSchema = z.tuple(
  [z.union([indicatorSchema, failureSchema])],
  z.unknown()
);

const dataSchema = z.tuple(
  [z.union([dataSetSchema, failureSchema])],
  z.unknown()
);

function notFound(tableId: string): PxwebError {
  return new PxwebError(
    `Table "${tableId}" was not found. Use search_tables to find a table id.`,
    404
  );
}

function checkTableId(tableId: string): void {
  if (!INDICATOR_PATTERN.test(tableId)) {
    throw new PxwebError(
      `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
      400
    );
  }
}

/** INE answers errors with HTTP 200 and a bilingual message: "(PT) … / (EN) …". */
function failure(
  tableId: string,
  data: z.infer<typeof failureSchema>
): PxwebError {
  const first = data.Sucesso.Falso[0];
  if (first?.Cod === NOT_FOUND_CODE) return notFound(tableId);
  const message = first?.Msg?.split('(EN)').at(-1)?.trim() || 'unknown error';
  return new PxwebError(`INE refused the request: ${message}`, 400);
}

function toMetadata(
  tableId: string,
  [indicator]: z.infer<typeof metadataSchema>
): TableMetadata {
  if (!('IndicadorNome' in indicator)) throw failure(tableId, indicator);
  const categories = Object.values(
    indicator.Dimensoes.Categoria_Dim[0] ?? {}
  ).flatMap((entries) => entries.slice(0, 1));
  return {
    title: indicator.IndicadorNome,
    variables: indicator.Dimensoes.Descricao_Dim.map((dimension) => {
      const own = categories
        .filter((category) => category.dim_num === dimension.dim_num)
        .toSorted(
          (a, b) => Number(a.categ_ord ?? 0) - Number(b.categ_ord ?? 0)
        );
      return {
        code: `Dim${dimension.dim_num}`,
        label: dimension.abrv,
        values: own.map((category) => category.cat_id),
        valueLabels: own.map((category) => category.categ_dsg),
        eliminable: false,
        isTime: dimension.dim_num === TIME_DIMENSION
      };
    })
  };
}

/** Codes to request, or undefined to leave the dimension out (INE then returns all of it). */
function requestedCodes(
  variable: TableVariable,
  selection: PxwebSelection | undefined
): string[] | undefined {
  const filter = selection?.selection.filter ?? 'all';
  if (filter === 'top') {
    const count = Math.max(1, Number(selection?.selection.values[0]) || 1);
    return variable.values.slice(-count);
  }
  if (filter === 'item') return selection?.selection.values ?? [];
  // Without Dim1, INE returns only the latest period.
  return variable.isTime ? variable.values : undefined;
}

function rowCode(row: Record<string, unknown>, variable: string): string {
  const number = variable.slice('Dim'.length);
  return String(
    number === GEOGRAPHY_DIMENSION ? row.geocod : row[`dim_${number}`]
  );
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const compareOrder = (a: number[], b: number[]): number =>
  a.reduce((result, value, i) => result || value - (b[i] ?? 0), 0);

const apiLang = (lang: string): string =>
  encodeURIComponent(lang.toUpperCase());

const positions = (keys: readonly string[]): Map<string, number> =>
  new Map(keys.map((key, index) => [key, index]));

/** Data comes grouped by period label in no useful order, so rows are sorted like the metadata. */
function toFlatTable(
  metadata: TableMetadata,
  dados: Record<string, Record<string, unknown>[]>
): FlatTable {
  const time = metadata.variables.find((variable) => variable.isTime);
  const others = metadata.variables.filter((variable) => !variable.isTime);
  const periodIndex = positions(time?.valueLabels ?? []);
  const indexes = others.map((variable) => positions(variable.values));
  const rows = Object.entries(dados).flatMap(([period, entries]) =>
    entries.map((entry) => {
      const codes = others.map((variable) => rowCode(entry, variable.code));
      const order = codes.map((code, d) => indexes[d]?.get(code) ?? -1);
      const labels = codes.map(
        (code, d) => others[d]?.valueLabels[order[d] ?? -1] ?? code
      );
      return {
        order: [periodIndex.get(period) ?? -1, ...order],
        cells: [period, ...labels, numberOrNull(entry.valor)]
      };
    })
  );
  return {
    label: metadata.title,
    columns: [
      ...(time ? [time.label] : []),
      ...others.map((variable) => variable.label),
      'Value'
    ],
    rows: rows
      .toSorted((a, b) => compareOrder(a.order, b.order))
      .map((row) => row.cells)
  };
}

const field = (block: string, name: string): string | undefined =>
  new RegExp(
    `<${name}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${name}>`
  )
    .exec(block)
    ?.slice(1)
    .find((value) => value !== undefined)
    ?.trim() || undefined;

function isoDate(day: string | undefined): string | undefined {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(day ?? '');
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
}

/**
 * Many indicators share a short title ("Resident population (No.)"), so the
 * title is the description, which adds the dimensions and the source. The
 * catalogue has no meaningful order, so the most recently updated go first
 * (sorting by last period would put projections to 2100 first).
 */
function parseCatalogue(xml: string): TableDoc[] {
  const docs = [
    ...xml.matchAll(/<indicator id="(\d{7})">([\s\S]*?)<\/indicator>/g)
  ].flatMap(([, id = '', block = '']): TableDoc[] => {
    const title = field(block, 'description') ?? field(block, 'title');
    if (!title) return [];
    const path = [field(block, 'theme'), field(block, 'subtheme')].filter(
      (part): part is string => part !== undefined
    );
    const updated = isoDate(field(block, 'last_update'));
    const lastPeriod = field(block, 'last_period_available')?.replace(
      /^S?\d+A/,
      ''
    );
    return [
      {
        id,
        title,
        ...(path.length ? { path } : {}),
        ...(updated ? { updated } : {}),
        ...(lastPeriod ? { lastPeriod } : {})
      }
    ];
  });
  return docs.toSorted(
    (a, b) =>
      (b.updated ?? '').localeCompare(a.updated ?? '') ||
      a.id.localeCompare(b.id)
  );
}

export function createInePtClient(
  options: InePtClientOptions
): PxwebClient & Required<Pick<PxwebClient, 'listTables'>> {
  const root = options.baseUrl.replace(/\/+$/, '');
  const maxCells = options.maxCells ?? API_MAX_CELLS;
  const now = options.now ?? (() => new Date());
  const request = createRequester(options);
  const doFetch = options.fetch ?? fetch;
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

  async function getMetadata(
    lang: string,
    tableId: string
  ): Promise<TableMetadata> {
    checkTableId(tableId);
    const url = `${root}/json_indicador/pindicaMeta.jsp?varcd=${tableId}&lang=${apiLang(lang)}`;
    return request(
      url,
      { method: 'GET' },
      metadataSchema,
      (data) => toMetadata(tableId, data),
      METADATA_TTL_SECONDS,
      `meta:${url}`
    );
  }

  return {
    async search(lang, query, searchOptions) {
      return (await tableIndex(lang)).search(query, searchOptions);
    },

    getMetadata,

    async listTables(lang) {
      const url = `${root}/xml_indic.jsp?opc=2&lang=${apiLang(lang)}`;
      const response = await doFetch(url, {
        headers: options.userAgent ? { 'user-agent': options.userAgent } : {},
        signal: AbortSignal.timeout(CATALOGUE_TIMEOUT_MS)
      }).catch((err: unknown) => {
        throw new PxwebError(
          `INE catalogue request failed: ${err instanceof Error ? err.message : String(err)}`,
          502
        );
      });
      const xml = await readCappedText(response, CATALOGUE_MAX_BYTES);
      if (!response.ok) {
        throw new PxwebError(
          `INE catalogue returned HTTP ${response.status}.`,
          response.status
        );
      }
      // The server can close a slow download early; a cut catalogue has no closing tag.
      if (!/<\/catalog>\s*$/.test(xml)) {
        throw new PxwebError('INE returned an incomplete catalogue.', 502);
      }
      const docs = parseCatalogue(xml);
      if (docs.length === 0) {
        throw new PxwebError('INE returned an empty catalogue.', 502);
      }
      return docs;
    },

    async query(lang, tableId, selections) {
      const metadata = await getMetadata(lang, tableId);
      const byCode = new Map(
        selections.map((selection) => [selection.code, selection])
      );
      let cells = 1;
      const params = [`op=2`, `varcd=${tableId}`];
      for (const variable of metadata.variables) {
        const codes = requestedCodes(variable, byCode.get(variable.code));
        cells *= codes?.length ?? variable.values.length;
        if (codes) {
          params.push(
            `${variable.code}=${codes.map(encodeURIComponent).join(',')}`
          );
        }
      }
      if (cells > maxCells) {
        throw new PxwebError(
          `The query would return ${cells} cells, above the limit of ${maxCells}. Select fewer values.`,
          400
        );
      }
      params.push(`lang=${apiLang(lang)}`);
      const url = `${root}/json_indicador/pindica.jsp?${params.join('&')}`;
      return request(
        url,
        { method: 'GET' },
        dataSchema,
        ([data]) => {
          if (!('Dados' in data)) throw failure(tableId, data);
          return toFlatTable(metadata, data.Dados);
        },
        DATA_TTL_SECONDS,
        `data:${url}`
      );
    }
  };
}
