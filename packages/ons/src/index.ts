import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { onsPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { onsPreset } from '@/preset';

export type OnsServerOptions = Pick<PresetServerOptions, 'cache' | 'userAgent'>;

export function createOnsServer(options: OnsServerOptions = {}): McpServer {
  return createPresetServer(onsPreset, options);
}
