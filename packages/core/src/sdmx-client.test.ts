import { describe, expect, it, vi } from 'vitest';

import { createSdmxClient } from '@/sdmx-client';

const BASE_URL = 'https://sdmx.example/rest';

const codelist = (id: string) =>
  `urn:sdmx:org.sdmx.infomodel.codelist.Codelist=ABS:${id}(1.0.0)`;

function structure(version = '2.0.0') {
  return {
    data: {
      dataflows: [{ id: 'CPI', version, name: 'Consumer Price Index (CPI)' }],
      dataStructures: [
        {
          dataStructureComponents: {
            dimensionList: {
              dimensions: [
                {
                  id: 'REGION',
                  position: 0,
                  localRepresentation: { enumeration: codelist('CL_REGION') }
                },
                {
                  id: 'FREQ',
                  position: 1,
                  localRepresentation: { enumeration: codelist('CL_FREQ') }
                }
              ],
              timeDimensions: [{ id: 'TIME_PERIOD' }]
            }
          }
        }
      ],
      codelists: [
        {
          id: 'CL_REGION',
          codes: [
            { id: '50', name: 'Australia' },
            { id: '1', name: 'Sydney' }
          ]
        },
        { id: 'CL_FREQ', codes: [{ id: 'Q', name: 'Quarterly' }] }
      ]
    }
  };
}

const availability = {
  data: {
    contentConstraints: [
      {
        cubeRegions: [
          {
            keyValues: [
              { id: 'REGION', values: ['50', '1'] },
              { id: 'FREQ', values: ['Q'] },
              {
                id: 'TIME_PERIOD',
                timeRange: {
                  startPeriod: { period: '2026-01-01T00:00:00' },
                  endPeriod: { period: '2026-09-30T00:00:00' }
                }
              }
            ]
          }
        ]
      }
    ]
  }
};

const dataMessage = {
  data: {
    structure: {
      dimensions: {
        series: [
          {
            id: 'REGION',
            keyPosition: 0,
            values: [{ id: '50', name: 'Australia' }]
          },
          {
            id: 'FREQ',
            keyPosition: 1,
            values: [{ id: 'Q', name: 'Quarterly' }]
          }
        ],
        observation: [
          {
            id: 'TIME_PERIOD',
            values: [
              { id: '2026-Q3', name: '2026-Q3' },
              { id: '2026-Q2', name: '2026-Q2' }
            ]
          }
        ]
      }
    },
    dataSets: [
      { series: { '0:0': { observations: { '0': [103.64], '1': [102.31] } } } }
    ]
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

type Routes = Record<string, () => Response>;

/** Routes by the URL path after the base URL; unknown paths answer 404. */
function routedFetch(routes: Routes): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/rest/', '');
    return routes[path]?.() ?? new Response('Not found', { status: 404 });
  });
}

const tableRoutes: Routes = {
  'dataflow/ABS/CPI/latest': () => json(structure()),
  'availableconstraint/ABS,CPI,2.0.0/all/all/all': () => json(availability),
  'data/ABS,CPI,2.0.0/50.Q': () => json(dataMessage)
};

function client(fetchMock: typeof fetch) {
  return createSdmxClient({
    baseUrl: BASE_URL,
    agency: 'ABS',
    fetch: fetchMock
  });
}

function dataUrl(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
): URL | undefined {
  const call = fetchMock.mock.calls.find(([input]) =>
    String(input).includes('/data/')
  );
  return call ? new URL(String(call[0])) : undefined;
}

