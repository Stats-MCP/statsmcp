import { dstPreset } from 'dst-mcp';
import { describe, expect, it, vi } from 'vitest';

import type { CrawlContext } from '@/crawl';
import { catalogueSource } from '@/sources';

function context(fetch: CrawlContext['fetch']): CrawlContext {
  return {
    fetch,
    userAgent: 'statsmcp-index/test',
    step: (_key, _schema, run) => run()
  };
}

describe('catalogueSource', () => {
  it('lists the tables through the preset client', async () => {
    const fetch = vi.fn<CrawlContext['fetch']>(async () =>
      Response.json([
        {
          id: 'FOLK1A',
          text: 'Population',
          updated: '2026-08-10',
          latestPeriod: '2026K3',
          active: true
        },
        { id: 'OLD1', text: 'Old table', active: false }
      ])
    );

    const docs = await catalogueSource(dstPreset, 1).crawl(
      'en',
      context(fetch)
    );

    expect(docs).toEqual([
      {
        id: 'FOLK1A',
        title: 'Population',
        updated: '2026-08-10',
        lastPeriod: '2026K3'
      },
      { id: 'OLD1', title: 'Old table', discontinued: true }
    ]);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.statbank.dk/v1/tables');
    expect(init?.body).toBe(JSON.stringify({ lang: 'en' }));
    expect(new Headers(init?.headers).get('user-agent')).toBe(
      'statsmcp-index/test'
    );
  });

  it('reuses a downloaded catalogue in later crawl calls of the source', async () => {
    const fetch = vi.fn<CrawlContext['fetch']>(async () =>
      Response.json([{ id: 'A', text: 'A table' }])
    );
    const source = catalogueSource(dstPreset, 1);

    await source.crawl('en', context(fetch));
    await source.crawl('en', context(fetch));

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fails for a preset whose client cannot list tables', async () => {
    const source = catalogueSource({ ...dstPreset, api: 'pxweb-v1' }, 1);

    await expect(
      source.crawl(
        'en',
        context(async () => new Response('[]'))
      )
    ).rejects.toThrow('dst cannot list its tables.');
  });
});
