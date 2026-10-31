import { McpServer } from '@modelcontextprotocol/server';

import type { Cache } from '@/cache';
import type { PxwebPreset } from '@/preset';
import { createPxwebClient, type PxwebClient } from '@/pxweb-client';
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

export function createPresetServer(
  preset: PxwebPreset,
  options: PresetServerOptions = {}
): McpServer {
  const client = createPxwebClient({
    baseUrl: preset.apiBaseUrl,
    database: preset.database,
    cache: options.cache,
    fetch: options.fetch,
    userAgent: options.userAgent ?? `${preset.name}-mcp/${preset.version}`
  });
  return createPxwebServer(preset, client);
}
