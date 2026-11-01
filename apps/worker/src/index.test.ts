import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleRequest, type Env } from '@/index';

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
    ['/ca/mcp', 'Statistics Canada']
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

  it.each(['/', '/si/mcp-extra', '/xx/mcp'])(
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
});
