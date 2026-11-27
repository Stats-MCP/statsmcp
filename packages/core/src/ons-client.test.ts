import { describe, expect, it, vi } from 'vitest';

import fixture from '@/fixtures/ons.json';
import { createOnsClient, onsTableUrl } from '@/ons-client';
import type { PxwebSelection } from '@/pxweb-client';

const responses = new Map<string, unknown>(Object.entries(fixture));

function setup(overrides: Record<string, Response> = {}, maxCells?: number) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const key =
      url.hostname === 'www.ons.gov.uk'
        ? `data ${url.pathname.replace(/\/data$/, '')}`
        : `search ${url.searchParams.get('q')}`;
    const override = overrides[key];
    if (override) return override.clone();
    const body = responses.get(key);
    if (body !== undefined) return Response.json(body);
    if (key.startsWith('search')) return Response.json({ count: 0, items: [] });
    return new Response('<html>404</html>', { status: 404 });
  });
  const client = createOnsClient({
    baseUrl: 'https://api.beta.ons.gov.uk/v1/',
    fetch: fetchMock,
    now: () => new Date('2026-11-27T00:00:00Z'),
    ...(maxCells !== undefined && { maxCells })
  });
  return { client, fetchMock };
}

const CPI = 'MM23/D7G7';
const month = (date: string, value: string) => ({
  date,
  value,
  label: date,
  year: '2026',
  month: '',
  quarter: ''
});

