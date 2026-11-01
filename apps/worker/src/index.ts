import { createMcpHandler, type McpServer } from '@modelcontextprotocol/server';
import { absPreset } from '@statsmcp/abs';
import { cbsPreset } from '@statsmcp/cbs';
import {
  bucketSnapshotReader,
  createMemoryCache,
  createMultiServer,
  createPresetClient,
  createPresetServer,
  type Cache,
  type PxwebPreset,
  type SnapshotReader
} from '@statsmcp/core';
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

import { createEdgeCache } from '@/edge-cache';
import { isIndexFile, serveIndexFile, type IndexBucket } from '@/index-files';

export interface Env {
  RATE_LIMITER: RateLimit;
  INDEX?: IndexBucket;
}

interface HostedServer {
  create: (cache: Cache, tableSnapshots?: SnapshotReader) => McpServer;
}

interface HostedCountry {
  /** Path segment on statsmcp.dev and the `country` code on /mcp. */
  code: string;
  preset: PxwebPreset;
  /** Package name sent in the User-Agent, kept from before the scope rename. */
  agent: string;
  /** Gets the crawled R2 snapshots, as search source or as fallback for a failing live list. */
  snapshots: boolean;
}

const COUNTRIES: readonly HostedCountry[] = [
  { code: 'si', preset: sistatPreset, agent: 'sistat-mcp', snapshots: false },
  { code: 'no', preset: ssbPreset, agent: 'ssb-mcp', snapshots: false },
  { code: 'ee', preset: statEePreset, agent: 'stat-ee-mcp', snapshots: false },
  {
    code: 'fo',
    preset: hagstovaPreset,
    agent: 'hagstova-mcp',
    snapshots: false
  },
  { code: 'fi', preset: statfinPreset, agent: 'statfin-mcp', snapshots: false },
  { code: 'se', preset: scbPreset, agent: 'scb-mcp', snapshots: true },
  { code: 'dk', preset: dstPreset, agent: 'dst-mcp', snapshots: true },
  { code: 'nl', preset: cbsPreset, agent: 'cbs-mcp', snapshots: true },
  {
    code: 'eu',
    preset: eurostatPreset,
    agent: 'statsmcp-eurostat',
    snapshots: true
  },
  {
    code: 'ca',
    preset: statcanPreset,
    agent: 'statsmcp-statcan',
    snapshots: true
  },
  { code: 'is', preset: staticePreset, agent: 'statice-mcp', snapshots: true },
  { code: 'hr', preset: dzsPreset, agent: 'dzs-mcp', snapshots: true },
  { code: 'ie', preset: csoPreset, agent: 'cso-mcp', snapshots: true },
  { code: 'au', preset: absPreset, agent: 'abs-mcp', snapshots: true }
];

function serverOptions(
  country: HostedCountry,
  cache: Cache,
  tableSnapshots: SnapshotReader | undefined
) {
  return {
    cache,
    userAgent: `${country.agent}-worker/${country.preset.version}`,
    ...(country.snapshots && tableSnapshots ? { tableSnapshots } : {})
  };
}

// All packages share one release version (changesets fixed group), so any preset gives it.
const MULTI_SERVER_VERSION = sistatPreset.version;

const SERVERS = new Map<string, HostedServer>([
  ...COUNTRIES.map((country): [string, HostedServer] => [
    `/${country.code}/mcp`,
    {
      create: (cache, tableSnapshots) =>
        createPresetServer(
          country.preset,
          serverOptions(country, cache, tableSnapshots)
        )
    }
  ]),
  [
    '/mcp',
    {
      create: (cache, tableSnapshots) =>
        createMultiServer(
          COUNTRIES.map((country) => ({
            code: country.code,
            preset: country.preset,
            client: () =>
              createPresetClient(
                country.preset,
                serverOptions(country, cache, tableSnapshots)
              )
          })),
          {
            name: 'statsmcp',
            title: 'StatsMCP (official statistics from many offices)',
            version: MULTI_SERVER_VERSION
          }
        )
    }
  ]
]);

export const HOSTED_PATHS: readonly string[] = [...SERVERS.keys()];

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
  if (isIndexFile(pathname)) return serveIndexFile(request, env.INDEX);

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
  const tableSnapshots = env.INDEX
    ? bucketSnapshotReader(env.INDEX)
    : undefined;
  const handler = createMcpHandler(() => server.create(cache, tableSnapshots));
  return withCors(await handler.fetch(request));
}

export const worker = {
  fetch: (request, env, ctx) =>
    handleRequest(request, env, (promise) => ctx.waitUntil(promise))
} satisfies ExportedHandler<Env>;

export default worker;
