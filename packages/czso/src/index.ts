import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { czsoPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { czsoPreset } from '@/preset';

export type CzsoServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent'
>;

export function createCzsoServer(options: CzsoServerOptions = {}): McpServer {
  return createPresetServer(czsoPreset, options);
}
