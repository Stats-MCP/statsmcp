import { describe, expect, it, vi } from 'vitest';

import { createPxstatClient } from '@/pxstat-client';

const ROOT = 'https://ws.example/public';

const metadata = {
  class: 'dataset',
  label: 'Consumer Price Index',
  id: ['STATISTIC', 'TLIST(M1)', 'C01779V03424'],
  size: [2, 3, 2],
  dimension: {
    STATISTIC: {
      label: 'Statistic',
      category: {
        index: ['CPM01C08', 'CPM01C07'],
        label: { CPM01C08: 'Index', CPM01C07: 'Change over 12 months' }
      }
    },
    'TLIST(M1)': {
      label: 'Month',
      category: {
        index: ['202510', '202511', '202512'],
        label: {
          '202510': '2025 October',
          '202511': '2025 November',
          '202512': '2025 December'
        }
      }
    },
    C01779V03424: {
      label: 'Commodity Group',
      category: {
        index: { '-': 0, '01': 1 },
        label: { '-': 'All items', '01': 'Food' }
      }
    }
  },
  role: { time: ['TLIST(M1)'], metric: ['STATISTIC'] },
  extension: {
    matrix: 'CPM01',
    elimination: { C01779V03424: '-', STATISTIC: null }
  },
  value: []
};

const dataset = {
  class: 'dataset',
  label: 'Consumer Price Index',
  id: ['STATISTIC', 'TLIST(M1)', 'C01779V03424'],
  size: [1, 2, 1],
  dimension: {
    STATISTIC: {
      label: 'Statistic',
      category: { index: ['CPM01C07'], label: { CPM01C07: 'Change' } }
    },
    'TLIST(M1)': {
      label: 'Month',
      category: {
        index: ['202511', '202512'],
        label: { '202511': '2025 November', '202512': '2025 December' }
      }
    },
    C01779V03424: {
      label: 'Commodity Group',
      category: { index: ['-'], label: { '-': 'All items' } }
    }
  },
  value: [3.2, 2.8]
};

function setup(rpcResult: unknown = dataset, metadataStatus = 200) {
  const fetchMock = vi.fn<typeof fetch>(async (input) =>
    String(input).includes('ReadMetadata')
      ? new Response(JSON.stringify(metadata), { status: metadataStatus })
      : Response.json({ jsonrpc: '2.0', result: rpcResult, id: 1 })
  );
  const client = createPxstatClient({ baseUrl: ROOT, fetch: fetchMock });
  return { client, fetchMock };
}

describe('createPxstatClient', () => {
  it('reads variables, time and eliminable totals from the metadata', async () => {
    const { client, fetchMock } = setup();

    const table = await client.getMetadata('en', 'CPM01');

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${ROOT}/api.restful/PxStat.Data.Cube_API.ReadMetadata/CPM01/JSON-stat/2.0/en`
    );
    expect(table.variables).toEqual([
      expect.objectContaining({
        code: 'STATISTIC',
        isTime: false,
        eliminable: false
      }),
      expect.objectContaining({ code: 'TLIST(M1)', isTime: true }),
      {
        code: 'C01779V03424',
        label: 'Commodity Group',
        values: ['-', '01'],
        valueLabels: ['All items', 'Food'],
        eliminable: true,
        isTime: false
      }
    ]);
  });

  it('asks for the latest periods and the total of an omitted optional variable', async () => {
    const { client, fetchMock } = setup();

    const table = await client.query('en', 'CPM01', [
      {
        code: 'STATISTIC',
        selection: { filter: 'item', values: ['CPM01C07'] }
      },
      { code: 'TLIST(M1)', selection: { filter: 'top', values: ['2'] } }
    ]);

    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(String(url)).toBe(`${ROOT}/api.jsonrpc`);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      method: 'PxStat.Data.Cube_API.ReadDataset',
      params: {
        id: ['STATISTIC', 'TLIST(M1)', 'C01779V03424'],
        dimension: {
          STATISTIC: { category: { index: ['CPM01C07'] } },
          'TLIST(M1)': { category: { index: ['202511', '202512'] } },
          C01779V03424: { category: { index: ['-'] } }
        },
        extension: { matrix: 'CPM01', language: { code: 'en' } }
      }
    });
    expect(table.rows).toHaveLength(2);
  });

  it('leaves out a variable selected with "all"', async () => {
    const { client, fetchMock } = setup();

    await client.query('en', 'CPM01', [
      { code: 'C01779V03424', selection: { filter: 'all', values: [] } }
    ]);

    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(body.params.id).toEqual([]);
  });

  it.each([
    [
      'metadata 404',
      () => setup(dataset, 404).client.getMetadata('en', 'NOPE99')
    ],
    [
      'an empty JSON-RPC result',
      () => setup(null).client.query('en', 'CPM01', [])
    ]
  ])('reports a missing table for %s', async (_case, run) => {
    await expect(run()).rejects.toMatchObject({ status: 404 });
  });

  it('does not cache a refused query', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('ReadMetadata')
        ? new Response(JSON.stringify(metadata))
        : Response.json({ jsonrpc: '2.0', error: { message: 'busy' }, id: 1 })
    );
    const client = createPxstatClient({ baseUrl: ROOT, fetch: fetchMock });

    await expect(client.query('en', 'CPM01', [])).rejects.toThrow('busy');
    await expect(client.query('en', 'CPM01', [])).rejects.toThrow('busy');

    const rpcCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('api.jsonrpc')
    );
    expect(rpcCalls).toHaveLength(2);
  });

  it.each([['0'], ['-3'], ['abc']])(
    'asks for at least the latest period when the count is %s',
    async (count) => {
      const { client, fetchMock } = setup();

      await client.query('en', 'CPM01', [
        { code: 'TLIST(M1)', selection: { filter: 'top', values: [count] } }
      ]);

      const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
      expect(body.params.dimension['TLIST(M1)'].category.index).toEqual([
        '202512'
      ]);
    }
  );

  it('refuses an id that is not a matrix code without a request', async () => {
    const { client, fetchMock } = setup();

    await expect(client.getMetadata('en', '../CPM01')).rejects.toMatchObject({
      status: 400
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searches the table list, and says when there is none', async () => {
    const withList = createPxstatClient({
      baseUrl: ROOT,
      tableList: async () => [{ id: 'CPM01', title: 'Consumer Price Index' }]
    });
    const withoutList = createPxstatClient({ baseUrl: ROOT });

    expect((await withList.search('en', 'consumer prices'))[0]?.tableId).toBe(
      'CPM01'
    );
    await expect(withoutList.search('en', 'prices')).rejects.toMatchObject({
      status: 503
    });
  });
});
