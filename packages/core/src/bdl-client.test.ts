import { describe, expect, it, vi } from 'vitest';

import { createBdlClient } from '@/bdl-client';
import type { Cache } from '@/cache';
import fixture from '@/fixtures/bdl.json';
import type { PxwebSelection } from '@/pxweb-client';

const ROOT = 'https://bdl.example/api/v1';
const MAZOWIECKIE = '071400000000';
const MALOPOLSKIE = '011200000000';
const NOT_FOUND = Response.json(
  { errors: [{ errorReason: 'The resource with the given ID was not found' }] },
  { status: 404 }
);

function route(url: URL): Response {
  const path = url.pathname.slice(new URL(ROOT).pathname.length + 1);
  if (path === 'subjects/search') {
    return Response.json({ totalRecords: 5, results: fixture.subjects });
  }
  if (path === 'subjects/P3559') return Response.json(fixture.subject);
  if (path === 'variables' && url.searchParams.get('subject-id') === 'P3559') {
    // Above 100 records, so the client also asks for page 1.
    const start = url.searchParams.get('page') === '0' ? 0 : 2;
    return Response.json({
      totalRecords: 101,
      results: fixture.variables.slice(start, start + 2)
    });
  }
  if (path.startsWith('data/by-unit/')) return Response.json(fixture.byUnit);
  if (path.startsWith('data/by-variable/')) {
    return Response.json(fixture.byVariable);
  }
  return NOT_FOUND.clone();
}

function setup(data?: Response, cache?: Cache) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (data && url.pathname.includes('/data/')) return data.clone();
    return route(url);
  });
  const client = createBdlClient({
    baseUrl: ROOT,
    clientId: 'secret-key',
    fetch: fetchMock,
    maxCells: 12,
    ...(cache && { cache })
  });
  const dataUrl = () =>
    fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .findLast((url) => url.pathname.includes('/data/'));
  return { client, fetchMock, dataUrl };
}

const items = (code: string, values: string[]): PxwebSelection => ({
  code,
  selection: { filter: 'item', values }
});
const REGISTERED_RATE = items('n2', ['1']);
const COLUMNS = [
  'Territorial unit',
  'Months',
  'Indicators',
  'Year',
  'Measure unit',
  'Value'
];

