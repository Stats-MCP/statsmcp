import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { sistatPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { sistatPreset } from '@/preset';

export type SistatServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent'
>;

export function createSistatServer(
  options: SistatServerOptions = {}
): McpServer {
  return createPresetServer(sistatPreset, options);
}
