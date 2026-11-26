import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { inePtPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { inePtPreset } from '@/preset';

export type InePtServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createInePtServer(options: InePtServerOptions = {}): McpServer {
  return createPresetServer(inePtPreset, options);
}
