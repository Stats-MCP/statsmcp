import { createPresetServer, type PresetServerOptions } from 'pxweb-mcp';

import { statEePreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { statEePreset } from '@/preset';

export type StatEeServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent'
>;

export function createStatEeServer(
  options: StatEeServerOptions = {}
): McpServer {
  return createPresetServer(statEePreset, options);
}
