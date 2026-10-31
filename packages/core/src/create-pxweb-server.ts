import { McpServer } from '@modelcontextprotocol/server';

import type { PxwebPreset } from '@/preset';
import type { PxwebClient } from '@/pxweb-client';
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
