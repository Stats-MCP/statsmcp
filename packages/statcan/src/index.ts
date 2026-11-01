import { createPresetServer, type PresetServerOptions } from 'pxweb-mcp';

import { statcanPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { statcanPreset } from '@/preset';

export type StatcanServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createStatcanServer(
  options: StatcanServerOptions = {}
): McpServer {
  return createPresetServer(statcanPreset, options);
}
