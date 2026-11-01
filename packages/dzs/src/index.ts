import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { dzsPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { dzsPreset } from '@/preset';

export type DzsServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createDzsServer(options: DzsServerOptions = {}): McpServer {
  return createPresetServer(dzsPreset, options);
}
