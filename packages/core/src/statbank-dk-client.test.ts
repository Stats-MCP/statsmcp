import { describe, expect, it, vi } from 'vitest';

import { createMemoryCache } from '@/cache';
import { createStatbankDkClient } from '@/statbank-dk-client';

const BASE_URL = 'https://stats.example/v1';

const tables = [
  {
    id: 'FOLK1A',
    text: 'Population at the first day of the quarter',
    updated: '2026-08-10T08:00:00',
    active: true
  },
  {
    id: 'PRIS111',
    text: 'Consumer price index',
    updated: '2026-01-12T08:00:00',
    active: false
  },
  {
    id: 'PRIS01',
    text: 'Consumer price index',
    updated: '2026-10-10T08:00:00',
    active: true
  }
];

const tableInfo = {
  text: 'Consumer price index',
  variables: [
    {
      id: 'VAREGR',
      text: 'commodity group',
      elimination: true,
      values: [
        { id: '000000', text: '00 Consumer price index, total' },
        { id: '010000', text: '01 Food' }
      ]
    },
    {
      id: 'Tid',
      text: 'time',
      time: true,
      values: [
        { id: '2026M08', text: '2026M08' },
        { id: '2026M09', text: '2026M09' }
      ]
    }
  ]
};

const jsonStat1 = {
  dataset: {
    label: 'Consumer price index by time',
    source: 'Statistics Denmark',
    dimension: {
      ContentsCode: {
        label: 'Indhold',
        category: {
          index: { PRIS01: 0 },
          label: { PRIS01: 'Consumer price index' }
        }
      },
      Tid: {
        label: 'time',
        category: {
          index: { '2026M08': 0, '2026M09': 1 },
          label: { '2026M08': '2026M08', '2026M09': '2026M09' }
        }
      },
      id: ['ContentsCode', 'Tid'],
      size: [1, 2],
      role: { metric: ['ContentsCode'], time: ['Tid'] }
    },
    value: [104.2, 104.5]
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('createStatbankDkClient', () => {
  it('searches the table list locally and hides inactive tables unless asked', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(tables));
    const client = createStatbankDkClient({
      baseUrl: BASE_URL,
      fetch: fetchMock,
      cache: createMemoryCache(),
      now: () => new Date('2026-11-01')
    });

    const current = await client.search('en', 'consumer price index');
    const hits = await client.search('en', 'consumer price index', {
      includeArchived: true
    });
    await client.search('en', 'population');

    expect(current.map((hit) => hit.tableId)).toEqual(['PRIS01']);
    expect(hits).toEqual([
      {
        tableId: 'PRIS01',
        title: 'Consumer price index',
        published: '2026-10-10T08:00:00'
      },
      {
        tableId: 'PRIS111',
        title: 'Consumer price index',
        published: '2026-01-12T08:00:00',
        archived: true
      }
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${BASE_URL}/tables`);
    expect(JSON.parse(String(init?.body))).toEqual({ lang: 'en' });
  });

  it('downloads the table list once for parallel searches', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(tables));
    const client = createStatbankDkClient({
      baseUrl: BASE_URL,
      fetch: fetchMock
    });

    await Promise.all([
      client.search('en', 'consumer price'),
      client.search('en', 'population')
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps table info to variables with time and elimination flags', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(tableInfo));
    const client = createStatbankDkClient({
      baseUrl: BASE_URL,
      fetch: fetchMock
    });

    const metadata = await client.getMetadata('da', 'PRIS01');

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${BASE_URL}/tableinfo/PRIS01?lang=da`
    );
    expect(metadata.variables).toEqual([
      {
        code: 'VAREGR',
        label: 'commodity group',
        values: ['000000', '010000'],
        valueLabels: ['00 Consumer price index, total', '01 Food'],
        eliminable: true,
        isTime: false
      },
      {
        code: 'Tid',
        label: 'time',
        values: ['2026M08', '2026M09'],
        valueLabels: ['2026M08', '2026M09'],
        eliminable: false,
        isTime: true
      }
    ]);
  });

  it('reports an unknown table as not found', async () => {
    const client = createStatbankDkClient({
      baseUrl: BASE_URL,
      fetch: async () => json({ errorTypeCode: 'TABLE-NOT-FOUND' }, 400)
    });

    await expect(client.getMetadata('en', 'NOPE1')).rejects.toMatchObject({
      status: 404
    });
  });

  it('posts the selection with (-n+N), * and codes and converts JSON-stat 1.0', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(jsonStat1));
    const client = createStatbankDkClient({
      baseUrl: BASE_URL,
      fetch: fetchMock
    });

    const table = await client.query('en', 'PRIS01', [
      { code: 'VAREGR', selection: { filter: 'item', values: ['000000'] } },
      { code: 'ENHED', selection: { filter: 'all', values: ['*'] } },
      { code: 'Tid', selection: { filter: 'top', values: ['2'] } }
    ]);

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      table: 'PRIS01',
      format: 'JSONSTAT',
      lang: 'en',
      variables: [
        { code: 'VAREGR', values: ['000000'] },
        { code: 'ENHED', values: ['*'] },
        { code: 'Tid', values: ['(-n+2)'] }
      ]
    });
    expect(table.rows).toEqual([
      ['Consumer price index', '2026M08', 104.2],
      ['Consumer price index', '2026M09', 104.5]
    ]);
  });

  it.each([
    ['no id and size', { label: { label: 'x' } }],
    [
      'a malformed dimension',
      { id: ['Tid'], size: [1], Tid: { label: 'time' } }
    ]
  ])(
    'rejects a JSON-stat body with %s as a bad gateway',
    async (_case, dimension) => {
      const client = createStatbankDkClient({
        baseUrl: BASE_URL,
        fetch: async () => json({ dataset: { dimension, value: [1] } })
      });

      await expect(client.query('en', 'PRIS01', [])).rejects.toMatchObject({
        status: 502
      });
    }
  );

  it.each(['../x', 'PRIS 01', 'a/b'])(
    'rejects the table id %s without a request',
    async (tableId) => {
      const fetchMock = vi.fn<typeof fetch>();
      const client = createStatbankDkClient({
        baseUrl: BASE_URL,
        fetch: fetchMock
      });

      await expect(client.query('en', tableId, [])).rejects.toMatchObject({
        status: 400
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});
