import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { kasPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { kasPreset } from '@/preset';

export type KasServerOptions = Pick<PresetServerOptions, 'cache' | 'userAgent'>;

export function createKasServer(options: KasServerOptions = {}): McpServer {
  return createPresetServer(kasPreset, options);
}
