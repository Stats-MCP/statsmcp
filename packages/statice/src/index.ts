import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { staticePreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { staticePreset } from '@/preset';

export type StaticeServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createStaticeServer(
  options: StaticeServerOptions = {}
): McpServer {
  return createPresetServer(staticePreset, options);
}
