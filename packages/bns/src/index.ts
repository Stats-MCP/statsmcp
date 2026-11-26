import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { bnsPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { bnsPreset } from '@/preset';

export type BnsServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createBnsServer(options: BnsServerOptions = {}): McpServer {
  return createPresetServer(bnsPreset, options);
}
