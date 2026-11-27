import { createPresetServer, type PresetServerOptions } from '@statsmcp/core';

import { ospPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { ospPreset } from '@/preset';

export type OspServerOptions = Pick<PresetServerOptions, 'cache' | 'userAgent'>;

export function createOspServer(options: OspServerOptions = {}): McpServer {
  return createPresetServer(ospPreset, options);
}
