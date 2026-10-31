import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleRequest, type Env } from '@/index';

function envWith(limit: RateLimit['limit']): Env {
  return { RATE_LIMITER: { limit } };
}

const waitUntil = (): void => undefined;

function mcpRequest(method: string): Request {
  return new Request('https://mcp.example/si/mcp', {
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

  it('serves the request when the rate limiter fails', async () => {
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
    expect(consoleError).toHaveBeenCalled();
  });

  it('lists the endpoint of each server on the landing page', async () => {
    const response = await handleRequest(
      new Request('https://mcp.example/'),
      envWith(vi.fn<RateLimit['limit']>()),
      waitUntil
    );

    expect(await response.text()).toContain('https://mcp.example/si/mcp');
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

  it.each(['/mcp', '/other'])(
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
