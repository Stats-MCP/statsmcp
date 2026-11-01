import type { Cache } from '@statsmcp/core';

const CACHE_HOST = 'https://cache.sistat-mcp.internal';

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function edgeRequest(key: string): Promise<Request> {
  return new Request(`${CACHE_HOST}/${await sha256(key)}`);
}

/**
 * Isolate memory first, then the colo's Cache API. Cache API writes are
 * no-ops on workers.dev; they only persist on a zone (custom domain or route).
 */
export function createEdgeCache(
  edge: globalThis.Cache,
  memory: Cache,
  waitUntil: (promise: Promise<unknown>) => void
): Cache {
  return {
    async get(key) {
      const fromMemory = await memory.get(key);
      if (fromMemory !== undefined) return fromMemory;
      try {
        const response = await edge.match(await edgeRequest(key));
        if (!response) return undefined;
        const value = await response.text();
        await memory.set(key, value, 60);
        return value;
      } catch {
        return undefined;
      }
    },
    async set(key, value, ttlSeconds) {
      if (ttlSeconds <= 0) return;
      await memory.set(key, value, ttlSeconds);
      waitUntil(
        edgeRequest(key)
          .then((request) =>
            edge.put(
              request,
              new Response(value, {
                headers: { 'cache-control': `public, max-age=${ttlSeconds}` }
              })
            )
          )
          .catch(() => undefined)
      );
    }
  };
}
