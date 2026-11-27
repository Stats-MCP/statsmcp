import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { statbelPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { statbelPreset } from '@/preset';

export type StatbelServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent'
>;

export function createStatbelServer(
  options: StatbelServerOptions = {}
): McpServer {
  return createPresetServer(statbelPreset, options);
}
