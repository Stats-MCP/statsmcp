import { createPresetServer, type PresetServerOptions } from 'pxweb-mcp';

import { eurostatPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { eurostatPreset } from '@/preset';

export type EurostatServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createEurostatServer(
  options: EurostatServerOptions = {}
): McpServer {
  return createPresetServer(eurostatPreset, options);
}
