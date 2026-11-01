import { createPresetServer, type PresetServerOptions } from 'pxweb-mcp';

import { scbPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { scbPreset } from '@/preset';

export type ScbServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createScbServer(options: ScbServerOptions = {}): McpServer {
  return createPresetServer(scbPreset, options);
}