describe('createBdlClient', () => {
  it('exposes the n1…n5 labels as dimensions, the territorial units and the years', async () => {
    const { client } = setup();

    const metadata = await client.getMetadata('en', 'P3559');

    expect(metadata.title).toBe(
      'Registered unemployment rate and inflow into unemployment rate (monthly data)'
    );
    expect(
      metadata.variables.map((variable) => [
        variable.code,
        variable.label,
        variable.values.length,
        variable.valueLabels.slice(0, 2),
        variable.isTime
      ])
    ).toEqual([
      ['n1', 'Months', 2, ['January', 'February'], false],
      [
        'n2',
        'Indicators',
        2,
        ['registered unemployment rate', 'Inflow into unemployment rate'],
        false
      ],
      ['unit', 'Territorial unit', 17, ['Poland', 'Dolnośląskie'], false],
      ['year', 'Year', 3, ['2024', '2025'], true]
    ]);
  });

  it('reads the matching series for Poland in one by-unit call, with a missing value as null', async () => {
    const byUnit = structuredClone(fixture.byUnit);
    byUnit.results[1]?.values.splice(1, 1, {
      year: '2026',
      val: 0,
      attrId: 4
    });
    const { client, fetchMock, dataUrl } = setup(Response.json(byUnit));

    const table = await client.query('en', 'P3559', [
      items('n1', ['1', '2']),
      REGISTERED_RATE,
      { code: 'year', selection: { filter: 'top', values: ['2'] } }
    ]);

    expect(dataUrl()?.pathname).toBe('/api/v1/data/by-unit/000000000000');
    expect(dataUrl()?.searchParams.getAll('var-id')).toEqual([
      '461680',
      '461681'
    ]);
    expect(dataUrl()?.searchParams.getAll('year')).toEqual(['2025', '2026']);
    expect(
      new Headers(fetchMock.mock.lastCall?.[1]?.headers).get('x-clientid')
    ).toBe('secret-key');
    const rate = ['Poland', 'registered unemployment rate'];
    expect(table).toEqual({
      label:
        'Registered unemployment rate and inflow into unemployment rate (monthly data)',
      columns: COLUMNS,
      rows: [
        [rate[0], 'January', rate[1], '2025', '%', 5.4],
        [rate[0], 'January', rate[1], '2026', '%', 6],
        [rate[0], 'February', rate[1], '2025', '%', 5.5],
        [rate[0], 'February', rate[1], '2026', '%', null]
      ]
    });
  });

  it('reads one series for several voivodeships in one by-variable call', async () => {
    const { client, dataUrl } = setup();

    const table = await client.query('en', 'P3559', [
      items('n1', ['1']),
      REGISTERED_RATE,
      items('unit', [MAZOWIECKIE, MALOPOLSKIE]),
      items('year', ['2025', '2026'])
    ]);

    expect(dataUrl()?.pathname).toBe('/api/v1/data/by-variable/461680');
    expect(dataUrl()?.searchParams.get('unit-level')).toBe('2');
    expect(table.rows.map((row) => [row[0], row[3], row[5]])).toEqual([
      ['Mazowieckie', '2025', 4.2],
      ['Mazowieckie', '2026', 4.5],
      ['Małopolskie', '2025', 4.4],
      ['Małopolskie', '2026', 5]
    ]);
  });

  it('loads a subject once for metadata and a query', async () => {
    const noCache: Cache = {
      get: async () => undefined,
      set: async () => undefined
    };
    const { client, fetchMock } = setup(undefined, noCache);

    await client.getMetadata('en', 'P3559');
    await client.query('en', 'P3559', [
      items('n1', ['1']),
      REGISTERED_RATE,
      items('year', ['2025'])
    ]);
    await client.getMetadata('en', 'P3559');

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('refuses a selection above the cell limit before it asks for data', async () => {
    const { client, dataUrl } = setup();

    await expect(
      client.query('en', 'P3559', [
        { code: 'unit', selection: { filter: 'all', values: ['*'] } },
        items('year', ['2025'])
      ])
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('68 cells')
    });
    expect(dataUrl()).toBeUndefined();
  });

  it.each([
    ['an unknown subject', 'P9999', undefined, 404, 'search_tables'],
    [
      'a refused selection',
      'P3559',
      Response.json(
        { errors: [{ errorReason: "Parameter 'year' is beyond the scope" }] },
        { status: 412 }
      ),
      400,
      "refused this selection: Parameter 'year' is beyond the scope"
    ],
    [
      'the request limit',
      'P3559',
      new Response('{}', { status: 429 }),
      503,
      'request limit'
    ],
    [
      'a server error',
      'P3559',
      new Response('error', { status: 500 }),
      502,
      'could not answer'
    ],
    [
      'a refused API key',
      'P3559',
      new Response('{}', { status: 401 }),
      502,
      'BDL_CLIENT_ID'
    ]
  ])('reports %s', async (_case, tableId, data, status, message) => {
    const { client } = setup(data);

    await expect(
      client.query('en', tableId, [REGISTERED_RATE, items('year', ['2025'])])
    ).rejects.toMatchObject({
      status,
      message: expect.stringContaining(message)
    });
  });

  it('refuses a unit code that the table does not have, before it asks for data', async () => {
    const { client, dataUrl } = setup();

    await expect(
      client.query('en', 'P3559', [
        REGISTERED_RATE,
        items('unit', ['../subjects']),
        items('year', ['2025'])
      ])
    ).rejects.toMatchObject({ status: 400 });
    expect(dataUrl()).toBeUndefined();
  });

  it('lists the subjects that hold variables, with their ancestors as path', async () => {
    const { client } = setup();

    expect(await client.listTables('en')).toEqual([
      {
        id: 'P2567',
        title: fixture.subjects[3]?.name,
        path: ['LABOUR MARKET', 'ARCHIVAL DATA'],
        discontinued: true
      },
      {
        id: 'P3559',
        title: fixture.subject.name,
        path: ['LABOUR MARKET', 'REGISTERED UNEMPLOYMENT']
      }
    ]);
  });
});
