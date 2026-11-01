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

const PRODUCT_ID_PATTERN = /^\d{8}$/;
const COORDINATE_LENGTH = 10;
const BATCH_SIZE = 100;
const PARALLEL_BATCHES = 4;
const RETRY_SECONDS = 5 * 60;
/** Data points one query may ask for: coordinates × periods per coordinate. */
const MAX_POINTS = 20_000;
const TIME_CODE = 'time';
const ARCHIVED = '1';

/** Frequency code → how one period is written. Other frequencies only support "latest". */
const REGULAR_FREQUENCIES: Readonly<Record<string, 'M' | 'Q' | 'S' | 'A'>> = {
  '6': 'M',
  '9': 'Q',
  '11': 'S',
  '12': 'A'
};

const cubeListSchema = z.array(
  z.object({
    productId: z.union([z.string(), z.number()]),
    cubeTitleEn: z.string(),
    cubeTitleFr: z.string(),
    cubeStartDate: z.string().nullish(),
    cubeEndDate: z.string().nullish(),
    releaseTime: z.string().nullish(),
    archived: z.union([z.string(), z.number()]).nullish(),
    frequencyCode: z.union([z.string(), z.number()]).nullish()
  })
);

const cubeMetadataSchema = z
  .array(
    z.object({
      status: z.string(),
      object: z.unknown()
    })
  )
  .min(1);

const cubeObjectSchema = z.object({
  cubeTitleEn: z.string(),
  cubeTitleFr: z.string(),
  dimension: z.array(
    z.object({
      dimensionPositionId: z.number(),
      dimensionNameEn: z.string(),
      dimensionNameFr: z.string(),
      member: z.array(
        z.object({
          memberId: z.number(),
          memberNameEn: z.string(),
          memberNameFr: z.string()
        })
      )
    })
  )
});

const dataSchema = z.array(
  z.object({
    status: z.string(),
    object: z.union([
      z.string(),
      z.object({
        coordinate: z.string(),
        vectorDataPoint: z.array(
          z.object({
            refPer: z.string(),
            value: z.number().nullable()
          })
        )
      })
    ])
  })
);

type Cube = z.infer<typeof cubeListSchema>[number];

export interface StatcanClientOptions extends HttpOptions {
  /** WDS root, for example "https://www150.statcan.gc.ca/t1/wds/rest". */
  baseUrl: string;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

function post(body: unknown): RequestInit {
  return {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' }
  };
}

function checkProductId(productId: string): void {
  if (!PRODUCT_ID_PATTERN.test(productId)) {
    throw new PxwebError(
      `Invalid table id "${productId}". Use the id exactly as search_tables returns it.`,
      400
    );
  }
}

function notFound(productId: string): PxwebError {
  return new PxwebError(
    `Table "${productId}" was not found. Use search_tables to find a table id.`,
    404
  );
}

/** Writes a reference date ("2026-07-01") as a period of the cube's frequency. */
export function periodOf(
  refPer: string,
  frequency: string | undefined
): string {
  const step = REGULAR_FREQUENCIES[frequency ?? ''];
  const [year, month] = refPer.split('-');
  const monthIndex = Number(month ?? 1);
  if (step === 'A') return year ?? refPer;
  if (step === 'M') return `${year}-${month}`;
  if (step === 'Q') return `${year}-Q${Math.ceil(monthIndex / 3)}`;
  if (step === 'S') return `${year}-S${Math.ceil(monthIndex / 6)}`;
  return refPer.slice(0, 10);
}

/** All periods between two reference dates for regular frequencies; otherwise only the last one. */
export function periodsOf(
  start: string | undefined,
  end: string | undefined,
  frequency: string | undefined
): string[] {
  if (!end) return [];
  const step = REGULAR_FREQUENCIES[frequency ?? ''];
  const last = periodOf(end, frequency);
  if (!step || !start) return [last];
  const months = { M: 1, Q: 3, S: 6, A: 12 }[step];
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  const periods: string[] = [];
  for (
    let index = (startYear ?? 0) * 12 + (startMonth ?? 1) - 1;
    index <= (endYear ?? 0) * 12 + (endMonth ?? 1) - 1;
    index += months
  ) {
    const year = Math.floor(index / 12);
    const month = String((index % 12) + 1).padStart(2, '0');
    periods.push(periodOf(`${year}-${month}-01`, frequency));
  }
  return [...new Set(periods)];
}

function cartesian(lists: string[][]): string[][] {
  return lists.reduce<string[][]>(
    (combos, list) =>
      combos.flatMap((combo) => list.map((item) => [...combo, item])),
    [[]]
  );
}

function selectedCodes(
  variable: TableVariable,
  selection: PxwebSelection | undefined
): string[] {
  if (!selection || selection.selection.filter === 'all')
    return variable.values;
  const { filter, values } = selection.selection;
  if (filter === 'top') {
    return variable.values.slice(-Math.max(1, Number(values[0]) || 1));
  }
  return values;
}

/**
 * Client for the Web Data Service of Statistics Canada. Tables have no time
 * dimension and data is read per series ("coordinate"), so the client adds a
 * "time" variable and turns a selection into a batch of coordinates.
 */
export function createStatcanClient(
  options: StatcanClientOptions
): PxwebClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const now = options.now ?? (() => new Date());
  const request = createRequester(options);
  let parsed: { at: number; cubes: Cube[] } | undefined;
  let loading: Promise<Cube[]> | undefined;

