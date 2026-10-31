import { createMcpHandler, type McpServer } from '@modelcontextprotocol/server';
import { createMemoryCache, type Cache } from 'pxweb-mcp';
import { createSistatServer, sistatPreset } from 'sistat-mcp';

import { createEdgeCache } from '@/edge-cache';

export interface Env {
  RATE_LIMITER: RateLimit;
}

interface HostedServer {
  create: (cache: Cache) => McpServer;
}

const SERVERS = new Map<string, HostedServer>([
  [
    '/si/mcp',
    {
      create: (cache) =>
        createSistatServer({
          cache,
          userAgent: `sistat-mcp-worker/${sistatPreset.version}`
        })
    }
  ]
]);

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
  } catch {
    return false;
  }
}

export async function handleRequest(
  request: Request,
  env: Env,
  waitUntil: (promise: Promise<unknown>) => void
): Promise<Response> {
  const { pathname } = new URL(request.url);

  const server = SERVERS.get(pathname.replace(/\/$/, ''));
  if (!server) {
    return withCors(new Response('Not found', { status: 404 }));
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
  const cache = createEdgeCache(caches.default, memoryCache, waitUntil);
  const handler = createMcpHandler(() => server.create(cache));
  return withCors(await handler.fetch(request));
}

export const worker = {
  fetch: (request, env, ctx) =>
    handleRequest(request, env, (promise) => ctx.waitUntil(promise))
} satisfies ExportedHandler<Env>;

export default worker;
