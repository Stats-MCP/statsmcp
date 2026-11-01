import { writeSnapshot } from '@statsmcp/core';
import { afterEach, describe, expect, inject, it, vi } from 'vitest';

import { HOSTED_PATHS, handleRequest, type Env } from '@/index';

declare module 'vitest' {
  export interface ProvidedContext {
    routePatterns: string[];
  }
}

function envWith(limit: RateLimit['limit']): Env {
  return { RATE_LIMITER: { limit } };
}

const waitUntil = (): void => undefined;

function mcpRequest(method: string, path = '/si/mcp'): Request {
  return new Request(`https://mcp.example${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      'cf-connecting-ip': '203.0.113.7'
    },
    body:
      method === 'POST'
        ? JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
        : undefined
  });
}

const cubeList = [
  {
    productId: '18100004',
    cubeTitleEn: 'Consumer Price Index, monthly',
    cubeTitleFr: 'Indice des prix a la consommation mensuel',
    cubeEndDate: '2026-09-01',
    releaseTime: '2026-10-21T12:30:00Z',
    archived: '2',
    frequencyCode: 6
  }
];

function stubCatalogue(): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(cubeList))
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('caches', {
    default: { match: async () => undefined, put: async () => undefined }
  });
  return fetchMock;
}

function searchRequest(): Request {
  return new Request('https://mcp.example/ca/mcp', {
    method: 'POST',
    headers: mcpRequest('POST', '/ca/mcp').headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'search_tables', arguments: { query: 'price' } }
    })
  });
}

function catalogueCalls(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
): number {
  return fetchMock.mock.calls.filter(([input]) =>
    String(input).endsWith('/getAllCubesListLite')
  ).length;
}

function envWithBucket(): Env {
  return {
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    INDEX: { get: async () => null }
  };
}

describe('worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('answers a CORS preflight without the rate limiter', async () => {
    const limit = vi.fn<RateLimit['limit']>();

    const response = await handleRequest(
      mcpRequest('OPTIONS'),
      envWith(limit),
      waitUntil
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(limit).not.toHaveBeenCalled();
  });

  it('returns 429 with CORS headers when the client IP is over the limit', async () => {
    const limit = vi.fn<RateLimit['limit']>(async () => ({ success: false }));

    const response = await handleRequest(
      mcpRequest('POST'),
      envWith(limit),
      waitUntil
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(limit).toHaveBeenCalledWith({ key: '203.0.113.7' });
  });

  it('serves the request without logging when the rate limiter fails', async () => {
    // tools/list never reads the cache, so an empty Cache API stub is enough.
    vi.stubGlobal('caches', { default: {} });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const limit = vi.fn<RateLimit['limit']>(async () => {
      throw new Error('binding down');
    });

    const response = await handleRequest(
      mcpRequest('POST'),
      envWith(limit),
      waitUntil
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.text()).toContain('query_table');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it.each([
    ['/si/mcp', 'SiStat'],
    ['/no/mcp', 'Statistics Norway'],
    ['/ee/mcp', 'Statistics Estonia'],
    ['/fo/mcp', 'Statistics Faroe Islands'],
    ['/fi/mcp', 'Statistics Finland'],
    ['/se/mcp', 'Statistics Sweden'],
    ['/dk/mcp', 'Statistics Denmark'],
    ['/nl/mcp', 'Statistics Netherlands'],
    ['/eu/mcp', 'Eurostat'],
    ['/ca/mcp', 'Statistics Canada'],
    ['/is/mcp', 'Statistics Iceland'],
    ['/hr/mcp', 'Croatian Bureau of Statistics'],
    ['/ie/mcp', 'Central Statistics Office'],
    ['/au/mcp', 'Australian Bureau of Statistics'],
    ['/mcp', 'national statistics offices and Eurostat']
  ])('serves the %s server', async (path, instructionsPart) => {
    vi.stubGlobal('caches', { default: {} });
    const initialize = new Request(`https://mcp.example${path}`, {
      method: 'POST',
      headers: mcpRequest('POST', path).headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' }
        }
      })
    });

    const response = await handleRequest(
      initialize,
      envWith(vi.fn<RateLimit['limit']>(async () => ({ success: true }))),
      waitUntil
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(instructionsPart);
  });

  it('searches the R2 snapshot when the live table list fails', async () => {
    vi.stubGlobal('caches', {
      default: { match: async () => undefined, put: async () => undefined }
    });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('network down');
      })
    );
    const gzip = await writeSnapshot({
      version: 1,
      source: 'dst',
      lang: 'en',
      builtAt: '2026-11-01T00:00:00.000Z',
      count: 1,
      docs: [
        { id: 'FOLK1A', title: 'Population at the first day of the quarter' }
      ]
    });
    const get = vi.fn<NonNullable<Env['INDEX']>['get']>(async () => ({
      body: new Blob([gzip]).stream(),
      httpEtag: '"x"'
    }));
    const search = new Request('https://mcp.example/dk/mcp', {
      method: 'POST',
      headers: mcpRequest('POST', '/dk/mcp').headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'search_tables',
          arguments: { query: 'population', lang: 'en' }
        }
      })
    });

    const response = await handleRequest(
      search,
      {
        RATE_LIMITER: { limit: async () => ({ success: true }) },
        INDEX: { get }
      },
      waitUntil
    );

    expect(await response.text()).toContain('FOLK1A');
    expect(get).toHaveBeenCalledWith('index/dst/en.json.gz');
  });

  describe('client reuse', () => {
    it('fetches the catalogue once for two searches with the same env', async () => {
      const fetchMock = stubCatalogue();
      const env = envWithBucket();

      const first = await handleRequest(searchRequest(), env, waitUntil);
      const second = await handleRequest(searchRequest(), env, waitUntil);

      expect(await first.text()).toContain('18100004');
      expect(await second.text()).toContain('18100004');
      expect(catalogueCalls(fetchMock)).toBe(1);
    });

    it('builds a new client when the index bucket changes', async () => {
      const fetchMock = stubCatalogue();

      const first = await handleRequest(
        searchRequest(),
        envWithBucket(),
        waitUntil
      );
      await first.text();
      const second = await handleRequest(
        searchRequest(),
        envWithBucket(),
        waitUntil
      );
      await second.text();

      expect(catalogueCalls(fetchMock)).toBe(2);
    });
  });

  it('accepts a trailing slash and a query string on a server path', async () => {
    const response = await handleRequest(
      new Request('https://mcp.example/si/mcp/?client=x', {
        method: 'OPTIONS'
      }),
      envWith(vi.fn<RateLimit['limit']>()),
      waitUntil
    );

    expect(response.status).toBe(204);
  });

  it.each(['/', '/si/mcp-extra', '/mcp-extra', '/xx/mcp'])(
    'returns 404 with CORS headers for %s',
    async (path) => {
      const limit = vi.fn<RateLimit['limit']>();

      const response = await handleRequest(
        new Request(`https://mcp.example${path}`, { method: 'POST' }),
        envWith(limit),
        waitUntil
      );

      expect(response.status).toBe(404);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(limit).not.toHaveBeenCalled();
    }
  );

  it('has a production route for every hosted server', () => {
    const patterns = inject('routePatterns');

    expect(
      HOSTED_PATHS.filter(
        (path) =>
          !patterns.includes(`statsmcp.dev${path}*`) &&
          !patterns.includes(`statsmcp.dev${path}`)
      )
    ).toEqual([]);
  });
});
