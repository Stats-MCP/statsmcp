import { describe, expect, it, vi } from 'vitest';

import { createStatcanClient, periodOf, periodsOf } from '@/statcan-client';

const BASE_URL = 'https://statcan.example/wds/rest';

const cubeList = [
  {
    productId: '18100004',
    cubeTitleEn: 'Consumer Price Index, monthly',
    cubeTitleFr: 'Indice des prix à la consommation mensuel',
    cubeStartDate: '2026-06-01T04:00:00Z',
    cubeEndDate: '2026-09-01T04:00:00Z',
    releaseTime: '2026-10-21T12:30:00Z',
    archived: '2',
    frequencyCode: 6
  },
  {
    productId: '18100001',
    cubeTitleEn: 'Consumer Price Index, old base',
    cubeTitleFr: 'Indice des prix, ancienne base',
    cubeStartDate: '1914-01-01',
    cubeEndDate: '1990-01-01',
    releaseTime: '2012-01-01T12:30:00Z',
    archived: '1',
    frequencyCode: 6
  }
];

const cubeMetadata = [
  {
    status: 'SUCCESS',
    object: {
      cubeTitleEn: 'Consumer Price Index, monthly',
      cubeTitleFr: 'Indice des prix à la consommation mensuel',
      dimension: [
        {
          dimensionPositionId: 2,
          dimensionNameEn: 'Products',
          dimensionNameFr: 'Produits',
          member: [
            { memberId: 2, memberNameEn: 'All-items', memberNameFr: 'Ensemble' }
          ]
        },
        {
          dimensionPositionId: 1,
          dimensionNameEn: 'Geography',
          dimensionNameFr: 'Géographie',
          member: [
            { memberId: 2, memberNameEn: 'Canada', memberNameFr: 'Canada' },
            { memberId: 3, memberNameEn: 'Ontario', memberNameFr: 'Ontario' }
          ]
        }
      ]
    }
  }
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function router(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/getAllCubesListLite')) return json(cubeList);
    if (url.endsWith('/getCubeMetadata')) return json(cubeMetadata);
    if (url.endsWith('/getDataFromCubePidCoordAndLatestNPeriods')) {
      const body = JSON.parse(String(init?.body)) as {
        coordinate: string;
        latestN: number;
      }[];
      return json(
        body.map(({ coordinate, latestN }) =>
          coordinate.startsWith('3.')
            ? { status: 'FAILED', object: 'Invalid coordinate' }
            : {
                status: 'SUCCESS',
                object: {
                  coordinate,
                  vectorDataPoint: [
                    '2026-06-01',
                    '2026-07-01',
                    '2026-08-01',
                    '2026-09-01'
                  ]
                    .slice(-latestN)
                    .map((refPer, index) => ({ refPer, value: 169 + index }))
                }
              }
        )
      );
    }
    return json({}, 404);
  });
}

describe('periods', () => {
  it.each([
    ['2026-09-01', '6', '2026-09'],
    ['2026-07-01', '9', '2026-Q3'],
    ['2026-07-01', '11', '2026-S2'],
    ['2026-01-01', '12', '2026'],
    ['2026-03-04', '18', '2026-03-04']
  ])('writes %s with frequency %s as %s', (refPer, frequency, expected) => {
    expect(periodOf(refPer, frequency)).toBe(expected);
  });

  it.each([
    ['2025-10-01', '2026-04-01', '9', ['2025-Q4', '2026-Q1', '2026-Q2']],
    ['2024-01-01', '2026-01-01', '12', ['2024', '2025', '2026']],
    ['2020-01-01', '2026-03-04', '18', ['2026-03-04']]
  ])(
    'lists periods from %s to %s for frequency %s',
    (start, end, frequency, expected) => {
      expect(periodsOf(start, end, frequency)).toEqual(expected);
    }
  );
});

