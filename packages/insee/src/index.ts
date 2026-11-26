import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { inseePreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { inseePreset } from '@/preset';

export type InseeServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createInseeServer(options: InseeServerOptions = {}): McpServer {
  return createPresetServer(inseePreset, options);
}
