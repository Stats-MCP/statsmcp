import { createMcpHandler } from '@modelcontextprotocol/server';
import { absPreset } from '@statsmcp/abs';
import { cbsPreset } from '@statsmcp/cbs';
import { createPresetServer, type PxwebPreset } from '@statsmcp/core';
import { csoPreset } from '@statsmcp/cso';
import { dstPreset } from '@statsmcp/dst';
import { dzsPreset } from '@statsmcp/dzs';
import { eurostatPreset } from '@statsmcp/eurostat';
import { hagstovaPreset } from '@statsmcp/hagstova';
import { scbPreset } from '@statsmcp/scb';
import { sistatPreset } from '@statsmcp/sistat';
import { ssbPreset } from '@statsmcp/ssb';
import { statEePreset } from '@statsmcp/stat-ee';
import { statcanPreset } from '@statsmcp/statcan';
import { statfinPreset } from '@statsmcp/statfin';
import { staticePreset } from '@statsmcp/statice';
import { z } from 'zod';

/** The hosted endpoints, keyed by their path segment on statsmcp.dev. */
export const PRESETS = {
  si: sistatPreset,
  no: ssbPreset,
  ee: statEePreset,
  fo: hagstovaPreset,
  fi: statfinPreset,
  se: scbPreset,
  dk: dstPreset,
  nl: cbsPreset,
  eu: eurostatPreset,
  ca: statcanPreset,
  is: staticePreset,
  hr: dzsPreset,
  ie: csoPreset,
  au: absPreset
} as const satisfies Record<string, PxwebPreset>;

export type ServerId = keyof typeof PRESETS;
export const SERVER_IDS = Object.keys(PRESETS).filter(
  (id): id is ServerId => id in PRESETS
);

const initializeSchema = z.object({
  result: z.object({ instructions: z.string().min(1) })
});

const toolsSchema = z.object({
  result: z.object({
    tools: z
      .array(
        z.object({
          name: z.string(),
          description: z.string(),
          inputSchema: z.record(z.string(), z.unknown())
        })
      )
      .min(1)
  })
});

export type ToolDef = z.infer<typeof toolsSchema>['result']['tools'][number];

export interface Manifest {
  instructions: string;
  tools: ToolDef[];
}

/** Same JSON-RPC call the hosted endpoint answers; SSE or JSON body. */
async function rpc(id: ServerId, method: string, params: unknown) {
  const handler = createMcpHandler(() => createPresetServer(PRESETS[id]));
  const response = await handler.fetch(
    new Request('https://mcp.example/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    })
  );
  const raw = await response.text();
  const line = raw
    .split('\n')
    .map((text) => text.replace(/^data: /, ''))
    .find((text) => text.startsWith('{'));
  const parsed: unknown = JSON.parse(line ?? raw);
  return parsed;
}

/** initialize and tools/list need no API calls, so the manifest is exact and offline. */
export async function manifest(id: ServerId): Promise<Manifest> {
  const { result: init } = initializeSchema.parse(
    await rpc(id, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'evals', version: '0.0.0' }
    })
  );
  const { result } = toolsSchema.parse(await rpc(id, 'tools/list', {}));
  return { instructions: init.instructions, tools: result.tools };
}
