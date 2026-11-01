import { describe, expect, it, vi } from 'vitest';

import { createMemoryCache } from '@/cache';
import { createPxwebV2Client } from '@/pxweb-v2-client';

const BASE_URL = 'https://stats.example/api/v2';

const metadataBody = {
  version: '2.0',
  class: 'dataset',
  label: 'Population by region and year',
  id: ['Region', 'ContentsCode', 'Tid'],
  size: [2, 1, 2],
  role: { time: ['Tid'], metric: ['ContentsCode'] },
  dimension: {
    Region: {
      label: 'region',
      category: {
        index: { '00': 0, '01': 1 },
        label: { '00': 'Sweden', '01': 'Stockholm county' }
      },
      extension: { elimination: true }
    },
    ContentsCode: {
      label: 'observations',
      category: { index: { BE0101N1: 0 }, label: { BE0101N1: 'Population' } },
      extension: { elimination: false }
    },
    Tid: {
      label: 'year',
      category: { index: ['2023', '2024'] },
      extension: { elimination: false }
    }
  }
};

const dataBody = {
  class: 'dataset',
  label: 'Population by region and year',
  id: ['Region', 'Tid'],
  size: [1, 2],
  dimension: {
    Region: {
      label: 'region',
      category: { index: { '00': 0 }, label: { '00': 'Sweden' } }
    },
    Tid: { label: 'year', category: { index: { '2023': 0, '2024': 1 } } }
  },
  value: [10551707, 10587710]
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('createPxwebV2Client', () => {
  it('searches tables, marks discontinued and archived ones and ranks them last', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({
        tables: [
          {
            id: 'TAB1',
            label: 'Old index (no update after 2025M12)',
            updated: '2026-01-15T07:00:00Z',
            discontinued: null
          },
          {
            id: 'TAB2',
            label: 'Closed table',
            updated: '2026-01-15T07:00:00Z',
            discontinued: true
          },
          {
            id: 'TAB3',
            label: 'Consumer price index',
            updated: '2026-10-14T06:00:00Z',
            discontinued: null
          }
        ],
        page: { pageNumber: 1 }
      })
    );
    const client = createPxwebV2Client({
      baseUrl: `${BASE_URL}/`,
      fetch: fetchMock,
      now: () => new Date('2026-11-01'),
      isArchived: (hit) => hit.title.includes('(no update after')
    });

    const hits = await client.search('en', 'price index');

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${BASE_URL}/tables?query=price+index&lang=en&pageSize=50`
    );
    expect(hits).toEqual([
      {
        tableId: 'TAB3',
        title: 'Consumer price index',
        published: '2026-10-14T06:00:00Z'
      },
      {
        tableId: 'TAB1',
        title: 'Old index (no update after 2025M12)',
        published: '2026-01-15T07:00:00Z',
        archived: true
      },
      {
        tableId: 'TAB2',
        title: 'Closed table',
        published: '2026-01-15T07:00:00Z',
        archived: true
      }
    ]);
  });

  it('lists every page of tables once and searches them locally in index mode', async () => {
    const pages = [
      {
        tables: [
          {
            id: 'TAB1',
            label: 'Population by region. Month 2025M01-2026M08',
            updated: '2026-09-20T06:00:00Z',
            lastPeriod: '2026M08',
            paths: [[{ label: 'Population' }]]
          }
        ],
        page: { pageNumber: 1, totalPages: 2 }
      },
      {
        tables: [
          {
            id: 'TAB2',
            label: 'Population by region (not updated)',
            updated: '2016-01-01T06:00:00Z',
            lastPeriod: '2016',
            discontinued: true
          }
        ],
        page: { pageNumber: 2, totalPages: 2 }
      }
    ];
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      json(
        pages[Number(new URL(String(input)).searchParams.get('pageNumber')) - 1]
      )
    );
    const client = createPxwebV2Client({
      baseUrl: BASE_URL,
      fetch: fetchMock,
      search: 'index'
    });

    const current = await client.search('en', 'population');
    const all = await client.search('en', 'population', {
      includeArchived: true
    });

    expect(current.map((hit) => hit.tableId)).toEqual(['TAB1']);
    expect(all.map((hit) => [hit.tableId, hit.archived ?? false])).toEqual([
      ['TAB1', false],
      ['TAB2', true]
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${BASE_URL}/tables?lang=en&pageSize=1000&pageNumber=1`
    );
  });

  it('marks tables archived by the preset title rule in index mode', async () => {
    const client = createPxwebV2Client({
      baseUrl: BASE_URL,
      search: 'index',
      isArchived: (hit) => hit.title.includes('(no update after'),
      fetch: async () =>
        json({
          tables: [
            {
              id: 'OLD',
              label: 'Consumer price index (no update after 2025M12)',
              discontinued: null
            },
            { id: 'NEW', label: 'Consumer price index', discontinued: null }
          ]
        })
    });

    expect(
      (await client.search('en', 'consumer price index')).map(
        (hit) => hit.tableId
      )
    ).toEqual(['NEW']);
  });

  it('maps JSON-stat metadata to variables with time and elimination flags', async () => {
    const client = createPxwebV2Client({
      baseUrl: BASE_URL,
      fetch: async () => json(metadataBody)
    });

    const metadata = await client.getMetadata('sv', 'TAB638');

    expect(metadata).toEqual({
      title: 'Population by region and year',
      variables: [
        {
          code: 'Region',
          label: 'region',
          values: ['00', '01'],
          valueLabels: ['Sweden', 'Stockholm county'],
          eliminable: true,
          isTime: false
        },
        {
          code: 'ContentsCode',
          label: 'observations',
          values: ['BE0101N1'],
          valueLabels: ['Population'],
          eliminable: false,
          isTime: false
        },
        {
          code: 'Tid',
          label: 'year',
          values: ['2023', '2024'],
          valueLabels: ['2023', '2024'],
          eliminable: false,
          isTime: true
        }
      ]
    });
  });

  it.each([400, 404])(
    'reports an unknown table (HTTP %i) as not found',
    async (status) => {
      const client = createPxwebV2Client({
        baseUrl: BASE_URL,
        fetch: async () => json({ title: 'Not found' }, status)
      });

      await expect(client.getMetadata('en', 'TAB0')).rejects.toMatchObject({
        status: 404,
        message: expect.stringContaining('Table "TAB0" was not found')
      });
    }
  );

  it('posts the selection with top(), * and item codes and returns a flat table', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(dataBody));
    const client = createPxwebV2Client({ baseUrl: BASE_URL, fetch: fetchMock });

    const table = await client.query('en', 'TAB638', [
      { code: 'Region', selection: { filter: 'item', values: ['00'] } },
      { code: 'ContentsCode', selection: { filter: 'all', values: ['*'] } },
      { code: 'Tid', selection: { filter: 'top', values: ['2'] } }
    ]);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      `${BASE_URL}/tables/TAB638/data?lang=en&outputFormat=json-stat2`
    );
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      selection: [
        { variableCode: 'Region', valueCodes: ['00'] },
        { variableCode: 'ContentsCode', valueCodes: ['*'] },
        { variableCode: 'Tid', valueCodes: ['top(2)'] }
      ]
    });
    expect(table.rows).toEqual([
      ['Sweden', '2023', 10551707],
      ['Sweden', '2024', 10587710]
    ]);
  });

  it('serves a repeated request from the cache and keeps languages apart', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(metadataBody));
    const client = createPxwebV2Client({
      baseUrl: BASE_URL,
      fetch: fetchMock,
      cache: createMemoryCache()
    });

    await client.getMetadata('en', 'TAB638');
    await client.getMetadata('en', 'TAB638');
    await client.getMetadata('sv', 'TAB638');

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `${BASE_URL}/tables/TAB638/metadata?lang=en`,
      `${BASE_URL}/tables/TAB638/metadata?lang=sv`
    ]);
  });

  it.each(['../admin', 'TAB1/data', 'TAB 1'])(
    'rejects the table id %s without a request',
    async (tableId) => {
      const fetchMock = vi.fn<typeof fetch>();
      const client = createPxwebV2Client({
        baseUrl: BASE_URL,
        fetch: fetchMock
      });

      await expect(client.getMetadata('en', tableId)).rejects.toMatchObject({
        status: 400
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});
