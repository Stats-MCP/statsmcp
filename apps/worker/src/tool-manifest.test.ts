import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { HOSTED_PATHS, handleRequest } from '@/index';

/**
 * Every tool description, input schema and the server instructions go into the
 * model's context on each turn. The budget is the largest measured manifest
 * (3,631 chars for /hr/mcp on 2026-11-01, rounded up to 4,000) plus 20 %, so
 * growth needs a deliberate change here.
 */
const MAX_MANIFEST_CHARS = 4800;
const MAX_PATTERN_CHARS = 200;

const initializeSchema = z.object({
  result: z.object({ instructions: z.string().min(1) })
});
const toolsSchema = z.object({
  result: z.object({
    tools: z
      .array(
        z.object({
          name: z.string(),
          description: z.string().min(1),
          inputSchema: z.unknown()
        })
      )
      .min(1)
  })
});

async function rpc(
  path: string,
  method: string,
  params: unknown
): Promise<unknown> {
  const response = await handleRequest(
    new Request(`https://mcp.example${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
        'cf-connecting-ip': '203.0.113.7'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    }),
    { RATE_LIMITER: { limit: async () => ({ success: true }) } },
    () => undefined
  );
  const raw = await response.text();
  const line = raw
    .split('\n')
    .map((text) => text.replace(/^data: /, ''))
    .find((text) => text.startsWith('{'));
  const parsed: unknown = JSON.parse(line ?? raw);
  return parsed;
}

async function manifest(path: string) {
  const { result: init } = initializeSchema.parse(
    await rpc(path, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' }
    })
  );
  const { result } = toolsSchema.parse(await rpc(path, 'tools/list', {}));
  const schemas = result.tools.map((tool) => JSON.stringify(tool.inputSchema));
  const size =
    init.instructions.length +
    result.tools.reduce(
      (sum, tool, index) =>
        sum + tool.description.length + (schemas[index]?.length ?? 0),
      0
    );
  return { size, schemas };
}

describe('tool manifest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(HOSTED_PATHS)(
    '%s stays within the context budget and has no long patterns',
    async (path) => {
      vi.stubGlobal('caches', { default: {} });

      const { size, schemas } = await manifest(path);
      const longPatterns = schemas.flatMap((schema) =>
        [...schema.matchAll(/"pattern":"((?:[^"\\]|\\.)*)"/g)].filter(
          (match) => (match[1] ?? '').length > MAX_PATTERN_CHARS
        )
      );

      expect(size).toBeLessThanOrEqual(MAX_MANIFEST_CHARS);
      expect(longPatterns).toEqual([]);
    }
  );
});
