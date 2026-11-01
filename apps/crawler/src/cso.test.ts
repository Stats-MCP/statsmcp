import { describe, expect, it, vi } from 'vitest';

import type { CrawlContext } from '@/crawl';
import { csoSource } from '@/cso';

const item = {
  label: 'Consumer Price Index',
  updated: '2026-01-15T11:00:00Z',
  id: ['STATISTIC', 'TLIST(M1)', 'C01779V03424'],
  extension: { matrix: 'CPM01' },
  role: { time: ['TLIST(M1)'] },
  dimension: {
    STATISTIC: { label: 'STATISTIC', category: {} },
    'TLIST(M1)': {
      label: 'Month',
      category: {
        label: { '197511': '1975 November', '202512': '2025 December' }
      }
    },
    C01779V03424: { label: 'Commodity Group', category: {} }
  }
};

function context(fetch: CrawlContext['fetch']): CrawlContext {
  return { fetch, userAgent: 'test', step: (_key, _schema, run) => run() };
}

describe('csoSource', () => {
  it('reads the collection once and adds dimensions and periods to the title', async () => {
    const fetch = vi.fn<CrawlContext['fetch']>(async () =>
      Response.json({ jsonrpc: '2.0', result: { link: { item: [item] } } })
    );

    const docs = await csoSource('https://ws.example/public').crawl(
      'en',
      context(fetch)
    );

    expect(docs).toEqual([
      {
        id: 'CPM01',
        title:
          'Consumer Price Index by Commodity Group (1975 November – 2025 December)',
        updated: '2026-01-15T11:00:00Z',
        lastPeriod: '2025 December'
      }
    ]);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://ws.example/public/api.jsonrpc');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      method: 'PxStat.Data.Cube_API.ReadCollection',
      params: { language: 'en' }
    });
  });

  it('lists tables with the newest data first', async () => {
    const census = {
      ...item,
      label: '2002 Population',
      extension: { matrix: 'B0101' },
      dimension: {
        ...item.dimension,
        'TLIST(M1)': { label: 'Year', category: { label: { '2002': '2002' } } }
      }
    };
    const fetch = vi.fn<CrawlContext['fetch']>(async () =>
      Response.json({ result: { link: { item: [census, item] } } })
    );

    const docs = await csoSource('https://ws.example/public').crawl(
      'en',
      context(fetch)
    );

    expect(docs.map((doc) => doc.id)).toEqual(['CPM01', 'B0101']);
  });

  it('takes the period range from the sorted period codes', async () => {
    const descending = {
      ...item,
      dimension: {
        ...item.dimension,
        'TLIST(M1)': {
          label: 'Year',
          category: {
            index: ['2025', '2024'],
            label: { '2024': '2024', '2025': '2025' }
          }
        }
      }
    };
    const fetch = vi.fn<CrawlContext['fetch']>(async () =>
      Response.json({ result: { link: { item: [descending] } } })
    );

    const [doc] = await csoSource('https://ws.example/public').crawl(
      'en',
      context(fetch)
    );

    expect(doc).toMatchObject({
      title: 'Consumer Price Index by Commodity Group (2024 – 2025)',
      lastPeriod: '2025'
    });
  });

  it('fails on an HTTP error', async () => {
    const source = csoSource('https://ws.example/public');

    await expect(
      source.crawl(
        'en',
        context(async () => new Response('down', { status: 503 }))
      )
    ).rejects.toThrow('HTTP 503');
  });
});
