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
  TableMetadata,
  TableVariable
} from '@/pxweb-client';
import {
  createTableIndexLoader,
  type TableDoc,
  type TableListOptions
} from '@/table-index';

const TABLE_ID_PATTERN = /^[A-Za-z0-9_]{1,40}$/;
const LANGUAGES = new Set(['cs', 'en']);
const INDICATOR_CODE = 'IndicatorType';
const INDICATOR_LABELS: Readonly<Record<string, string>> = {
  cs: 'Ukazatel',
  en: 'Indicator'
};
const TIME_TYPE = 'REF_CAS';
const DEFAULT_LEVEL = '#DEFAULT';
const DEFAULT_MAX_CELLS = 5_000;
const MAX_CACHED_TABLES = 8;

export interface CzsoClientOptions extends HttpOptions, TableListOptions {
  /** DataStat API root, for example "https://data.csu.gov.cz/api". */
  baseUrl: string;
  /** Upper limit of cells in one data request. */
  maxCells?: number;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

const catalogueSchema = z.array(
  z.object({
    kod: z.string(),
    verze: z.string(),
    nazev: z.string(),
    casZmenyDefinice: z.string().nullish()
  })
);

const contentListSchema = z.array(
  z.object({
    sadaKod: z.string(),
    verzeKod: z.string(),
    metadata: z
      .object({
        casZmeny: z.string().nullish(),
        casovaDimenzeDo: z.string().nullish()
      })
      .nullish()
  })
);

const variantSchema = z.object({
  kod: z.string(),
  verze: z.string(),
  typDimenzeKod: z.string(),
  nazev: z.string(),
  vychoziVariantaDimenze: z.boolean().nullish(),
  urovneDimenze: z
    .array(z.object({ pocetPolozek: z.number().nullish() }))
    .default([])
});

const datasetSchema = z.object({
  verze: z.string(),
  nazev: z.string(),
  ukazatele: z
    .array(
      z.object({
        kod: z.string(),
        nazev: z.string(),
        mericiJednotka: z.object({ nazev: z.string() }).nullish()
      })
    )
    .default([]),
  variantyDimenze: z.array(variantSchema).default([])
});

const itemsSchema = z.array(
  z.object({
    kod: z.string(),
    nazev: z.string(),
    kodUrovne: z.string().nullish(),
    poradi: z.number(),
    agregacniPolozka: z.boolean().nullish()
  })
);

const contentSchema = z.object({
  dimenze: z
    .array(
      z.object({
        kod: z.string(),
        rozsahHodnot: z
          .array(
            z.object({
              kodUrovne: z.string(),
              poradiPolozkyOd: z.number().nullish(),
              poradiPolozkyDo: z.number().nullish()
            })
          )
          .default([])
      })
    )
    .nullish()
});

type Variant = z.infer<typeof variantSchema>;
type Items = z.infer<typeof itemsSchema>;
type Content = z.infer<typeof contentSchema>;

interface CzsoTable {
  metadata: TableMetadata;
  /** Time code → hierarchy level ("CAS_R", "CAS_Q", …). */
  timeLevels: ReadonlyMap<string, string>;
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

function upstreamError(err: unknown): unknown {
  if (err instanceof PxwebError && err.status >= 500) {
    return new PxwebError(
      `DataStat could not answer (HTTP ${err.status}). Try again later.`,
      502
    );
  }
  return err;
}

function variantRank(variant: Variant): number[] {
  return [
    variant.vychoziVariantaDimenze ? 1 : 0,
    variant.urovneDimenze.length,
    variant.urovneDimenze.reduce(
      (sum, level) => sum + (level.pocetPolozek ?? 0),
      0
    )
  ];
}

function outranks(a: Variant, b: Variant): boolean {
  const rankB = variantRank(b);
  for (const [index, value] of variantRank(a).entries()) {
    const difference = value - (rankB[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

/** A dataset offers alternative variants of one dimension type; one query can use only one. */
function oneVariantPerType(variants: readonly Variant[]): Variant[] {
  const byType = new Map<string, Variant>();
  for (const variant of variants) {
    const current = byType.get(variant.typDimenzeKod);
    if (!current || outranks(variant, current)) {
      byType.set(variant.typDimenzeKod, variant);
    }
  }
  return [...byType.values()];
}

/** Time dimensions list every period of the code list; keep those inside the data range. */
function periodsWithData(
  variant: Variant,
  items: Items,
  content: Content | undefined
): Items {
  const ranges = content?.dimenze?.find(
    (dimension) => dimension.kod === variant.kod
  )?.rozsahHodnot;
  if (!ranges) return items;
  return items.filter((item) => {
    const range = ranges.find(
      (entry) => entry.kodUrovne === (item.kodUrovne ?? DEFAULT_LEVEL)
    );
    return (
      range?.poradiPolozkyOd != null &&
      range.poradiPolozkyDo != null &&
      item.poradi >= range.poradiPolozkyOd &&
      item.poradi <= range.poradiPolozkyDo
    );
  });
}

function toVariable(
  variant: Variant,
  items: Items,
  isTime: boolean
): TableVariable {
  const unique = [
    ...new Map(
      items
        .toSorted((a, b) => a.poradi - b.poradi)
        .map((item) => [item.kod, item])
    ).values()
  ];
  return {
    code: variant.kod,
    label: variant.nazev.trim(),
    values: unique.map((item) => item.kod),
    valueLabels: unique.map((item) => item.nazev.trim()),
    // Leaving out a dimension with a total item gives the total; without one, the values are empty.
    eliminable: !isTime && unique.some((item) => item.agregacniPolozka),
    isTime
  };
}

function indicatorLabel(name: string, unit: string | undefined): string {
  const label = name.trim();
  return unit && !label.endsWith(')') ? `${label} (${unit})` : label;
}

/** `latest` picks the newest periods of each level, so a years-and-quarters dimension gives both. */
function newestPerLevel(
  codes: readonly string[],
  levels: ReadonlyMap<string, string>,
  count: number
): string[] {
  const byLevel = new Map<string, string[]>();
  for (const code of codes) {
    const level = levels.get(code) ?? DEFAULT_LEVEL;
    byLevel.set(level, [...(byLevel.get(level) ?? []), code]);
  }
  const newest = new Set(
    [...byLevel.values()].flatMap((list) => list.slice(-count))
  );
  return codes.filter((code) => newest.has(code));
}

function chosenCodes(
  variable: TableVariable,
  selection: PxwebSelection | undefined,
  timeLevels: ReadonlyMap<string, string>
): string[] {
  if (!selection || selection.selection.filter === 'all') return [];
  const { filter, values } = selection.selection;
  if (filter === 'item') return values;
  const count = Math.max(1, Number(values[0]) || 1);
  if (variable.isTime)
    return newestPerLevel(variable.values, timeLevels, count);
  return variable.values.slice(-count);
}

/**
 * Client for DataStat, the CZSO (Czech Statistical Office) API, in Czech and English.
 *
 * - Table id: the dataset code (`kod`, for example "CEN0101H").
 * - Search: a local index over the live catalogue (`katalog/v1/sady`, per language) and
 *   the content list (`dotaz/v1/metadata/sady/seznam`, for the data update date and
 *   last period), both cached for an hour. No crawled snapshot is needed; `listFallback`
 *   is used when the live catalogue fails.
 * - Metadata: the dataset detail gives the indicators and the dimension variants. A
 *   dataset can have several variants of one dimension type (years, quarters, or years
 *   and quarters; regions or districts), and a query can use only one, so each type
 *   exposes its default variant, else the one with the most levels, then the most items.
 *   Items come from the variant's code list; time items are cut to the data range of the
 *   dataset content metadata and ordered by the code list order. A dimension with a
 *   total item is eliminable: DataStat returns the total when it is left out.
 * - Query: one GET custom selection (`data/sady/{kod}/vlastni`, JSON-stat 2.0) with one
 *   parameter per selected dimension. `latest` gives the newest periods of each time level.
 *   The cell limit is checked before the request. Predefined selections (`data/vybery`)
 *   are not used: they cover one variant each and cost the same single request.
 * - Caching: catalogue and code lists in the shared cache; the parsed table in memory for
 *   an hour, so new periods appear soon after a release.
 */
export function createCzsoClient(
  options: CzsoClientOptions
): Required<PxwebClient> {
  const root = options.baseUrl.replace(/\/+$/, '');
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;
  const now = options.now ?? (() => new Date());
  const request = createRequester(options);

  function get<T>(
    lang: string | undefined,
    path: string,
    schema: z.ZodType<T>,
    ttlSeconds: number
  ): Promise<T> {
    const url = `${root}/${path}`;
    return request(
      url,
      {
        method: 'GET',
        ...(lang && { headers: { 'accept-language': lang } })
      },
      schema,
      (data) => data,
      ttlSeconds,
      `${lang ?? '*'}:${url}`
    );
  }

  async function listTables(lang: string): Promise<TableDoc[]> {
    checkLanguage(lang);
    const [datasets, contents] = await Promise.all([
      get(lang, 'katalog/v1/sady', catalogueSchema, SEARCH_TTL_SECONDS),
      get(
        undefined,
        'dotaz/v1/metadata/sady/seznam',
        contentListSchema,
        SEARCH_TTL_SECONDS
      ).catch(() => [])
    ]);
    const contentOf = new Map(
      contents.map((entry) => [
        `${entry.sadaKod}:${entry.verzeKod}`,
        entry.metadata
      ])
    );
    return datasets.map((dataset): TableDoc => {
      const content = contentOf.get(`${dataset.kod}:${dataset.verze}`);
      const updated = (content?.casZmeny ?? dataset.casZmenyDefinice)?.slice(
        0,
        10
      );
      const lastPeriod = content?.casovaDimenzeDo?.slice(0, 4);
      return {
        id: dataset.kod,
        title: dataset.nazev.trim(),
        ...(updated && { updated }),
        ...(lastPeriod && { lastPeriod })
      };
    });
  }

  const tableIndex = createTableIndexLoader(listTables, {
    fallback: options.listFallback,
    ttlSeconds: SEARCH_TTL_SECONDS,
    currentYear: () => now().getUTCFullYear()
  });

  async function loadTable(lang: string, tableId: string): Promise<CzsoTable> {
    checkLanguage(lang);
    if (!TABLE_ID_PATTERN.test(tableId)) {
      throw new PxwebError(
        `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
        400
      );
    }
    const dataset = await get(
      lang,
      `katalog/v1/sady/${tableId}`,
      datasetSchema,
      METADATA_TTL_SECONDS
    ).catch((err: unknown) => {
      if (err instanceof PxwebError && err.status === 404) {
        throw notFound(tableId);
      }
      throw upstreamError(err);
    });
    const variants = oneVariantPerType(dataset.variantyDimenze);
    const hasTime = variants.some(
      (variant) => variant.typDimenzeKod === TIME_TYPE
    );
    const [content, ...itemLists] = await Promise.all([
      hasTime
        ? get(
            undefined,
            `dotaz/v1/metadata/sady/${tableId}?verze=${encodeURIComponent(dataset.verze)}`,
            contentSchema,
            DATA_TTL_SECONDS
          )
        : undefined,
      ...variants.map((variant) =>
        get(
          lang,
          `katalog/v1/dimenze/${encodeURIComponent(variant.kod)}/polozky?verze=${encodeURIComponent(variant.verze)}`,
          itemsSchema,
          METADATA_TTL_SECONDS
        )
      )
    ]).catch((err: unknown) => {
      throw upstreamError(err);
    });
    const timeLevels = new Map<string, string>();
    const dimensions = variants.map((variant, index) => {
      const isTime = variant.typDimenzeKod === TIME_TYPE;
      const items = itemLists[index] ?? [];
      if (!isTime) return toVariable(variant, items, false);
      const periods = periodsWithData(variant, items, content);
      for (const item of periods) {
        timeLevels.set(item.kod, item.kodUrovne ?? DEFAULT_LEVEL);
      }
      return toVariable(variant, periods, true);
    });
    const indicator: TableVariable = {
      code: INDICATOR_CODE,
      label: INDICATOR_LABELS[lang] ?? INDICATOR_CODE,
      values: dataset.ukazatele.map((item) => item.kod),
      valueLabels: dataset.ukazatele.map((item) =>
        indicatorLabel(item.nazev, item.mericiJednotka?.nazev)
      ),
      eliminable: false,
      isTime: false
    };
    return {
      metadata: {
        title: dataset.nazev.trim(),
        variables: [
          indicator,
          ...dimensions.filter((variable) => !variable.isTime),
          ...dimensions.filter((variable) => variable.isTime)
        ]
      },
      timeLevels
    };
  }

  // Municipality code lists are megabytes, so the parsed table is kept here and
  // metadata and query of one tool call share it. Only finished tables are kept:
  // on Workers, a pending load can belong to a request that the runtime stopped.
  const tables = new Map<string, { expires: number; table: CzsoTable }>();

  async function cachedTable(
    lang: string,
    tableId: string
  ): Promise<CzsoTable> {
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

    async query(lang, tableId, selections) {
      const table = await cachedTable(lang, tableId);
      const byCode = new Map(
        selections.map((selection) => [selection.code, selection])
      );
      const params = ['format=JSON_STAT'];
      let cells = 1;
      for (const variable of table.metadata.variables) {
        const selection = byCode.get(variable.code);
        if (!selection && variable.eliminable) continue;
        const codes = chosenCodes(variable, selection, table.timeLevels);
        cells *= codes.length || variable.values.length;
        // DataStat reads only literal commas between codes.
        const value =
          codes.length > 0 ? codes.map(encodeURIComponent).join(',') : '*';
        params.push(`${encodeURIComponent(variable.code)}=${value}`);
      }
      if (cells > maxCells) {
        throw new PxwebError(
          `The query could return ${cells} cells, above the limit of ${maxCells}. Select fewer values.`,
          400
        );
      }
      const path = `dotaz/v1/data/sady/${tableId}/vlastni?${params.join('&')}`;
      return get(lang, path, jsonStatDatasetSchema, DATA_TTL_SECONDS)
        .then((dataset) => {
          const flat = toFlatTable(dataset);
          return {
            label: table.metadata.title,
            columns: flat.columns.map((column) => column.trim()),
            rows: flat.rows.map((row) =>
              row.map((cell) => (typeof cell === 'string' ? cell.trim() : cell))
            )
          };
        })
        .catch((err: unknown) => {
          if (err instanceof PxwebError && err.status === 404) {
            throw notFound(tableId);
          }
          if (err instanceof PxwebError && err.status === 400) {
            throw new PxwebError(
              `DataStat refused this selection: ${err.message.replace(/^PxWeb returned HTTP 400: /, '')}. Check the value codes with get_table_metadata.`,
              400
            );
          }
          throw upstreamError(err);
        });
    }
  };
}
