import { describe, expect, it, vi } from 'vitest';

import { createSingstatClient } from '@/singstat-client';

const BASE_URL = 'https://singstat.example/api/table';

const metadata = {
  Data: {
    records: {
      title: 'Consumer Price Index (CPI), Monthly',
      row: [
        { seriesNo: '1', rowText: 'All Items', uoM: 'Index' },
        { seriesNo: '1.0', rowText: 'Food', uoM: 'Index' }
      ]
    }
  }
};

const firstSeries = {
  Data: {
    row: [
      {
        seriesNo: '1',
        rowText: 'All Items',
        uoM: 'Index',
        columns: [
          { key: '2026 Jul', value: '102.696' },
          { key: '2026 Aug', value: '103.334' },
          { key: '2026 Sep', value: '103.551' }
        ]
      }
    ]
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function router(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/resourceid')) {
      return json({
        Data: {
          records: [
            {
              id: 'M650681',
              title: 'Car Population By CC Rating',
              tableType: 'time series'
            },
            {
              id: 'M810001',
              title: 'Indicators On Population, Annual',
              tableType: 'time series'
            },
            {
              id: 'M999999',
              title: 'Population census tables',
              tableType: 'cross sectional'
            },
            {
              id: 'M213751',
              title: 'Consumer Price Index',
              tableType: 'time series'
            }
          ]
        }
      });
    }
    if (url.pathname.endsWith('/metadata/M213751')) return json(metadata);
    if (url.pathname.endsWith('/tabledata/M213751')) {
      if (url.searchParams.get('timeFilter')) {
        return json({
          Data: {
            row: [
              {
                seriesNo: '1',
                rowText: 'All Items',
                uoM: 'Index',
                columns: [
                  { key: '2026 Aug', value: '103.334' },
                  { key: '2026 Sep', value: 'na' }
                ]
              }
            ]
          }
        });
      }
      return json(firstSeries);
    }
    return json({ Data: null, StatusCode: 404, Message: 'Not found' }, 404);
  });
}

describe('createSingstatClient', () => {
  it('keeps time series only and puts titles with the query words first', async () => {
    const client = createSingstatClient({ baseUrl: BASE_URL, fetch: router() });

    const hits = await client.search('en', 'population indicators');

    expect(hits.map((hit) => hit.tableId)).toEqual([
      'M810001',
      'M650681',
      'M213751'
    ]);
  });

  it('shows series and the periods of the first series as two variables', async () => {
    const client = createSingstatClient({ baseUrl: BASE_URL, fetch: router() });

    const result = await client.getMetadata('en', 'M213751');

    expect(
      result.variables.map((variable) => [
        variable.code,
        variable.values,
        variable.valueLabels
      ])
    ).toEqual([
      ['series', ['1', '1.0'], ['All Items (Index)', 'Food (Index)']],
      [
        'time',
        ['2026 Jul', '2026 Aug', '2026 Sep'],
        ['2026 Jul', '2026 Aug', '2026 Sep']
      ]
    ]);
  });

  it('filters series and the latest periods and reads missing values as empty', async () => {
    const fetchMock = router();
    const client = createSingstatClient({
      baseUrl: BASE_URL,
      fetch: fetchMock
    });

    const table = await client.query('en', 'M213751', [
      { code: 'series', selection: { filter: 'item', values: ['1'] } },
      { code: 'time', selection: { filter: 'top', values: ['2'] } }
    ]);

    const dataUrl = new URL(
      String(
        fetchMock.mock.calls
          .map(([input]) => String(input))
          .find((url) => url.includes('timeFilter'))
      )
    );
    expect(dataUrl.searchParams.get('seriesNoORrowNo')).toBe('1');
    expect(dataUrl.searchParams.get('timeFilter')).toBe('2026 Aug,2026 Sep');
    expect(table.rows).toEqual([
      ['All Items', 'Index', '2026 Aug', 103.334],
      ['All Items', 'Index', '2026 Sep', null]
    ]);
  });

  it.each([
    [
      'an error status inside a 200 response',
      json({ StatusCode: 500, Message: 'Internal error', Data: null }),
      500
    ],
    ['a body that is not JSON', new Response('<html>down</html>'), 502]
  ])(
    'keeps %s as an upstream error, not as not found',
    async (_case, response, status) => {
      const client = createSingstatClient({
        baseUrl: BASE_URL,
        fetch: async () => response.clone()
      });

      await expect(client.getMetadata('en', 'M213751')).rejects.toMatchObject({
        status
      });
    }
  );

  it('leaves the period filter out when every period is selected', async () => {
    const fetchMock = router();
    const client = createSingstatClient({
      baseUrl: BASE_URL,
      fetch: fetchMock
    });

    await client.query('en', 'M213751', [
      { code: 'series', selection: { filter: 'item', values: ['1'] } },
      { code: 'time', selection: { filter: 'top', values: ['3'] } }
    ]);

    const dataUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/tabledata/'));
    expect(dataUrls.every((url) => !url.includes('timeFilter'))).toBe(true);
  });

  it('reports an unknown table as not found', async () => {
    const client = createSingstatClient({ baseUrl: BASE_URL, fetch: router() });

    await expect(client.getMetadata('en', 'M000000')).rejects.toMatchObject({
      status: 404
    });
  });

  it.each(['../x', 'M21 3751', 'M2137/51'])(
    'rejects the id %s without a request',
    async (tableId) => {
      const fetchMock = vi.fn<typeof fetch>();
      const client = createSingstatClient({
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
