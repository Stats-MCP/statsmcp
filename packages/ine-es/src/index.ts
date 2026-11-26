import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { ineEsPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { ineEsPreset } from '@/preset';

export type IneEsServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createIneEsServer(options: IneEsServerOptions = {}): McpServer {
  return createPresetServer(ineEsPreset, options);
}
