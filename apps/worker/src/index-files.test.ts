import { describe, expect, it } from 'vitest';

import { handleRequest, type Env } from '@/index';
import type { IndexBucket } from '@/index-files';

const body = new Uint8Array([0x1f, 0x8b, 1, 2, 3]);

function bucket(keys: string[]): IndexBucket {
  return {
    get: async (key) =>
      keys.includes(key)
        ? { body: new Blob([body]).stream(), httpEtag: '"abc"' }
        : null
  };
}

function env(index?: IndexBucket): Env {
  return {
    RATE_LIMITER: { limit: async () => ({ success: true }) },
    INDEX: index
  };
}

const waitUntil = (): void => undefined;

describe('index files', () => {
  it('serves a snapshot from R2 with cache and CORS headers', async () => {
    const response = await handleRequest(
      new Request('https://statsmcp.dev/index/hagstofa/en.json.gz'),
      env(bucket(['index/hagstofa/en.json.gz'])),
      waitUntil
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/gzip');
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('etag')).toBe('"abc"');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
  });

  it.each([
    [
      'a missing snapshot',
      'https://statsmcp.dev/index/hagstofa/is.json.gz',
      'GET',
      404
    ],
    ['a write', 'https://statsmcp.dev/index/hagstofa/en.json.gz', 'PUT', 405],
    [
      'a path outside the pattern',
      'https://statsmcp.dev/index/../secret.json.gz',
      'GET',
      404
    ]
  ])('answers %s', async (_case, url, method, status) => {
    const response = await handleRequest(
      new Request(url, { method }),
      env(bucket(['index/hagstofa/en.json.gz'])),
      waitUntil
    );

    expect(response.status).toBe(status);
  });

  it('answers HEAD with headers and no body', async () => {
    const response = await handleRequest(
      new Request('https://statsmcp.dev/index/hagstofa/en.json.gz', {
        method: 'HEAD'
      }),
      env(bucket(['index/hagstofa/en.json.gz'])),
      waitUntil
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"abc"');
    expect(await response.text()).toBe('');
  });

  it('answers 503 when R2 fails', async () => {
    const response = await handleRequest(
      new Request('https://statsmcp.dev/index/hagstofa/en.json.gz'),
      env({
        get: async () => {
          throw new Error('R2 down');
        }
      }),
      waitUntil
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('60');
  });

  it('answers 404 when the bucket is not bound', async () => {
    const response = await handleRequest(
      new Request('https://statsmcp.dev/index/hagstofa/en.json.gz'),
      env(),
      waitUntil
    );

    expect(response.status).toBe(404);
  });
});
