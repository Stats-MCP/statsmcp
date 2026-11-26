import { describe, expect, it, vi } from 'vitest';

import fixture from '@/fixtures/ine-es.json';
import { createIneEsClient } from '@/ine-es-client';
import type { PxwebSelection } from '@/pxweb-client';

const ROOT = 'https://ine.example/wstempus/js';
const responses = new Map<string, unknown>(Object.entries(fixture));

function setup(overrides: Record<string, Response> = {}) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/wstempus/js/EN/', '');
    const probe = url.searchParams.get('nult') === '10000';
    const key = path.startsWith('DATOS_TABLA')
      ? `${path} ${probe ? 'probe' : 'query'}`
      : path;
    const override = overrides[key];
    if (override) return override.clone();
    const body = responses.get(key);
    return body === undefined
      ? new Response('<html>404</html>', { status: 404 })
      : Response.json(body);
  });
  const client = createIneEsClient({
    baseUrl: ROOT,
    fetch: fetchMock,
    tableList: async () => [
      {
        id: '76136',
        title: 'Indices by Autonomous Community',
        updated: '2026-11-13'
      }
    ]
  });
  const dataUrl = () =>
    new URL(String(fetchMock.mock.calls.at(-1)?.[0])).searchParams;
  return { client, fetchMock, dataUrl };
}

describe('createIneEsClient', () => {
  it('maps groups to variables, mixed variables included, and adds the periods', async () => {
    const { client, fetchMock } = setup();

    const table = await client.getMetadata('en', '76136');

    expect(table.title).toBe(
      'Indices by Autonomous Community (last update: 2026-11-13)'
    );
    expect(table.variables).toEqual([
      {
        code: '155612',
        label: 'Autonomous Communities and Cities',
        values: ['16473', '8997', '8998'],
        valueLabels: ['National', 'Andalucía', 'Aragón'],
        eliminable: false,
        isTime: false
      },
      expect.objectContaining({ code: '155613', values: ['304092', '304093'] }),
      expect.objectContaining({ code: '155614', values: ['83', '74'] }),
      {
        code: 'period',
        label: 'Period',
        values: ['2026M08', '2026M09', '2026M10'],
        valueLabels: ['2026M08', '2026M09', '2026M10'],
        eliminable: false,
        isTime: true
      }
    ]);
    const probe = new URL(String(fetchMock.mock.calls.at(-1)?.[0]));
    expect(probe.searchParams.getAll('tv')).toEqual([
      '349:16473',
      '762:304092',
      '3:83'
    ]);
  });

  it('filters each value by its own variable and returns the chosen periods as rows', async () => {
    const { client, dataUrl } = setup();

    const table = await client.query('en', '76136', [
      {
        code: '155612',
        selection: { filter: 'item', values: ['16473', '8997'] }
      },
      { code: '155613', selection: { filter: 'item', values: ['304092'] } },
      { code: '155614', selection: { filter: 'item', values: ['74'] } },
      {
        code: 'period',
        selection: { filter: 'item', values: ['2026M10', '2026M08'] }
      }
    ]);

    expect(dataUrl().getAll('tv')).toEqual([
      '349:16473',
      '70:8997',
      '762:304092',
      '3:74'
    ]);
    expect(dataUrl().get('date')).toBe('20260801:20261001');
    expect(table.columns).toEqual([
      'Autonomous Communities and Cities',
      'ECOICOP ver.2 Groups',
      'Type of data',
      'Period',
      'Value'
    ]);
    expect(table.rows).toEqual([
      ['National', 'Overall index', 'Annual change', '2026M08', 4.3],
      ['National', 'Overall index', 'Annual change', '2026M10', 4.9],
      ['Andalucía', 'Overall index', 'Annual change', '2026M08', 4],
      ['Andalucía', 'Overall index', 'Annual change', '2026M10', 4.4]
    ]);
  });

  it.each<[string, PxwebSelection[], string]>([
    [
      'the latest periods',
      [{ code: 'period', selection: { filter: 'top', values: ['2'] } }],
      '2'
    ],
    ['every known period when time is left out', [], '3']
  ])('bounds the time range for %s', async (_case, selections, nult) => {
    const { client, dataUrl } = setup();

    await client.query('en', '76136', selections);

    expect(dataUrl().get('nult')).toBe(nult);
    expect(dataUrl().get('date')).toBeNull();
    expect(dataUrl().getAll('tv')).toEqual([]);
  });

  it('asks for latest periods when the probe finds no series and time is left out', async () => {
    const { client } = setup({
      'DATOS_TABLA/76136 probe': Response.json([])
    });

    const table = await client.getMetadata('en', '76136');

    expect(table.variables.at(-1)).toMatchObject({
      code: 'period',
      values: [],
      periodsIncomplete: true
    });
    await expect(client.query('en', '76136', [])).rejects.toMatchObject({
      status: 400
    });
  });

  it('explains a server error on a data request', async () => {
    const { client } = setup({
      'DATOS_TABLA/76136 query': new Response('error', { status: 500 })
    });

    await expect(
      client.query('en', '76136', [
        { code: 'period', selection: { filter: 'top', values: ['1'] } }
      ])
    ).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('INE could not answer this selection')
    });
  });

  it('reports an unknown table as not found', async () => {
    const { client } = setup();

    await expect(client.getMetadata('en', '999')).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining('search_tables')
    });
  });

  it('lists the tables of every operation with their update date', async () => {
    const { client } = setup();

    expect(await client.listTables('en')).toEqual([
      {
        id: '76136',
        title:
          'Indices by Autonomous Community: overall and by ECOICOP ver.2 group',
        path: ['Consumer Price Index (CPI)'],
        updated: '2026-11-13'
      },
      {
        id: '56934',
        title: 'Resident population by date, sex and age (from 1971)',
        path: ['Continuous Population Statistics'],
        updated: '2025-12-02',
        lastPeriod: '2026Q1'
      }
    ]);
  });
});
