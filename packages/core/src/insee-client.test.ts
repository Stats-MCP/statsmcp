import { describe, expect, it, vi } from 'vitest';

import type { Cache } from '@/cache';
import fixture from '@/fixtures/insee/melodi.json';
import { createInseeClient } from '@/insee-client';
import type { PxwebSelection } from '@/pxweb-client';

const ROOT = 'https://insee.example/melodi';
const responses = new Map<string, unknown>(Object.entries(fixture));

function setup(
  overrides: Record<string, Response> = {},
  maxCells?: number,
  cache?: Cache
) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/melodi/', '');
    const probe = url.searchParams.get('maxResult') === '1';
    const key = path.startsWith('data/')
      ? `${path} ${probe ? 'probe' : 'query'}`
      : path;
    const override = overrides[key];
    if (override) return override.clone();
    const body = responses.get(key);
    return body === undefined
      ? new Response(`${path.split('/').at(-1)} n'existe pas.`, {
          status: 400
        })
      : Response.json(body);
  });
  const client = createInseeClient({
    baseUrl: ROOT,
    fetch: fetchMock,
    ...(maxCells && { maxCells }),
    ...(cache && { cache }),
    tableList: async () => [
      {
        id: 'DS_IPC_PRINC',
        title: 'Consumption Price Index (CPI) - main dataset',
        updated: '2026-09-30'
      }
    ]
  });
  const dataUrl = () =>
    new URL(String(fetchMock.mock.calls.at(-1)?.[0])).searchParams;
  return { client, fetchMock, dataUrl };
}