  /** The cube list is about 5 MB, so the parsed list stays in memory for an hour. */
  function cubes(): Promise<Cube[]> {
    if (parsed && Date.now() - parsed.at < SEARCH_TTL_SECONDS * 1000) {
      return Promise.resolve(parsed.cubes);
    }
    const url = `${baseUrl}/getAllCubesListLite`;
    loading ??= request(
      url,
      { method: 'GET' },
      cubeListSchema,
      (list) => list,
      SEARCH_TTL_SECONDS,
      `cubes:${url}`
    )
      .then((list) => {
        parsed = { at: Date.now(), cubes: list };
        return list;
      })
      .catch((err: unknown) => {
        if (!parsed) throw err;
        // Keep the old list and try again in a few minutes, not on every call.
        parsed = {
          at: Date.now() - (SEARCH_TTL_SECONDS - RETRY_SECONDS) * 1000,
          cubes: parsed.cubes
        };
        return parsed.cubes;
      })
      .finally(() => {
        loading = undefined;
      });
    return loading;
  }

  const listTables = async (lang: string): Promise<TableDoc[]> => {
    const french = lang === 'fr';
    return (await cubes()).map((item): TableDoc => ({
      id: String(item.productId),
      title: french ? item.cubeTitleFr : item.cubeTitleEn,
      ...(item.releaseTime ? { updated: item.releaseTime } : {}),
      ...(item.cubeEndDate ? { lastPeriod: item.cubeEndDate } : {}),
      ...(String(item.archived) === ARCHIVED ? { discontinued: true } : {})
    }));
  };

  const tableIndex = createTableIndexLoader(listTables, {
    ttlSeconds: SEARCH_TTL_SECONDS,
    currentYear: () => now().getUTCFullYear()
  });

  async function cube(productId: string): Promise<Cube> {
    const found = (await cubes()).find(
      (item) => String(item.productId) === productId
    );
    if (!found) throw notFound(productId);
    return found;
  }

  async function metadata(
    lang: string,
    productId: string
  ): Promise<{
    metadata: TableMetadata;
    frequency: string | undefined;
    dimensionCount: number;
  }> {
    const listed = await cube(productId);
    const url = `${baseUrl}/getCubeMetadata`;
    const body = [{ productId: Number(productId) }];
    const object = await request(
      url,
      post(body),
      cubeMetadataSchema,
      (items) => {
        const first = items[0];
        const result = cubeObjectSchema.safeParse(first?.object);
        if (first?.status !== 'SUCCESS' || !result.success)
          throw notFound(productId);
        return result.data;
      },
      METADATA_TTL_SECONDS,
      `meta:${url}:${productId}`
    );
    const french = lang === 'fr';
    const dimensions = object.dimension.toSorted(
      (a, b) => a.dimensionPositionId - b.dimensionPositionId
    );
    const frequency =
      listed.frequencyCode === null || listed.frequencyCode === undefined
        ? undefined
        : String(listed.frequencyCode);
    const variables: TableVariable[] = dimensions.map((dimension) => ({
      code: String(dimension.dimensionPositionId),
      label: french ? dimension.dimensionNameFr : dimension.dimensionNameEn,
      values: dimension.member.map((member) => String(member.memberId)),
      valueLabels: dimension.member.map((member) =>
        french ? member.memberNameFr : member.memberNameEn
      ),
      eliminable: false,
      isTime: false
    }));
    const periods = periodsOf(
      listed.cubeStartDate ?? undefined,
      listed.cubeEndDate ?? undefined,
      frequency
    );
    variables.push({
      code: TIME_CODE,
      label: french ? 'Période de référence' : 'Reference period',
      values: periods,
      valueLabels: periods,
      eliminable: false,
      isTime: true
    });
    return {
      metadata: {
        title: french ? object.cubeTitleFr : object.cubeTitleEn,
        variables
      },
      frequency,
      dimensionCount: dimensions.length
    };
  }

