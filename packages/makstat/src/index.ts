import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { makstatPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { makstatPreset } from '@/preset';

export type MakstatServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent'
>;

export function createMakstatServer(
  options: MakstatServerOptions = {}
): McpServer {
  return createPresetServer(makstatPreset, options);
}