describe('createSdmxClient', () => {
  it('lists dataflows and sends the SDMX structure Accept header', async () => {
    const fetchMock = routedFetch({
      'dataflow/ABS': () =>
        json({
          data: {
            dataflows: [
              {
                id: 'CPI',
                version: '2.0.0',
                agencyID: 'ABS',
                names: { en: 'Consumer Price Index (CPI)' }
              }
            ]
          }
        })
    });

    const docs = await client(fetchMock).listTables?.('en');

    expect(docs).toEqual([{ id: 'CPI', title: 'Consumer Price Index (CPI)' }]);
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('accept')
    ).toBe('application/vnd.sdmx.structure+json;version=1.0');
  });

  it('reads metadata from the structure and the availability of its version', async () => {
    const fetchMock = routedFetch(tableRoutes);

    const metadata = await client(fetchMock).getMetadata('en', 'CPI');

    expect(metadata.variables.map((variable) => variable.values)).toEqual([
      ['50', '1'],
      ['Q'],
      ['2026-Q1', '2026-Q2', '2026-Q3']
    ]);
  });

  it('shows every code when the availability call fails', async () => {
    const metadata = await client(
      routedFetch({ 'dataflow/ABS/CPI/latest': () => json(structure()) })
    ).getMetadata('en', 'CPI');

    expect(metadata.variables[0]?.values).toEqual(['50', '1']);
  });

  it('builds the key in dimension order and asks the latest periods per series', async () => {
    const fetchMock = routedFetch(tableRoutes);

    const table = await client(fetchMock).query('en', 'CPI', [
      { code: 'FREQ', selection: { filter: 'item', values: ['Q'] } },
      { code: 'REGION', selection: { filter: 'item', values: ['50'] } },
      { code: 'TIME_PERIOD', selection: { filter: 'top', values: ['2'] } }
    ]);

    expect(dataUrl(fetchMock)?.pathname).toBe('/rest/data/ABS,CPI,2.0.0/50.Q');
    expect(dataUrl(fetchMock)?.searchParams.get('lastNObservations')).toBe('2');
    expect(table.rows).toEqual([
      ['Australia', 'Quarterly', '2026-Q2', 102.31],
      ['Australia', 'Quarterly', '2026-Q3', 103.64]
    ]);
  });

  it('asks a period range for chosen periods and keeps only those', async () => {
    const fetchMock = routedFetch(tableRoutes);

    const table = await client(fetchMock).query('en', 'CPI', [
      { code: 'REGION', selection: { filter: 'item', values: ['50'] } },
      { code: 'FREQ', selection: { filter: 'item', values: ['Q'] } },
      {
        code: 'TIME_PERIOD',
        selection: { filter: 'item', values: ['2026-Q3', '2026-Q1'] }
      }
    ]);

    const params = dataUrl(fetchMock)?.searchParams;
    expect([params?.get('startPeriod'), params?.get('endPeriod')]).toEqual([
      '2026-Q1',
      '2026-Q3'
    ]);
    expect(table.rows.map((row) => row[2])).toEqual(['2026-Q3']);
  });

  it('clamps latest 0 to one observation and leaves unselected dimensions open', async () => {
    const fetchMock = routedFetch({
      ...tableRoutes,
      'data/ABS,CPI,2.0.0/.Q': () => json(dataMessage)
    });

    await client(fetchMock).query('en', 'CPI', [
      { code: 'FREQ', selection: { filter: 'item', values: ['Q'] } },
      { code: 'TIME_PERIOD', selection: { filter: 'top', values: ['0'] } }
    ]);

    expect(dataUrl(fetchMock)?.pathname).toBe('/rest/data/ABS,CPI,2.0.0/.Q');
    expect(dataUrl(fetchMock)?.searchParams.get('lastNObservations')).toBe('1');
  });

  it('builds data URLs from the live structure version', async () => {
    const fetchMock = routedFetch({
      'dataflow/ABS/CPI/latest': () => json(structure('2.1.0')),
      'data/ABS,CPI,2.1.0/50.Q': () => json(dataMessage)
    });

    await client(fetchMock).query('en', 'CPI', [
      { code: 'REGION', selection: { filter: 'item', values: ['50'] } },
      { code: 'FREQ', selection: { filter: 'item', values: ['Q'] } }
    ]);

    expect(dataUrl(fetchMock)?.pathname).toBe('/rest/data/ABS,CPI,2.1.0/50.Q');
  });

  it('gives an empty table with a note when no observation matches', async () => {
    const fetchMock = routedFetch({
      ...tableRoutes,
      'data/ABS,CPI,2.0.0/1.Q': () =>
        new Response('NoResultsFound', { status: 404 })
    });

    const table = await client(fetchMock).query('en', 'CPI', [
      { code: 'REGION', selection: { filter: 'item', values: ['1'] } },
      { code: 'FREQ', selection: { filter: 'item', values: ['Q'] } }
    ]);

    expect(table.rows).toEqual([]);
    expect(table.columns).toEqual(['REGION', 'FREQ', 'Time period', 'Value']);
    expect(table.label).toContain('use latest');
  });

  it.each([
    ['REGION', ['99']],
    ['TIME_PERIOD', ['2025-Q1']]
  ])(
    'rejects unknown %s values without a data request',
    async (code, values) => {
      const fetchMock = routedFetch(tableRoutes);

      await expect(
        client(fetchMock).query('en', 'CPI', [
          { code, selection: { filter: 'item', values } }
        ])
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining(values[0] ?? '')
      });
      expect(dataUrl(fetchMock)).toBeUndefined();
    }
  );

  it('tries the upper-case id once before it reports a table as not found', async () => {
    const fetchMock = routedFetch(tableRoutes);

    const metadata = await client(fetchMock).getMetadata('en', 'cpi');
    const missing = client(fetchMock).getMetadata('en', 'nope');

    expect(metadata.title).toBe('Consumer Price Index (CPI)');
    await expect(missing).rejects.toMatchObject({ status: 404 });
  });

  it('explains a busy service', async () => {
    const fetchMock = routedFetch({
      'dataflow/ABS/CPI/latest': () =>
        new Response('slow down', { status: 429 })
    });

    await expect(
      client(fetchMock).getMetadata('en', 'CPI')
    ).rejects.toMatchObject({
      status: 429,
      message: 'ABS is busy. Try again in a minute.'
    });
  });

  it('sends the data Accept header and asks all series when nothing is selected', async () => {
    const fetchMock = routedFetch({
      ...tableRoutes,
      'data/ABS,CPI,2.0.0/all': () => json(dataMessage)
    });

    await client(fetchMock).query('en', 'CPI', []);

    const call = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('/data/')
    );
    expect(new URL(String(call?.[0])).pathname).toBe(
      '/rest/data/ABS,CPI,2.0.0/all'
    );
    expect(new Headers(call?.[1]?.headers).get('accept')).toBe(
      'application/vnd.sdmx.data+json;version=1.0'
    );
  });

  it('notes an empty result when the chosen period has no data', async () => {
    const table = await client(routedFetch(tableRoutes)).query('en', 'CPI', [
      { code: 'REGION', selection: { filter: 'item', values: ['50'] } },
      { code: 'FREQ', selection: { filter: 'item', values: ['Q'] } },
      {
        code: 'TIME_PERIOD',
        selection: { filter: 'item', values: ['2026-Q1'] }
      }
    ]);

    expect(table.rows).toEqual([]);
    expect(table.label).toContain('use latest');
  });

  it('refuses a query whose URL would be too long, without a data request', async () => {
    const many = Array.from({ length: 900 }, (_, index) => `C${index}`);
    const big = structure();
    big.data.codelists[0] = {
      id: 'CL_REGION',
      codes: many.map((id) => ({ id, name: id }))
    };
    const fetchMock = routedFetch({
      'dataflow/ABS/CPI/latest': () => json(big)
    });

    await expect(
      client(fetchMock).query('en', 'CPI', [
        { code: 'REGION', selection: { filter: 'item', values: many } }
      ])
    ).rejects.toMatchObject({ status: 400 });
    expect(dataUrl(fetchMock)).toBeUndefined();
  });

  it('names the table when the data call fails', async () => {
    const fetchMock = routedFetch({
      ...tableRoutes,
      'data/ABS,CPI,2.0.0/50.Q': () => new Response('boom', { status: 500 })
    });

    await expect(
      client(fetchMock).query('en', 'CPI', [
        { code: 'REGION', selection: { filter: 'item', values: ['50'] } },
        { code: 'FREQ', selection: { filter: 'item', values: ['Q'] } }
      ])
    ).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining('Table "CPI"')
    });
  });

  it.each(['../x', 'CPI/1', "CPI'", 'a b'])(
    'rejects the table id %s without a request',
    async (tableId) => {
      const fetchMock = vi.fn<typeof fetch>();

      await expect(
        client(fetchMock).getMetadata('en', tableId)
      ).rejects.toMatchObject({
        status: 400
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});