  return {
    listTables,

    async search(lang, query, searchOptions) {
      return (await tableIndex(lang)).search(query, searchOptions);
    },

    async getMetadata(lang, productId) {
      checkProductId(productId);
      return (await metadata(lang, productId)).metadata;
    },

    async query(lang, productId, selections) {
      checkProductId(productId);
      const { metadata: table, frequency } = await metadata(lang, productId);
      const byCode = new Map(
        selections.map((selection) => [selection.code, selection])
      );
      const dimensions = table.variables.filter((variable) => !variable.isTime);
      const time = table.variables.find((variable) => variable.isTime);
      const timeSelection = byCode.get(TIME_CODE);
      const regular = REGULAR_FREQUENCIES[frequency ?? ''] !== undefined;
      let latestN = 1;
      let wanted: Set<string> | undefined;
      if (timeSelection?.selection.filter === 'top') {
        latestN = Math.max(1, Number(timeSelection.selection.values[0]) || 1);
      } else if (timeSelection?.selection.filter === 'item' && time) {
        const positions = timeSelection.selection.values.map((value) =>
          time.values.indexOf(value)
        );
        if (positions.some((position) => position < 0)) {
          throw new PxwebError(
            `Variable "${TIME_CODE}" has no values ${timeSelection.selection.values.filter((_, index) => (positions[index] ?? -1) < 0).join(', ')}. Use "latest" or a period from get_table_metadata.`,
            400
          );
        }
        if (positions.length === 0) {
          throw new PxwebError(
            'Select at least one value for every variable.',
            400
          );
        }
        latestN = time.values.length - Math.min(...positions);
        wanted = new Set(timeSelection.selection.values);
      } else if (timeSelection?.selection.filter === 'all' && time) {
        latestN = Math.max(1, time.values.length);
      }
      const memberLists = dimensions.map((dimension) =>
        selectedCodes(dimension, byCode.get(dimension.code))
      );
      const series = memberLists.reduce(
        (product, list) => product * list.length,
        1
      );
      if (series === 0) {
        throw new PxwebError(
          'Select at least one value for every variable.',
          400
        );
      }
      if (series * latestN > MAX_POINTS) {
        const timeHint =
          timeSelection?.selection.filter === 'all'
            ? ' Use "latest" on "time" instead of all periods.'
            : '';
        throw new PxwebError(
          `The query would read ${series * latestN} data points (${series} series × ${latestN} periods), above the limit of ${MAX_POINTS}. Select fewer members or fewer periods.${timeHint}`,
          400
        );
      }
      const coordinates = cartesian(memberLists).map((combo) =>
        [
          ...combo,
          ...Array.from({ length: COORDINATE_LENGTH - combo.length }, () => '0')
        ].join('.')
      );
      const url = `${baseUrl}/getDataFromCubePidCoordAndLatestNPeriods`;
      const batches: string[][] = [];
      for (let index = 0; index < coordinates.length; index += BATCH_SIZE) {
        batches.push(coordinates.slice(index, index + BATCH_SIZE));
      }
      const fetchBatch = (batch: string[]) => {
        const body = batch.map((coordinate) => ({
          productId: Number(productId),
          coordinate,
          latestN
        }));
        return request(
          url,
          post(body),
          dataSchema,
          (items) => items,
          DATA_TTL_SECONDS,
          `data:${url}:${JSON.stringify(body)}`
        );
      };
      const results: z.infer<typeof dataSchema>[] = [];
      for (let index = 0; index < batches.length; index += PARALLEL_BATCHES) {
        results.push(
          ...(await Promise.all(
            batches.slice(index, index + PARALLEL_BATCHES).map(fetchBatch)
          ))
        );
      }
      const labels = dimensions.map(
        (dimension) =>
          new Map(
            dimension.values.map((value, index) => [
              value,
              dimension.valueLabels[index] ?? value
            ])
          )
      );
      const rows: (string | number | null)[][] = [];
      for (const item of results.flat()) {
        if (item.status !== 'SUCCESS' || typeof item.object === 'string')
          continue;
        const members = item.object.coordinate.split('.');
        const cells = dimensions.map((_, index) => {
          const member = members[index] ?? '';
          return labels[index]?.get(member) ?? member;
        });
        for (const point of item.object.vectorDataPoint) {
          const period = periodOf(point.refPer, frequency);
          if (wanted && regular && !wanted.has(period)) continue;
          rows.push([...cells, period, point.value]);
        }
      }
      if (rows.length === 0) {
        const failures = results
          .flat()
          .filter((item) => item.status !== 'SUCCESS');
        const firstFailure = failures.find(
          (item) => typeof item.object === 'string'
        )?.object;
        const reason =
          failures.length > 0
            ? `${failures.length} of ${coordinates.length} member combinations have no data${typeof firstFailure === 'string' ? ` (${firstFailure})` : ''}`
            : 'the series have no values for the asked periods';
        throw new PxwebError(
          `No data for this selection: ${reason}. Select different members or periods.`,
          404
        );
      }
      const result: FlatTable = {
        label: table.title,
        columns: [
          ...dimensions.map((dimension) => dimension.label),
          time?.label ?? TIME_CODE,
          'Value'
        ],
        rows
      };
      return result;
    }
  };
}
