import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { bfsPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { bfsPreset } from '@/preset';

export type BfsServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createBfsServer(options: BfsServerOptions = {}): McpServer {
  return createPresetServer(bfsPreset, options);
}
