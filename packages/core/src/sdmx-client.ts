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
  TableVariable
} from '@/pxweb-client';
import {
  availabilitySchema,
  dataflowsSchema,
  dataMessageSchema,
  SDMX_ID_PATTERN,
  structureSchema,
  toFlatTable,
  toTableDocs,
  toTableStructure,
  type SdmxTableStructure
} from '@/sdmx-json';
import { comparePeriods } from '@/sdmx-periods';
import { createTableIndexLoader, type TableListOptions } from '@/table-index';

import type { z } from 'zod';

const STRUCTURE_ACCEPT = 'application/vnd.sdmx.structure+json;version=1.0';
const DATA_ACCEPT = 'application/vnd.sdmx.data+json;version=1.0';
const MAX_URL_LENGTH = 4000;
const NO_DATA_NOTE =
  'No data for these periods. This table may have data only for some years; use latest.';

export interface SdmxClientOptions extends HttpOptions, TableListOptions {
  /** SDMX REST root, for example "https://data.api.abs.gov.au/rest". */
  baseUrl: string;
  /** Agency of the dataflows, for example "ABS". */
  agency: string;
  /** Clock for search ranking; defaults to the system time. */
  now?: () => Date;
}

interface SdmxTable extends SdmxTableStructure {
  /** The id the service knows, which can differ in case from the asked id. */
  flowId: string;
}

function notFound(tableId: string): PxwebError {
  return new PxwebError(
    `Table "${tableId}" was not found. Use search_tables to find a table id.`,
    404
  );
}

function unknownValues(code: string, values: readonly string[]): PxwebError {
  return new PxwebError(
    `Variable "${code}" has no values ${values.join(', ')}. Call get_table_metadata to see valid value codes.`,
    400
  );
}

function selectedCodes(
  variable: TableVariable,
  selection: PxwebSelection | undefined
): string[] | undefined {
  if (!selection || selection.selection.filter === 'all') return undefined;
  const { filter, values } = selection.selection;
  if (filter === 'top') {
    const count = Math.max(1, Number(values[0]) || 1);
    return variable.values.slice(-count);
  }
  const unknown = values.filter((value) => !variable.values.includes(value));
  if (unknown.length) throw unknownValues(variable.code, unknown);
  return values;
}

/**
 * With mixed frequencies the last period by start ("2026-07") can end before an
 * earlier one ("2026-Q3"), so the bound widens to the whole year; rows are
 * filtered to the chosen periods anyway.
 */
function endPeriod(sorted: readonly string[]): string {
  const last = sorted.at(-1) ?? '';
  const formats = new Set(sorted.map((code) => code.replace(/\d/g, '0')));
  return formats.size > 1 ? last.slice(0, 4) : last;
}

/**
 * Client for SDMX REST services that answer SDMX-JSON 1.0 (.Stat Suite), such as
 * the Australian Bureau of Statistics. SDMX has no title search, so search uses
 * a local index over the dataflow list.
 */
