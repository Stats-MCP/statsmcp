import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { createOspClient, type OspClientOptions } from '@/osp-client';
import type { PxwebSelection } from '@/pxweb-client';

const ROOT = 'https://osp.example/rest_xml';
const POPULATION = 'S3R167_M3010202';
const CPI = 'S7R121_M2020103_1';
const SCHOOLS = 'S3R053_M3110301_2';
const TITLE =
  'S3R167 - Resident population at the beginning of the year: Administrative territory | Age | Sex (1996 - 2026)';
const LT_TITLE =
  'S3R167 - Nuolatinių gyventojų skaičius metų pradžioje: Administracinė teritorija | Amžius | Lytis (1996 - 2026)';

function fixture(path: string): string | undefined {
  const name = path.replace(/\/$/, '').replaceAll('/', '_');
  const url = new URL(`fixtures/osp/${name}.xml`, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : undefined;
}

/** Small chunks, so observations and characters cross chunk boundaries. */
function inChunks(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 97) {
        controller.enqueue(bytes.slice(i, i + 97));
      }
      controller.close();
    }
  });
}

function setup(
  overrides: Record<string, () => Response> = {},
  limits: Partial<OspClientOptions> = {}
) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/rest_xml/', '');
    const override = overrides[path.split('/')[0] ?? ''];
    if (override) return override();
    const body = fixture(path);
    if (!body) return new Response('', { status: 404 });
    return new Response(path.startsWith('data/') ? inChunks(body) : body);
  });
  const client = createOspClient({
    baseUrl: ROOT,
    fetch: fetchMock,
    now: () => new Date('2026-11-27T00:00:00Z'),
    ...limits
  });
  const urls = (resource: string) =>
    fetchMock.mock.calls
      .map(([input]) => String(input).replace(ROOT, ''))
      .filter((url) => url.startsWith(`/${resource}/`));
  return { client, fetchMock, urls };
}

const top = (code: string, count: number): PxwebSelection => ({
  code,
  selection: { filter: 'top', values: [String(count)] }
});
const items = (code: string, ...values: string[]): PxwebSelection => ({
  code,
  selection: { filter: 'item', values }
});

