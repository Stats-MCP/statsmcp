import { createPresetServer, type PresetServerOptions } from 'pxweb-mcp';

import { hagstovaPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { hagstovaPreset } from '@/preset';

export type HagstovaServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent'
>;

export function createHagstovaServer(
  options: HagstovaServerOptions = {}
): McpServer {
  return createPresetServer(hagstovaPreset, options);
}
