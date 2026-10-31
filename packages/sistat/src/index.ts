import { createPxwebClient, createPxwebServer, type Cache } from 'pxweb-mcp';

import { sistatPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { sistatPreset } from '@/preset';

export interface SistatServerOptions {
  cache?: Cache;
  userAgent?: string;
}

export function createSistatServer(
  options: SistatServerOptions = {}
): McpServer {
  const client = createPxwebClient({
    baseUrl: sistatPreset.apiBaseUrl,
    cache: options.cache,
    userAgent: options.userAgent ?? `sistat-mcp/${sistatPreset.version}`
  });
  return createPxwebServer(sistatPreset, client);
}