describe('createOspClient', () => {
  it('searches the dataflow list in each language from one download and hides discontinued dataflows', async () => {
    const { client, urls } = setup();

    const english = await client.search('en', 'resident population');
    const lithuanian = await client.search('lt', 'gyventojų skaičius');

    expect(english).toEqual([
      { tableId: POPULATION, title: TITLE, published: '2026-05-07' }
    ]);
    expect(lithuanian.map((hit) => hit.title)).toEqual([LT_TITLE]);
    expect(urls('dataflow')).toEqual(['/dataflow/']);
  });

  it.each([
    [
      POPULATION,
      [
        'Lytis: 0 1 2 (eliminable)',
        'Demogr_amziusM1411: g000g999 0 1 2 10 g085 (eliminable)',
        'savivaldybesRegdb: 00 01 13 (eliminable)',
        'MATVNT: asmenys',
        'TIME_PERIOD: 1996 1997 … 2026 (31)'
      ]
    ],
    [
      CPI,
      [
        'ECOICOP2_M2020216_1: CP00 CP01 CP011 CP02 CP022 (eliminable)',
        'LYGINIMAS: palyg_al palyg_pm palyg_pm_12men palyg_pm_gruodis',
        'MATVNT: procentai',
        'TIME_PERIOD: 1997M01 1997M02 … 2026M10 (358)'
      ]
    ]
  ])(
    'describes %s with sorted codes, totals and periods from its description',
    async (tableId, variables) => {
      const { client } = setup();

      const table = await client.getMetadata('en', tableId);

      expect(
        table.variables.map((v) => {
          const codes = v.isTime
            ? `${v.values.slice(0, 2).join(' ')} … ${v.values.at(-1)} (${v.values.length})`
            : v.values.join(' ');
          return `${v.code}: ${codes}${v.eliminable ? ' (eliminable)' : ''}`;
        })
      ).toEqual(variables);
    }
  );

  it('filters the downloaded periods to the chosen codes and the totals of left-out dimensions, in the asked language', async () => {
    const { client, urls } = setup();

    const table = await client.query('lt', POPULATION, [
      items('Lytis', '2', '1'),
      top('TIME_PERIOD', 2)
    ]);

    expect(urls('data')).toEqual([
      `/data/${POPULATION}?startPeriod=2025&endPeriod=2026`
    ]);
    expect(table).toEqual({
      label: `${LT_TITLE} (atnaujinta: 2026-05-07; gauta: 2026-11-27)`,
      columns: ['Lytis', 'Matavimo vienetai', 'Laikotarpis', 'Reikšmė'],
      rows: [
        ['Vyrai', 'asmenys', '2025', 1373683],
        ['Vyrai', 'asmenys', '2026', 1375508],
        ['Moterys', 'asmenys', '2025', 1516981],
        ['Moterys', 'asmenys', '2026', 1512084]
      ]
    });
  });

  it('shows the status of missing values', async () => {
    const { client } = setup();

    const table = await client.query('en', CPI, [
      items('ECOICOP2_M2020216_1', 'CP022'),
      items('LYGINIMAS', 'palyg_pm'),
      items('TIME_PERIOD', '2026M10')
    ]);

    expect(table.columns.at(-1)).toBe('Status');
    expect(table.rows).toEqual([
      [
        'Alcohol production services',
        'compare to corresponding period of previous year',
        'per cent',
        '2026M10',
        null,
        'data not available, although the phenomenon existed'
      ]
    ]);
  });

  it.each([
    [
      'one request per run of adjacent periods',
      ['2026M10', '2026M09', '2025M10'],
      ['2025-10&endPeriod=2025-10', '2026-09&endPeriod=2026-10']
    ],
    [
      'one span when the runs are many',
      ['2026M01', '2026M03', '2026M05', '2026M07', '2026M09'],
      ['2026-01&endPeriod=2026-09']
    ]
  ])('asks %s', async (_case, periods, ranges) => {
    const { client, urls } = setup();

    await client.query('en', CPI, [items('TIME_PERIOD', ...periods)]);

    expect(urls('data')).toEqual(
      ranges.map((range) => `/data/${CPI}?startPeriod=${range}`)
    );
  });

  it('asks school years by their first and last year and notes an empty answer', async () => {
    const { client, urls } = setup();

    const table = await client.query('en', SCHOOLS, [top('TIME_PERIOD', 1)]);

    expect(urls('data')).toEqual([
      `/data/${SCHOOLS}?startPeriod=2026&endPeriod=2027`
    ]);
    expect(table.rows).toEqual([]);
    expect(table.label).toMatch(/No data for the selected periods\.$/);
  });

  it.each<[string, Partial<OspClientOptions>, RegExp]>([
    [
      'more cells than the limit',
      { maxCells: 100 },
      /could return 120 cells, above the limit of 100\./
    ],
    [
      'a download above the observation limit',
      { maxDownloadObservations: 500 },
      /about 600 observations, above the limit of 500\. Select at most 25 periods\./
    ]
  ])('refuses %s before any data request', async (_case, limits, error) => {
    const { client, urls } = setup({}, limits);

    await expect(
      client.query('en', CPI, [top('TIME_PERIOD', 30)])
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(error)
    });
    expect(urls('data')).toEqual([]);
  });

  it.each<[string, string, Record<string, () => Response>, number]>([
    ['an unknown dataflow as not found', 'NOPE_X', {}, 404],
    [
      'a server error as a bad gateway',
      CPI,
      { datastructure: () => new Response('', { status: 503 }) },
      502
    ],
    [
      'a refused request as a bad gateway',
      CPI,
      { datastructure: () => new Response('', { status: 403 }) },
      502
    ]
  ])('reports %s', async (_case, tableId, overrides, status) => {
    const request = setup(overrides).client.getMetadata('en', tableId);

    await expect(request).rejects.toMatchObject({ status });
  });

  it('answers a repeated query without new requests', async () => {
    const { client, fetchMock } = setup();
    const selections = [top('TIME_PERIOD', 1)];

    const first = await client.query('en', POPULATION, selections);
    const calls = fetchMock.mock.calls.length;

    expect(await client.query('en', POPULATION, selections)).toEqual(first);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
