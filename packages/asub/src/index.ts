import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { asubPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { asubPreset } from '@/preset';

export type AsubServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent'
>;

export function createAsubServer(options: AsubServerOptions = {}): McpServer {
  return createPresetServer(asubPreset, options);
}
