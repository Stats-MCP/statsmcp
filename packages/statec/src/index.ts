import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { statecPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { statecPreset } from '@/preset';

export type StatecServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createStatecServer(
  options: StatecServerOptions = {}
): McpServer {
  return createPresetServer(statecPreset, options);
}
