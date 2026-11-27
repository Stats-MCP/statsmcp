import { describe, expect, it, vi } from 'vitest';

import type { Cache } from '@/cache';
import { createCzsoClient } from '@/czso-client';
import fixture from '@/fixtures/czso.json';
import type { PxwebSelection } from '@/pxweb-client';

const ROOT = 'https://czso.example/api';
const DATA_PATH = 'dotaz/v1/data/sady/ZAM01/vlastni';
const responses = new Map<string, unknown>(Object.entries(fixture));

function setup(overrides: Record<string, Response> = {}, cache?: Cache) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/api/', '');
    const key = path === DATA_PATH ? 'data' : `${path}${url.search}`;
    const override = overrides[key];
    if (override) return override.clone();
    const body = responses.get(key);
    return body === undefined
      ? new Response('', { status: 404 })
      : Response.json(body);
  });
  const client = createCzsoClient({
    baseUrl: ROOT,
    fetch: fetchMock,
    now: () => new Date('2026-11-27T00:00:00Z'),
    ...(cache && { cache })
  });
  const dataQuery = () => {
    const url = String(
      fetchMock.mock.calls
        .map(([input]) => String(input))
        .findLast((input) => input.includes(DATA_PATH))
    );
    return url.slice(url.indexOf('?') + 1);
  };
  const definitionCalls = () =>
    fetchMock.mock.calls.filter(([input]) => !String(input).includes(DATA_PATH))
      .length;
  return { client, fetchMock, dataQuery, definitionCalls };
}

const TIME_VALUES = [
  '1993-Q1',
  '2024',
  '2025-Q4',
  '2025',
  '2026-Q1',
  '2026-Q2'
];

