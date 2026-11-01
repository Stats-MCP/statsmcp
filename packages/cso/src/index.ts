import { createPresetServer, type PresetServerOptions } from 'pxweb-mcp';

import { csoPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { csoPreset } from '@/preset';

export type CsoServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createCsoServer(options: CsoServerOptions = {}): McpServer {
  return createPresetServer(csoPreset, options);
}
