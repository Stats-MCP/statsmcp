import { createPresetServer, type PresetServerOptions } from 'pxweb-mcp';

import { singstatPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { singstatPreset } from '@/preset';

export type SingstatServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent'
>;

export function createSingstatServer(
  options: SingstatServerOptions = {}
): McpServer {
  return createPresetServer(singstatPreset, options);
}