describe('createCzsoClient', () => {
  it('exposes the indicators and one variant per dimension type, with periods that have data', async () => {
    const { client } = setup();

    const table = await client.getMetadata('en', 'ZAM01');

    expect(table).toEqual({
      title: 'Employment and unemployment',
      variables: [
        {
          code: 'IndicatorType',
          label: 'Indicator',
          values: ['6284', '6290'],
          valueLabels: [
            'Unemployed (thousand persons)',
            'General unemployment rate (%)'
          ],
          eliminable: false,
          isTime: false
        },
        {
          code: 'POHL1',
          label: 'Sex',
          values: ['0', '2', '1'],
          valueLabels: ['Total', 'Female', 'Male'],
          eliminable: true,
          isTime: false
        },
        expect.objectContaining({
          code: 'Uz02h',
          values: ['CZ', 'CZ010', 'CZ020'],
          eliminable: true
        }),
        {
          code: 'CASRQX',
          label: 'Time Periods',
          values: TIME_VALUES,
          valueLabels: [
            '1993, quarter 1',
            '2024',
            '2025, quarter 4',
            '2025',
            '2026, quarter 1',
            '2026, quarter 2'
          ],
          eliminable: false,
          isTime: true
        }
      ]
    });
  });

  it('returns labelled rows from one custom selection and leaves out dimensions with a total', async () => {
    const { client, dataQuery, fetchMock } = setup();

    const table = await client.query('en', 'ZAM01', [
      {
        code: 'IndicatorType',
        selection: { filter: 'item', values: ['6290', '6284'] }
      },
      { code: 'POHL1', selection: { filter: 'item', values: ['0', '1'] } },
      { code: 'CASRQX', selection: { filter: 'top', values: ['1'] } }
    ]);

    expect(dataQuery()).toBe(
      'format=JSON_STAT&IndicatorType=6290,6284&POHL1=0,1&CASRQX=2025,2026-Q2'
    );
    expect(
      new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers).get(
        'accept-language'
      )
    ).toBe('en');
    expect(table.label).toBe('Employment and unemployment');
    expect(table.columns).toEqual([
      'Territory',
      'Indicator',
      'Sex',
      'Time Periods',
      'Value'
    ]);
    expect(table.rows.slice(0, 3)).toEqual([
      [
        'Czechia',
        'Unemployed (thousand persons)',
        'Total',
        '2025',
        150.50752648
      ],
      [
        'Czechia',
        'Unemployed (thousand persons)',
        'Total',
        '2026, quarter 2',
        163.13169265
      ],
      ['Czechia', 'Unemployed (thousand persons)', 'Male', '2025', 72.508189886]
    ]);
  });

  it.each<[string, PxwebSelection[], string]>([
    [
      'the newest periods of each level',
      [{ code: 'CASRQX', selection: { filter: 'top', values: ['2'] } }],
      'format=JSON_STAT&IndicatorType=*&CASRQX=2024,2025,2026-Q1,2026-Q2'
    ],
    [
      'every value of a dimension without a total',
      [],
      `format=JSON_STAT&IndicatorType=*&CASRQX=*`
    ],
    [
      'the chosen values of a dimension with a total',
      [{ code: 'Uz02h', selection: { filter: 'item', values: ['CZ010'] } }],
      'format=JSON_STAT&IndicatorType=*&Uz02h=CZ010&CASRQX=*'
    ]
  ])('selects %s', async (_case, selections, query) => {
    const { client, dataQuery } = setup();

    await client.query('en', 'ZAM01', selections);

    expect(dataQuery()).toBe(query);
  });

  it('trims the labels that DataStat pads with spaces', async () => {
    const padded = structuredClone(fixture.data);
    padded.label = ' Employment ';
    padded.dimension.IndicatorType.label = ' Indicator ';
    padded.dimension.IndicatorType.category.label['6284'] = ' Unemployed ';
    const { client } = setup({ data: Response.json(padded) });

    const table = await client.query('en', 'ZAM01', [
      { code: 'IndicatorType', selection: { filter: 'item', values: ['6284'] } }
    ]);

    expect(table.columns).toContain('Indicator');
    expect(table.rows[0]).toContain('Unemployed');
  });

  it('loads a dataset once for metadata and a query', async () => {
    const noCache: Cache = {
      get: async () => undefined,
      set: async () => undefined
    };
    const { client, definitionCalls } = setup({}, noCache);

    await client.getMetadata('en', 'ZAM01');
    const firstLoad = definitionCalls();
    await client.query('en', 'ZAM01', []);
    await client.getMetadata('en', 'ZAM01');

    expect(definitionCalls()).toBe(firstLoad);
  });

  it('refuses a selection above the cell limit before it asks for data', async () => {
    const { fetchMock } = setup();
    const limited = createCzsoClient({
      baseUrl: ROOT,
      fetch: fetchMock,
      maxCells: 11
    });

    await expect(
      limited.query('en', 'ZAM01', [
        { code: 'POHL1', selection: { filter: 'all', values: ['*'] } },
        { code: 'CASRQX', selection: { filter: 'top', values: ['1'] } }
      ])
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('12 cells')
    });
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes(DATA_PATH))
    ).toBe(false);
  });

  it.each([
    ['an unknown dataset', 'NOPE1', {}, 404, 'search_tables'],
    [
      'a refused selection',
      'ZAM01',
      { data: Response.json({ error: 'Chybný požadavek' }, { status: 400 }) },
      400,
      'DataStat refused this selection'
    ],
    [
      'a dataset whose data is gone',
      'ZAM01',
      { data: new Response('', { status: 404 }) },
      404,
      'search_tables'
    ],
    [
      'a server error',
      'ZAM01',
      { data: new Response('error', { status: 500 }) },
      502,
      'DataStat could not answer'
    ]
  ])('reports %s', async (_case, tableId, overrides, status, message) => {
    const { client } = setup(overrides);

    await expect(
      client.query('en', tableId, [
        { code: 'CASRQX', selection: { filter: 'top', values: ['1'] } }
      ])
    ).rejects.toMatchObject({
      status,
      message: expect.stringContaining(message)
    });
  });

  it('lists the datasets with the update date of their current version', async () => {
    const { client } = setup();

    expect(await client.listTables('en')).toEqual([
      { id: 'CEN0101H', title: 'Inflation rate', updated: '2026-11-25' },
      {
        id: 'ZAM01',
        title: 'Employment and unemployment',
        updated: '2026-09-26',
        lastPeriod: '2026'
      }
    ]);
    expect((await client.search('en', 'unemployment'))[0]?.tableId).toBe(
      'ZAM01'
    );
  });
});