describe('createStatcanClient', () => {
  it('searches the cube list in the asked language and hides archived cubes unless asked', async () => {
    const client = createStatcanClient({
      baseUrl: BASE_URL,
      fetch: router(),
      now: () => new Date('2026-11-01')
    });

    const current = await client.search('fr', 'indice des prix');
    const hits = await client.search('fr', 'indice des prix', {
      includeArchived: true
    });

    expect(current.map((hit) => hit.tableId)).toEqual(['18100004']);

    expect(
      hits.map((hit) => [hit.tableId, hit.title, hit.archived ?? false])
    ).toEqual([
      ['18100004', 'Indice des prix à la consommation mensuel', false],
      ['18100001', 'Indice des prix, ancienne base', true]
    ]);
  });

  it('lists dimensions by position and adds a time variable from the cube dates', async () => {
    const client = createStatcanClient({ baseUrl: BASE_URL, fetch: router() });

    const metadata = await client.getMetadata('en', '18100004');

    expect(
      metadata.variables.map((variable) => [
        variable.code,
        variable.label,
        variable.values
      ])
    ).toEqual([
      ['1', 'Geography', ['2', '3']],
      ['2', 'Products', ['2']],
      ['time', 'Reference period', ['2026-06', '2026-07', '2026-08', '2026-09']]
    ]);
  });

  it('sends one coordinate per combination, asks for enough periods and keeps the asked ones', async () => {
    const fetchMock = router();
    const client = createStatcanClient({ baseUrl: BASE_URL, fetch: fetchMock });

    const table = await client.query('en', '18100004', [
      { code: '1', selection: { filter: 'item', values: ['2', '3'] } },
      { code: '2', selection: { filter: 'item', values: ['2'] } },
      {
        code: 'time',
        selection: { filter: 'item', values: ['2026-07', '2026-09'] }
      }
    ]);

    const dataCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith('LatestNPeriods')
    );
    expect(JSON.parse(String(dataCall?.[1]?.body))).toEqual([
      { productId: 18100004, coordinate: '2.2.0.0.0.0.0.0.0.0', latestN: 3 },
      { productId: 18100004, coordinate: '3.2.0.0.0.0.0.0.0.0', latestN: 3 }
    ]);
    expect(table.rows).toEqual([
      ['Canada', 'All-items', '2026-07', 169],
      ['Canada', 'All-items', '2026-09', 171]
    ]);
  });

  it('refuses a query that would read too many data points', async () => {
    const fetchMock = router();
    const client = createStatcanClient({ baseUrl: BASE_URL, fetch: fetchMock });

    await expect(
      client.query('en', '18100004', [
        { code: '1', selection: { filter: 'item', values: ['2'] } },
        { code: 'time', selection: { filter: 'top', values: ['30000'] } }
      ])
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('data points')
    });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('LatestNPeriods')
      )
    ).toBe(false);
  });

  it('refuses a huge member combination before building it', async () => {
    const fetchMock = router();
    const client = createStatcanClient({ baseUrl: BASE_URL, fetch: fetchMock });
    const values = Array.from({ length: 200 }, (_, index) => String(index));

    await expect(
      client.query('en', '18100004', [
        { code: '1', selection: { filter: 'item', values } },
        { code: '2', selection: { filter: 'item', values } },
        { code: 'time', selection: { filter: 'all', values: ['*'] } }
      ])
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Use "latest"')
    });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('LatestNPeriods')
      )
    ).toBe(false);
  });

  it('explains an empty result when no member combination exists', async () => {
    const client = createStatcanClient({ baseUrl: BASE_URL, fetch: router() });

    await expect(
      client.query('en', '18100004', [
        { code: '1', selection: { filter: 'item', values: ['3'] } },
        { code: 'time', selection: { filter: 'top', values: ['1'] } }
      ])
    ).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining(
        '1 of 1 member combinations have no data (Invalid coordinate)'
      )
    });
  });

  it('keeps the latest row of an occasional cube when its period is asked by name', async () => {
    const occasional = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).endsWith('/getAllCubesListLite')) {
        return json([
          {
            ...cubeList[0],
            frequencyCode: 18,
            cubeEndDate: '2026-12-31T05:00:00Z'
          }
        ]);
      }
      return router()(input, init);
    });
    const client = createStatcanClient({
      baseUrl: BASE_URL,
      fetch: occasional
    });

    const table = await client.query('en', '18100004', [
      { code: '1', selection: { filter: 'item', values: ['2'] } },
      { code: 'time', selection: { filter: 'item', values: ['2026-12-31'] } }
    ]);

    expect(table.rows).toEqual([['Canada', 'All-items', '2026-09-01', 169]]);
  });

  it('marks the periods as incomplete for an occasional cube', async () => {
    const client = createStatcanClient({
      baseUrl: BASE_URL,
      fetch: vi.fn<typeof fetch>(async (input, init) => {
        if (String(input).endsWith('/getAllCubesListLite')) {
          return json([{ ...cubeList[0], frequencyCode: 18 }]);
        }
        return router()(input, init);
      })
    });

    const metadata = await client.getMetadata('en', '18100004');

    expect(metadata.variables.at(-1)?.periodsIncomplete).toBe(true);
  });

  it('rejects a period that the cube does not have', async () => {
    const client = createStatcanClient({ baseUrl: BASE_URL, fetch: router() });

    await expect(
      client.query('en', '18100004', [
        { code: 'time', selection: { filter: 'item', values: ['1999-01'] } }
      ])
    ).rejects.toMatchObject({ status: 400 });
  });

  it('reports a product id that is not in the cube list as not found', async () => {
    const client = createStatcanClient({ baseUrl: BASE_URL, fetch: router() });

    await expect(client.getMetadata('en', '99999999')).rejects.toMatchObject({
      status: 404
    });
  });

  it.each(['1810000', '18100004a', '../x'])(
    'rejects the id %s without a request',
    async (productId) => {
      const fetchMock = vi.fn<typeof fetch>();
      const client = createStatcanClient({
        baseUrl: BASE_URL,
        fetch: fetchMock
      });

      await expect(client.getMetadata('en', productId)).rejects.toMatchObject({
        status: 400
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});
