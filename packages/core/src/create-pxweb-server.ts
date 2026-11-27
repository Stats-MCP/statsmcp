import { McpServer } from '@modelcontextprotocol/server';

import type { Cache } from '@/cache';
import { createCbsODataClient } from '@/cbs-odata-client';
import { createEurostatClient } from '@/eurostat-client';
import { createIneEsClient } from '@/ine-es-client';
import { createInePtClient } from '@/ine-pt-client';
import { createInseeClient } from '@/insee-client';
import { createOnsClient } from '@/ons-client';
import type { PxwebPreset } from '@/preset';
import { createPxstatClient } from '@/pxstat-client';
import {
  createPxwebClient,
  PxwebError,
  type PxwebClient
} from '@/pxweb-client';
import { createPxwebV2Client } from '@/pxweb-v2-client';
import { createSdmxClient } from '@/sdmx-client';
import { createSingstatClient } from '@/singstat-client';
import type { SnapshotReader } from '@/snapshot';
import { createStatbankDkClient } from '@/statbank-dk-client';
import { createStatbelClient } from '@/statbel-client';
import { createStatcanClient } from '@/statcan-client';
import type { TableDoc } from '@/table-doc';
import { registerSearchTools } from '@/tools/search-tools';
import { registerTableTools } from '@/tools/table-tools';

/**
 * Models remember table ids for well-known statistics and skip the search; a
 * remembered id can be outdated or wrong, so every server asks for a search first.
 */
const SEARCH_FIRST =
  'Always call `search_tables` first, unless the user gives a table id. Use only table ids from search results or from the user.';

export function createPxwebServer(
  preset: PxwebPreset,
  client: PxwebClient
): McpServer {
  const server = new McpServer(
    { name: preset.name, title: preset.title, version: preset.version },
    { instructions: `${preset.instructions}\n\n${SEARCH_FIRST}` }
  );
  registerSearchTools(server, client, preset);
  registerTableTools(server, client, preset);
  return server;
}

export interface PresetServerOptions {
  cache?: Cache;
  fetch?: typeof fetch;
  userAgent?: string;
  /** Crawled table lists, used when a source's live table list fails. */
  tableSnapshots?: SnapshotReader;
}

/** PxWeb v1, PxStat, INE Spain and Portugal, and INSEE have no small list endpoint, so index search reads the crawled snapshot. */
function snapshotTableList(
  preset: PxwebPreset,
  tableSnapshots: SnapshotReader | undefined
): (lang: string) => Promise<readonly TableDoc[]> {
  return async (lang) => {
    const snapshot = await tableSnapshots?.(preset.name, lang);
    if (!snapshot) {
      throw new PxwebError(
        `The table list of ${preset.title} is not available now. Try again later.`,
        503
      );
    }
    return snapshot.docs;
  };
}

export function createPresetClient(
  preset: PxwebPreset,
  options: Pick<PresetServerOptions, 'cache' | 'fetch' | 'tableSnapshots'> & {
    userAgent: string;
  }
): PxwebClient {
  const { tableSnapshots, ...http } = options;
  const api = preset.api ?? 'pxweb-v1';
  if (api === 'pxweb-v1') {
    return createPxwebClient({
      ...http,
      baseUrl: preset.apiBaseUrl,
      database: preset.database,
      timeVariables: preset.timeVariables,
      tableIdFromHit: preset.tableIdFromHit,
      isArchived: preset.isArchived,
      ...(preset.search === 'index'
        ? { tableList: snapshotTableList(preset, tableSnapshots) }
        : {})
    });
  }
  if (typeof preset.apiBaseUrl !== 'string') {
    throw new Error(`A ${api} preset needs one apiBaseUrl string.`);
  }
  if (api === 'cso-pxstat') {
    return createPxstatClient({
      ...http,
      baseUrl: preset.apiBaseUrl,
      tableList: snapshotTableList(preset, tableSnapshots)
    });
  }
  if (api === 'ine-es') {
    return createIneEsClient({
      ...http,
      baseUrl: preset.apiBaseUrl,
      tableList: snapshotTableList(preset, tableSnapshots)
    });
  }
  if (api === 'ine-pt') {
    return createInePtClient({
      ...http,
      baseUrl: preset.apiBaseUrl,
      maxCells: preset.maxCells,
      tableList: snapshotTableList(preset, tableSnapshots)
    });
  }
  if (api === 'insee') {
    return createInseeClient({
      ...http,
      baseUrl: preset.apiBaseUrl,
      maxCells: preset.maxCells,
      tableList: snapshotTableList(preset, tableSnapshots)
    });
  }
  if (api === 'ons') {
    return createOnsClient({
      ...http,
      baseUrl: preset.apiBaseUrl,
      maxCells: preset.maxCells
    });
  }
  if (api === 'singstat') {
    return createSingstatClient({ ...http, baseUrl: preset.apiBaseUrl });
  }
  const indexed = {
    ...http,
    baseUrl: preset.apiBaseUrl,
    ...(tableSnapshots
      ? {
          listFallback: async (lang: string) =>
            (await tableSnapshots(preset.name, lang))?.docs
        }
      : {})
  };
  if (api === 'sdmx') {
    if (!preset.sdmxAgency) {
      throw new Error('An sdmx preset needs sdmxAgency.');
    }
    return createSdmxClient({
      ...indexed,
      agency: preset.sdmxAgency,
      languages: preset.languages
    });
  }
  if (api === 'statbel') {
    return createStatbelClient({ ...indexed, maxCells: preset.maxCells });
  }
  if (api === 'statcan-wds') return createStatcanClient(indexed);
  if (api === 'eurostat') return createEurostatClient(indexed);
  if (api === 'cbs-odata') return createCbsODataClient(indexed);
  if (api === 'statbank-dk') return createStatbankDkClient(indexed);
  return createPxwebV2Client({
    ...indexed,
    isArchived: preset.isArchived,
    search: preset.search
  });
}

export function createPresetServer(
  preset: PxwebPreset,
  options: PresetServerOptions = {}
): McpServer {
  return createPxwebServer(
    preset,
    createPresetClient(preset, {
      cache: options.cache,
      fetch: options.fetch,
      tableSnapshots: options.tableSnapshots,
      userAgent: options.userAgent ?? `${preset.name}-mcp/${preset.version}`
    })
  );
}
