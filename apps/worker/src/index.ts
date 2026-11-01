import { createMcpHandler, type McpServer } from '@modelcontextprotocol/server';
import { createCbsServer, cbsPreset } from 'cbs-mcp';
import { createDstServer, dstPreset } from 'dst-mcp';
import { createHagstovaServer, hagstovaPreset } from 'hagstova-mcp';
import { createMemoryCache, type Cache } from 'pxweb-mcp';
import { createScbServer, scbPreset } from 'scb-mcp';
import { createSistatServer, sistatPreset } from 'sistat-mcp';
import { createSsbServer, ssbPreset } from 'ssb-mcp';
import { createStatEeServer, statEePreset } from 'stat-ee-mcp';
import { createStatfinServer, statfinPreset } from 'statfin-mcp';

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
  ],
  [
    '/no/mcp',
    {
      create: (cache) =>
        createSsbServer({
          cache,
          userAgent: `ssb-mcp-worker/${ssbPreset.version}`
        })
    }
  ],
  [
    '/ee/mcp',
    {
      create: (cache) =>
        createStatEeServer({
          cache,
          userAgent: `stat-ee-mcp-worker/${statEePreset.version}`
        })
    }
  ],
  [
    '/fo/mcp',
    {
      create: (cache) =>
        createHagstovaServer({
          cache,
          userAgent: `hagstova-mcp-worker/${hagstovaPreset.version}`
        })
    }
  ],
  [
    '/fi/mcp',
    {
      create: (cache) =>
        createStatfinServer({
          cache,
          userAgent: `statfin-mcp-worker/${statfinPreset.version}`
        })
    }
  ],
  [
    '/se/mcp',
    {
      create: (cache) =>
        createScbServer({
          cache,
          userAgent: `scb-mcp-worker/${scbPreset.version}`
        })
    }
  ],
  [
    '/dk/mcp',
    {
      create: (cache) =>
        createDstServer({
          cache,
          userAgent: `dst-mcp-worker/${dstPreset.version}`
        })
    }
  ],
  [
    '/nl/mcp',
    {
      create: (cache) =>
        createCbsServer({
          cache,
          userAgent: `cbs-mcp-worker/${cbsPreset.version}`
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
