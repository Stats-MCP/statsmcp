import { createPresetServer, type PresetServerOptions } from 'pxweb-mcp';

import { statfinPreset } from '@/preset';

import type { McpServer } from '@modelcontextprotocol/server';

export { statfinPreset } from '@/preset';

export type StatfinServerOptions = Pick<
  PresetServerOptions,
  'cache' | 'userAgent'
>;

export function createStatfinServer(
  options: StatfinServerOptions = {}
): McpServer {
  return createPresetServer(statfinPreset, options);
}
