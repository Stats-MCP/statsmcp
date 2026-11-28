import { describe, expect, it, vi } from 'vitest';

import { bdlSource } from '@/bdl';
import type { CrawlContext } from '@/crawl';

const SUBJECTS = [
  { id: 'K4', name: 'LABOUR MARKET', hasVariables: false },
  { id: 'G12', parentId: 'K4', name: 'UNEMPLOYMENT', hasVariables: false },
  {
    id: 'P3559',
    parentId: 'G12',
    name: 'Unemployment rate',
    hasVariables: true
  },
  { id: 'P2567', parentId: 'G12', name: 'LFS (archive)', hasVariables: true }
];
const YEARS: Record<string, number[]> = {
  P3559: [2011, 2026, 2025],
  P2567: [2005, 2020]
};

function siteFetch(
  years: Record<string, number[]> = YEARS
): ReturnType<typeof vi.fn<CrawlContext['fetch']>> {
  return vi.fn<CrawlContext['fetch']>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/subjects/search')) {
      return Response.json({
        totalRecords: SUBJECTS.length,
        results: SUBJECTS
      });
    }
    const id = url.pathname.split('/').at(-1) ?? '';
    const found = years[id];
    return found
      ? Response.json({ name: id, years: found })
      : new Response('missing', { status: 404 });
  });
}

function context(fetch: CrawlContext['fetch']): CrawlContext {
  return {
    fetch,
    userAgent: 'statsmcp-index/test',
    step: (_key, _schema, run) => run()
  };
}

const subjectCalls = (fetch: ReturnType<typeof siteFetch>) =>
  fetch.mock.calls.filter(([input]) => /\/subjects\/P\d+/.test(String(input)));

describe('bdlSource', () => {
  it('adds the last year of each subject with the key, read once for both languages', async () => {
    const fetch = siteFetch();
    const source = bdlSource(100, 'secret-key');

    const pl = await source.crawl('pl', context(fetch));
    const en = await source.crawl('en', context(fetch));

    expect(pl.map((doc) => [doc.id, doc.lastPeriod])).toEqual([
      ['P3559', '2026'],
      ['P2567', '2020']
    ]);
    expect(en.map((doc) => doc.lastPeriod)).toEqual(['2026', '2020']);
    expect(subjectCalls(fetch)).toHaveLength(2);
    expect(
      new Headers(subjectCalls(fetch)[0]?.[1]?.headers).get('x-clientid')
    ).toBe('secret-key');
  });

  it('lists the subjects without years when there is no key', async () => {
    const fetch = siteFetch();

    const docs = await bdlSource(100, undefined).crawl('pl', context(fetch));

    expect(docs.map((doc) => doc.lastPeriod)).toEqual([undefined, undefined]);
    expect(subjectCalls(fetch)).toHaveLength(0);
  });

  it('fails when more than 1% of the subjects have no years', async () => {
    const fetch = siteFetch({ P3559: [2026] });

    await expect(
      bdlSource(100, 'secret-key').crawl('pl', context(fetch))
    ).rejects.toThrow('no years for 1 of 2 subjects');
  });

  it('stops at once when the office refuses the key', async () => {
    const fetch = vi.fn<CrawlContext['fetch']>(async (input) =>
      String(input).includes('/subjects/search')
        ? Response.json({ totalRecords: SUBJECTS.length, results: SUBJECTS })
        : new Response('{}', { status: 403 })
    );

    await expect(
      bdlSource(100, 'wrong-key').crawl('pl', context(fetch))
    ).rejects.toThrow('Check BDL_CLIENT_ID');
  });
});