describe('createOnsClient', () => {
  it('searches time series and ranks old releases lower', async () => {
    const { client, fetchMock } = setup();

    const hits = await client.search('en', 'ABMI');

    expect(hits.map((hit) => hit.tableId)).toEqual([
      'UKEA/ABMI',
      'BB/ABMI',
      'PN2/ABMI',
      'QNA/ABMI',
      'PGDP/ABMI'
    ]);
    expect(hits[0]).toEqual({
      tableId: 'UKEA/ABMI',
      title:
        'Gross Domestic Product: chained volume measures: Seasonally adjusted £m (dataset UKEA)',
      published: '2026-09-30'
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get('content_type')).toBe('timeseries');
  });

  it('maps a series to frequency and period variables', async () => {
    const { client } = setup();

    const table = await client.getMetadata('en', CPI);

    expect(table).toEqual({
      title:
        'CPI ANNUAL RATE 00: ALL ITEMS 2015=100 (dataset MM23; unit: %; last update: 2026-11-18; next release: 16 December 2026)',
      variables: [
        {
          code: 'frequency',
          label: 'Frequency',
          values: ['A', 'Q', 'M'],
          valueLabels: ['Annual', 'Quarterly', 'Monthly'],
          eliminable: false,
          isTime: false
        },
        {
          code: 'period',
          label: 'Period',
          values: [
            '2024',
            '2025',
            '2026-Q2',
            '2026-Q3',
            '2026-08',
            '2026-09',
            '2026-10'
          ],
          valueLabels: [
            '2024',
            '2025',
            '2026 Q2',
            '2026 Q3',
            '2026 AUG',
            '2026 SEP',
            '2026 OCT'
          ],
          eliminable: false,
          isTime: true
        }
      ]
    });
  });

  it.each([
    ['pop/ukpop', 'dataset POP', ['A']],
    ['PN2/ABMI', 'unit: £m', ['A', 'Q']]
  ])(
    'resolves %s to its own series and lists only its frequencies',
    async (tableId, note, frequencies) => {
      const { client } = setup();

      const table = await client.getMetadata('en', tableId);

      expect(table.title).toContain(note);
      expect(table.variables[0]?.values).toEqual(frequencies);
    }
  );

  it('links the series page once the id is resolved, else an ONS search', async () => {
    const { client } = setup();
    await client.getMetadata('en', CPI);

    expect(onsTableUrl('mm23/d7g7')).toBe(
      'https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23'
    );
    expect(onsTableUrl('LMS/MGSX')).toBe(
      'https://www.ons.gov.uk/search?q=MGSX&filter=time_series'
    );
  });

  it.each<[string, PxwebSelection[], (string | number | null)[][]]>([
    [
      'every period of one frequency',
      [{ code: 'frequency', selection: { filter: 'item', values: ['Q'] } }],
      [
        ['Quarterly', '2026 Q2', 2.8],
        ['Quarterly', '2026 Q3', 3.1]
      ]
    ],
    [
      'the latest period of every frequency',
      [
        { code: 'frequency', selection: { filter: 'all', values: ['*'] } },
        { code: 'period', selection: { filter: 'top', values: ['1'] } }
      ],
      [
        ['Annual', '2025', 3.4],
        ['Quarterly', '2026 Q3', 3.1],
        ['Monthly', '2026 OCT', 3.6]
      ]
    ],
    [
      'chosen periods',
      [
        {
          code: 'period',
          selection: { filter: 'item', values: ['2026-10', '2024'] }
        }
      ],
      [
        ['Annual', '2024', 2.5],
        ['Monthly', '2026 OCT', 3.6]
      ]
    ]
  ])('returns %s as rows', async (_case, selections, rows) => {
    const { client } = setup();

    const table = await client.query('en', CPI, selections);

    expect(table.columns).toEqual(['Frequency', 'Period', 'Value']);
    expect(table.rows).toEqual(rows);
  });

  it('selects a rolling three-month period by its code', async () => {
    const uri =
      '/employmentandlabourmarket/peoplenotinwork/unemployment/timeseries/mgsx/lms';
    const { client } = setup({
      'search MGSX': Response.json({
        count: 1,
        items: [
          {
            type: 'timeseries',
            cdid: 'MGSX',
            dataset_id: 'LMS',
            release_date: '2026-11-17T00:00:00.000Z',
            title: 'Unemployment rate',
            uri
          }
        ]
      }),
      [`data ${uri}`]: Response.json({
        description: {
          title: 'Unemployment rate',
          unit: '%',
          preUnit: '',
          cdid: 'MGSX',
          datasetId: 'LMS',
          releaseDate: '2026-11-17T00:00:00.000Z',
          nextRelease: '15 December 2026',
          date: '2026 JUL-SEP',
          number: '4.6'
        },
        years: [],
        quarters: [],
        months: [month('2026 JUN-AUG', '4.7'), month('2026 JUL-SEP', '4.6')],
        uri
      })
    });

    const metadata = await client.getMetadata('en', 'LMS/MGSX');
    const period = metadata.variables.find(
      (variable) => variable.code === 'period'
    );
    const code = period?.values.at(-1) ?? '';
    const table = await client.query('en', 'LMS/MGSX', [
      { code: 'period', selection: { filter: 'item', values: [code] } }
    ]);

    expect(period?.valueLabels).toEqual(['2026 JUN-AUG', '2026 JUL-SEP']);
    expect(table.rows).toEqual([['Monthly', '2026 JUL-SEP', 4.6]]);
  });

  it('refuses a result above the cell limit', async () => {
    const { client } = setup({}, 6);

    await expect(client.query('en', CPI, [])).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('7 cells')
    });
  });

  it.each([
    ['an unknown series', 'en', 'MM23/ZZZZ', {}, 404],
    ['an id without a dataset', 'en', 'D7G7', {}, 400],
    ['another language', 'cy', CPI, {}, 400],
    [
      'a request that ONS refuses',
      'en',
      CPI,
      { 'search D7G7': new Response('bad', { status: 400 }) },
      400
    ],
    [
      'a server error',
      'en',
      CPI,
      {
        'data /economy/inflationandpriceindices/timeseries/d7g7/mm23':
          new Response('error', { status: 503 })
      },
      502
    ]
  ])('reports %s', async (_case, lang, tableId, overrides, status) => {
    const { client } = setup(overrides);

    await expect(client.getMetadata(lang, tableId)).rejects.toMatchObject({
      status
    });
  });
});
