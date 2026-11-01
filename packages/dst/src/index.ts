import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { dstPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { dstPreset } from '@/preset';

export type DstServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent' | 'tableSnapshots'
>;

export function createDstServer(options: DstServerOptions = {}): McpServer {
  return createPresetServer(dstPreset, options);
}
