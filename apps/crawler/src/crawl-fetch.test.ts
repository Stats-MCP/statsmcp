import { describe, expect, it, vi } from 'vitest';

import { createCrawlFetch, type CrawlFetch } from '@/crawl-fetch';

const NOW = Date.parse('2026-11-01T12:00:00Z');

function setup(responses: (Response | Error)[]) {
  const waits: number[] = [];
  const seen: Headers[] = [];
  const fetch = vi.fn<CrawlFetch>(async (_input, init) => {
    seen.push(new Headers(init?.headers));
    const next = responses.shift();
    if (next === undefined) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  });
  const crawlFetch = createCrawlFetch({
    bucket: { take: async () => undefined },
    userAgent: 'statsmcp-index/test (+https://statsmcp.dev)',
    fetch,
    maxAttempts: 3,
    baseDelayMs: 100,
    maxRetryAfterMs: 60_000,
    now: () => NOW,
    sleep: async (ms) => {
      waits.push(ms);
    }
  });
  return { crawlFetch, fetch, waits, seen };
}

const ok = () => new Response('ok');
const status = (code: number, headers: Record<string, string> = {}) =>
  new Response('busy', { status: code, headers });

describe('createCrawlFetch', () => {
  it.each([
    [
      'Retry-After in seconds',
      [status(429, { 'retry-after': '3' }), ok()],
      [3000]
    ],
    [
      'Retry-After as a date',
      [status(503, { 'retry-after': 'Sun, 01 Nov 2026 12:00:07 GMT' }), ok()],
      [7000]
    ],
    [
      '5xx with exponential backoff',
      [status(502), status(500), ok()],
      [100, 200]
    ],
    ['a network error', [new Error('ECONNRESET'), ok()], [100]],
    ['a blank Retry-After', [status(429, { 'retry-after': ' ' }), ok()], [100]]
  ])('retries after %s', async (_case, responses, waits) => {
    const test = setup(responses);

    const response = await test.crawlFetch('https://example.test/a');

    expect(response.status).toBe(200);
    expect(test.waits).toEqual(waits);
  });

  it('sends the crawler user agent and keeps other headers', async () => {
    const test = setup([ok()]);

    await test.crawlFetch('https://example.test/a', {
      headers: { accept: 'application/json' }
    });

    expect(test.seen[0]?.get('user-agent')).toBe(
      'statsmcp-index/test (+https://statsmcp.dev)'
    );
    expect(test.seen[0]?.get('accept')).toBe('application/json');
  });

  it('returns the last response after the last attempt and does not retry 4xx', async () => {
    const failing = setup([status(500), status(500), status(500)]);
    const missing = setup([status(404)]);

    expect((await failing.crawlFetch('https://example.test/a')).status).toBe(
      500
    );
    expect(failing.fetch).toHaveBeenCalledTimes(3);
    expect((await missing.crawlFetch('https://example.test/b')).status).toBe(
      404
    );
    expect(missing.fetch).toHaveBeenCalledTimes(1);
  });

  it('times out a stalled request and retries it', async () => {
    let calls = 0;
    const crawlFetch = createCrawlFetch({
      bucket: { take: async () => undefined },
      userAgent: 'statsmcp-index/test',
      timeoutMs: 20,
      sleep: async () => undefined,
      fetch: async (_input, init) => {
        calls += 1;
        if (calls > 1) return new Response('ok');
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted'))
          );
        });
      }
    });

    expect((await crawlFetch('https://example.test/a')).status).toBe(200);
    expect(calls).toBe(2);
  });

  it('stops when the server asks to wait longer than the limit', async () => {
    const test = setup([status(429, { 'retry-after': '3600' })]);

    await expect(test.crawlFetch('https://example.test/a')).rejects.toThrow(
      'asks to retry after 3600 s'
    );
  });
});