export function createSdmxClient(options: SdmxClientOptions): PxwebClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const { agency } = options;
  const now = options.now ?? (() => new Date());
  const request = createRequester(options);
  const structureGet: RequestInit = {
    method: 'GET',
    headers: { accept: STRUCTURE_ACCEPT }
  };
  const dataGet: RequestInit = {
    method: 'GET',
    headers: { accept: DATA_ACCEPT }
  };
  let loadingCatalogue: Promise<z.infer<typeof dataflowsSchema>> | undefined;

  function busy<T>(promise: Promise<T>): Promise<T> {
    return promise.catch((err: unknown) => {
      if (err instanceof PxwebError && err.status === 429) {
        throw new PxwebError(`${agency} is busy. Try again in a minute.`, 429);
      }
      throw err;
    });
  }

  function catalogue(): Promise<z.infer<typeof dataflowsSchema>> {
    const url = `${baseUrl}/dataflow/${agency}`;
    loadingCatalogue ??= busy(
      request(
        url,
        structureGet,
        dataflowsSchema,
        (data) => data,
        SEARCH_TTL_SECONDS,
        `catalogue:${url}`
      )
    ).finally(() => {
      loadingCatalogue = undefined;
    });
    return loadingCatalogue;
  }

  const listTables = async (lang: string) =>
    toTableDocs(await catalogue(), lang);

  const tableIndex = createTableIndexLoader(listTables, {
    fallback: options.listFallback,
    ttlSeconds: SEARCH_TTL_SECONDS,
    currentYear: () => now().getUTCFullYear()
  });

  function structure(flowId: string) {
    const url = `${baseUrl}/dataflow/${agency}/${flowId}/latest?references=all`;
    return busy(
      request(
        url,
        structureGet,
        structureSchema,
        (data) => data,
        METADATA_TTL_SECONDS,
        `meta:${url}`
      )
    );
  }

  /** Without availability, metadata still works with every code of the code lists. */
  async function availability(flowId: string, version: string) {
    const url = `${baseUrl}/availableconstraint/${agency},${flowId},${version}/all/all/all`;
    try {
      return await request(
        url,
        structureGet,
        availabilitySchema,
        (data) => data,
        METADATA_TTL_SECONDS,
        `meta:${url}`
      );
    } catch {
      return undefined;
    }
  }

  async function findStructure(tableId: string) {
    try {
      return { flowId: tableId, data: await structure(tableId) };
    } catch (err) {
      const upper = tableId.toUpperCase();
      const isMissing = err instanceof PxwebError && err.status === 404;
      if (!isMissing) throw err;
      if (upper === tableId) throw notFound(tableId);
      try {
        return { flowId: upper, data: await structure(upper) };
      } catch (retryErr) {
        if (retryErr instanceof PxwebError && retryErr.status === 404) {
          throw notFound(tableId);
        }
        throw retryErr;
      }
    }
  }

  async function table(lang: string, tableId: string): Promise<SdmxTable> {
    if (!SDMX_ID_PATTERN.test(tableId)) {
      throw new PxwebError(
        `Invalid table id "${tableId}". Use the id exactly as search_tables returns it.`,
        400
      );
    }
    const found = await findStructure(tableId);
    const version = found.data.data.dataflows[0]?.version ?? '';
    const available = await availability(found.flowId, version);
    return {
      ...toTableStructure(found.data, available, lang),
      flowId: found.flowId
    };
  }

  return {
    listTables,

    async search(lang, query, searchOptions) {
      return (await tableIndex(lang)).search(query, searchOptions);
    },

    async getMetadata(lang, tableId) {
      return (await table(lang, tableId)).metadata;
    },

    async query(lang, tableId, selections) {
      const { metadata, version, dimensionIds, timeId, flowId } = await table(
        lang,
        tableId
      );
      const byCode = new Map(
        selections.map((selection) => [selection.code, selection])
      );
      const variables = new Map(
        metadata.variables.map((variable) => [variable.code, variable])
      );
      const segments = dimensionIds.map((id) => {
        const variable = variables.get(id);
        if (!variable) return '';
        return (selectedCodes(variable, byCode.get(id)) ?? []).join('+');
      });
      const key = segments.every((segment) => segment === '')
        ? 'all'
        : segments.join('.');

      const params = new URLSearchParams();
      let periods: ReadonlySet<string> | undefined;
      const timeSelection = byCode.get(timeId)?.selection;
      const timeVariable = variables.get(timeId);
      if (timeSelection?.filter === 'top') {
        const count = Math.max(1, Number(timeSelection.values[0]) || 1);
        params.set('lastNObservations', String(count));
      } else if (timeSelection?.filter === 'item' && timeVariable) {
        const codes = selectedCodes(timeVariable, byCode.get(timeId)) ?? [];
        const sorted = codes.toSorted(comparePeriods);
        params.set('startPeriod', sorted[0] ?? '');
        params.set('endPeriod', endPeriod(sorted));
        periods = new Set(codes);
      }
      const query = params.size ? `?${params.toString()}` : '';
      const url = `${baseUrl}/data/${agency},${flowId},${version}/${key}${query}`;
      if (url.length > MAX_URL_LENGTH) {
        throw new PxwebError(
          'The query selects too many values for one request. Select fewer values.',
          400
        );
      }

      const withNote = (result: FlatTable): FlatTable =>
        result.rows.length
          ? result
          : { ...result, label: `${metadata.title}. ${NO_DATA_NOTE}` };
      const emptyTable = (): FlatTable =>
        withNote({
          label: metadata.title,
          columns: [
            ...dimensionIds.map((id) => variables.get(id)?.label ?? id),
            timeVariable?.label ?? timeId,
            'Value'
          ],
          rows: []
        });

      try {
        return withNote(
          await busy(
            request(
              url,
              dataGet,
              dataMessageSchema,
              (message) => toFlatTable(message, metadata, lang, periods),
              DATA_TTL_SECONDS,
              `data:${url}`
            )
          )
        );
      } catch (err) {
        // SDMX answers "no observations match" with HTTP 404 "NoResultsFound".
        if (
          err instanceof PxwebError &&
          err.status === 404 &&
          err.message.includes('NoResultsFound')
        ) {
          return emptyTable();
        }
        if (err instanceof PxwebError && err.status !== 429) {
          throw new PxwebError(
            `Table "${tableId}": ${err.message}`,
            err.status
          );
        }
        throw err;
      }
    }
  };
}
