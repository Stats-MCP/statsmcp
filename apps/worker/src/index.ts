import { createMcpHandler } from '@modelcontextprotocol/server';
import { createMemoryCache, type Cache } from 'pxweb-mcp';
import { createSistatServer, sistatPreset } from 'sistat-mcp';

import { createEdgeCache } from '@/edge-cache';

interface Env {
  RATE_LIMITER: RateLimit;
}

const MCP_PATH = '/mcp';

const LANDING_TEXT = `${sistatPreset.title}

MCP endpoint: ${MCP_PATH} (Streamable HTTP, no authentication).
Data: SiStat, Statistical Office of the Republic of Slovenia (SURS). Not affiliated with or endorsed by SURS.
Source code: MIT licence.`;

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers':
    'content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id',
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version'
};

let memoryCache: Cache | undefined;

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function isRateLimited(env: Env, request: Request): Promise<boolean> {
  if (request.method !== 'POST') return false;
  const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
  try {
    const { success } = await env.RATE_LIMITER.limit({ key: clientIp });
    return !success;
  } catch (err) {
    console.error('Rate limiter failed; allowing request', err);
    return false;
  }
}

export const worker = {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === '/') {
      return new Response(LANDING_TEXT, {
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }
    if (pathname !== MCP_PATH) {
      return new Response('Not found', { status: 404 });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (await isRateLimited(env, request)) {
      return withCors(
        new Response('Too many requests. Try again in a minute.', {
          status: 429,
          headers: { 'retry-after': '60' }
        })
      );
    }

    memoryCache ??= createMemoryCache();
    const cache = createEdgeCache(caches.default, memoryCache, (promise) =>
      ctx.waitUntil(promise)
    );
    const handler = createMcpHandler(() =>
      createSistatServer({
        cache,
        userAgent: `sistat-mcp-worker/${sistatPreset.version}`
      })
    );
    return withCors(await handler.fetch(request));
  }
} satisfies ExportedHandler<Env>;

export default worker;
