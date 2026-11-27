import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { ibgePreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { ibgePreset } from '@/preset';

export type IbgeServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent'
>;

export function createIbgeServer(options: IbgeServerOptions = {}): McpServer {
  return createPresetServer(ibgePreset, options);
}