describe('createInseeClient', () => {
  it('maps the dimensions of the data to variables, attributes and measures left out', async () => {
    const { client } = setup();

    const table = await client.getMetadata('en', 'DS_IPC_PRINC');

    expect(table.title).toBe(
      'Consumption Price Index (CPI) - main dataset (last update: 2026-09-30)'
    );
    expect(table.variables).toEqual([
      {
        code: 'GEO',
        label: 'Geography',
        values: ['DEP-976', 'FRANCE-F'],
        valueLabels: ['Mayotte', 'France'],
        eliminable: false,
        isTime: false
      },
      expect.objectContaining({ code: 'FREQ', values: ['A', 'M'] }),
      expect.objectContaining({
        code: 'IND_TYPE',
        valueLabels: ['Year-on-year change', 'Index']
      }),
      {
        code: 'TIME_PERIOD',
        label: 'Time period',
        values: ['2024', '2025', '2026-07', '2026-08', '2026-09'],
        valueLabels: ['2024', '2025', '2026-07', '2026-08', '2026-09'],
        eliminable: false,
        isTime: true
      }
    ]);
  });

  it('sends each chosen value as its own filter and returns sorted rows of the chosen periods', async () => {
    const { client, dataUrl } = setup();

    const table = await client.query('fr', 'DS_IPC_PRINC', [
      {
        code: 'GEO',
        selection: { filter: 'item', values: ['FRANCE-F', 'DEP-976'] }
      },
      { code: 'IND_TYPE', selection: { filter: 'item', values: ['IX'] } },
      { code: 'FREQ', selection: { filter: 'item', values: ['M'] } },
      {
        code: 'TIME_PERIOD',
        selection: { filter: 'item', values: ['2026-08', '2026-09'] }
      }
    ]);

    expect(dataUrl().getAll('GEO')).toEqual(['FRANCE-F', 'DEP-976']);
    expect(dataUrl().getAll('TIME_PERIOD')).toEqual(['2026-08', '2026-09']);
    expect(dataUrl().get('maxResult')).toBe('8');
    expect(table.columns).toEqual([
      'Géographie',
      'Fréquence',
      "Type d'indicateur",
      'Période temporelle',
      'Valeur'
    ]);
    expect(table.rows).toEqual([
      ['Mayotte', 'Mensuel', 'Indice', '2026-08', 102.44],
      ['France', 'Mensuel', 'Indice', '2026-08', 101.69],
      ['France', 'Mensuel', 'Indice', '2026-09', 101.91]
    ]);
  });

  it('returns an empty cell for a measure without a value', async () => {
    const { client } = setup({
      'data/DS_IPC_PRINC query': Response.json({
        observations: [
          {
            dimensions: {
              GEO: '2025-FRANCE-F',
              FREQ: 'M',
              TIME_PERIOD: '2026-09',
              IND_TYPE: 'IX'
            },
            measures: { OBS_VALUE_INDICE_DE_PRIX: {} }
          }
        ]
      })
    });

    const table = await client.query('en', 'DS_IPC_PRINC', []);

    expect(table.rows).toEqual([
      ['France', 'Monthly', 'Index', '2026-09', null]
    ]);
  });

  it.each<[string, PxwebSelection[], string[], string]>([
    [
      'the newest periods of each frequency for latest',
      [{ code: 'TIME_PERIOD', selection: { filter: 'top', values: ['2'] } }],
      ['2024', '2025', '2026-08', '2026-09'],
      '64'
    ],
    ['no period filter when time is left out', [], [], '80']
  ])('bounds the request with %s', async (_case, selections, periods, max) => {
    const { client, dataUrl } = setup();

    await client.query('en', 'DS_IPC_PRINC', selections);

    expect(dataUrl().getAll('TIME_PERIOD')).toEqual(periods);
    expect(dataUrl().get('maxResult')).toBe(max);
  });

  it('loads the value list once, with gzip, for metadata and a query', async () => {
    const tooLargeToCache: Cache = {
      get: async () => undefined,
      set: async () => undefined
    };
    const { client, fetchMock } = setup({}, undefined, tooLargeToCache);

    await client.getMetadata('en', 'DS_IPC_PRINC');
    await client.query('en', 'DS_IPC_PRINC', [
      { code: 'TIME_PERIOD', selection: { filter: 'top', values: ['1'] } }
    ]);

    const rangeCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/range/')
    );
    expect(rangeCalls).toHaveLength(1);
    expect(
      new Headers(rangeCalls[0]?.[1]?.headers).get('accept-encoding')
    ).toBe('gzip');
  });

  it('refuses a selection above the cell cap before the data request', async () => {
    const { client, fetchMock } = setup({}, 39);

    await expect(client.query('en', 'DS_IPC_PRINC', [])).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('40 cells')
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each<[string, number, number, string]>([
    ['a refused filter', 400, 400, 'Aucun territoire trouvé'],
    ['a server error', 503, 502, 'HTTP 503']
  ])('explains %s on a data request', async (_case, status, expected, text) => {
    const { client } = setup({
      'data/DS_IPC_PRINC query': new Response('Aucun territoire trouvé', {
        status
      })
    });

    await expect(client.query('en', 'DS_IPC_PRINC', [])).rejects.toMatchObject({
      status: expected,
      message: expect.stringContaining(text)
    });
  });

  it.each([
    ['an unknown dataset', 'DS_NOPE', 404],
    ['an id that is not a dataset id', '../catalog/all', 400]
  ])('reports %s', async (_case, tableId, status) => {
    const { client } = setup();

    await expect(client.getMetadata('en', tableId)).rejects.toMatchObject({
      status,
      message: expect.stringContaining('search_tables')
    });
  });

  it('lists the catalogue with theme, update date and deprecated datasets', async () => {
    const { client } = setup();

    expect(await client.listTables('en')).toEqual([
      {
        id: 'DS_FECONDITE',
        title: '[deprecated] Fertility',
        path: ['Births – Fertility'],
        discontinued: true
      },
      {
        id: 'DS_IPC_PRINC',
        title: 'Consumption Price Index (CPI) - main dataset',
        path: ['General economy (inflation, GDP, debt,...)'],
        updated: '2026-09-30',
        lastPeriod: '2026'
      }
    ]);
  });
});
