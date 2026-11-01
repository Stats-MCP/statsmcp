import { createPresetServer, type PresetServerOptions } from 'pxweb-mcp';

import { dstPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { dstPreset } from '@/preset';

export type DstServerOptions = Pick<PresetServerOptions, 'cache' | 'userAgent'>;

export function createDstServer(options: DstServerOptions = {}): McpServer {
  return createPresetServer(dstPreset, options);
}
