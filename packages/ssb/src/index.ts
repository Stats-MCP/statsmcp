import { createPresetServer, type PresetServerOptions } from 'pxweb-mcp';

import { ssbPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { ssbPreset } from '@/preset';

export type SsbServerOptions = Pick<PresetServerOptions, 'cache' | 'userAgent'>;

export function createSsbServer(options: SsbServerOptions = {}): McpServer {
  return createPresetServer(ssbPreset, options);
}
