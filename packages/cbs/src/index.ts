import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { cbsPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { cbsPreset } from '@/preset';

export type CbsServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createCbsServer(options: CbsServerOptions = {}): McpServer {
  return createPresetServer(cbsPreset, options);
}
