import { McpServer } from '@modelcontextprotocol/server';

import type { Cache } from '@/cache';
import type { PxwebPreset } from '@/preset';
import { createPxwebClient, type PxwebClient } from '@/pxweb-client';
import { createPxwebV2Client } from '@/pxweb-v2-client';
import { createStatbankDkClient } from '@/statbank-dk-client';
import { registerSearchTools } from '@/tools/search-tools';
import { registerTableTools } from '@/tools/table-tools';

export function createPxwebServer(
  preset: PxwebPreset,
  client: PxwebClient
): McpServer {
  const server = new McpServer(
    { name: preset.name, title: preset.title, version: preset.version },
    { instructions: preset.instructions }
  );
  registerSearchTools(server, client, preset);
  registerTableTools(server, client, preset);
  return server;
}

export interface PresetServerOptions {
  cache?: Cache;
  fetch?: typeof fetch;
  userAgent?: string;
}

function createPresetClient(
  preset: PxwebPreset,
  http: Pick<PresetServerOptions, 'cache' | 'fetch'> & { userAgent: string }
): PxwebClient {
  const api = preset.api ?? 'pxweb-v1';
  if (api === 'pxweb-v1') {
    return createPxwebClient({
      ...http,
      baseUrl: preset.apiBaseUrl,
      database: preset.database,
      tableIdFromHit: preset.tableIdFromHit,
      isArchived: preset.isArchived
    });
  }
  if (typeof preset.apiBaseUrl !== 'string') {
    throw new Error(`A ${api} preset needs one apiBaseUrl string.`);
  }
  if (api === 'statbank-dk') {
    return createStatbankDkClient({ ...http, baseUrl: preset.apiBaseUrl });
  }
  return createPxwebV2Client({
    ...http,
    baseUrl: preset.apiBaseUrl,
    isArchived: preset.isArchived
  });
}

export function createPresetServer(
  preset: PxwebPreset,
  options: PresetServerOptions = {}
): McpServer {
  const http = {
    cache: options.cache,
    fetch: options.fetch,
    userAgent: options.userAgent ?? `${preset.name}-mcp/${preset.version}`
  };
  return createPxwebServer(preset, createPresetClient(preset, http));
}
