import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { bdlPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { bdlPreset } from '@/preset';

export type BdlServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots' | 'clientId'
>;

export function createBdlServer(options: BdlServerOptions = {}): McpServer {
  return createPresetServer(bdlPreset, options);
}
