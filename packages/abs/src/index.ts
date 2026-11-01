import { createPresetServer, type PresetServerOptions } from 'pxweb-mcp';

import { absPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { absPreset } from '@/preset';

export type AbsServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createAbsServer(options: AbsServerOptions = {}): McpServer {
  return createPresetServer(absPreset, options);
}
