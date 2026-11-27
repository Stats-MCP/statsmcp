import { describe, expect, it, vi } from 'vitest';

import type { Cache } from '@/cache';
import fixture from '@/fixtures/statbel.json';
import type { PxwebSelection } from '@/pxweb-client';
import { createStatbelClient } from '@/statbel-client';

const ROOT = 'https://statbel.example/bestat/api';
const CPI = '86586e27-90ac-47c6-87ce-64b63194e605';
const UNEMPLOYMENT = '7d30d7ff-ab74-4047-b2af-2a0bff250647';
const responses = new Map<string, unknown>(Object.entries(fixture));

type Cell = string | number | null;

function setup(overrides: Record<string, Response> = {}) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const path = new URL(String(input)).pathname.replace('/bestat/api/', '');
    const override = overrides[path];
    if (override) return override.clone();
    const body = responses.get(path);
    return body === undefined
      ? new Response('', { status: 404 })
      : Response.json(body);
  });
  return createStatbelClient({ baseUrl: ROOT, fetch: fetchMock, maxCells: 5 });
}

/** The CPI view with other facts, each with one indicator "v". */
function withFacts(facts: Record<string, Cell>[]) {
  return setup({
    [`views/${CPI}/result/JSON`]: Response.json({
      facts: facts.map((fact) => ({ ...fact, v: 1 }))
    })
  });
}

describe('createStatbelClient', () => {
  it('lists the views of one language, newest data first, with subject and update date', async () => {
    const docs = await setup().listTables('en');

    expect(docs.map((doc) => doc.id)).toEqual([
      CPI,
      UNEMPLOYMENT,
      '208b69bd-05c5-4947-b7f9-2d2300f517b8',
      'f865ac63-4299-494a-80f1-7232bf2053b2'
    ]);
    expect(docs[0]).toEqual({
      id: CPI,
      title:
        'Consumer price index, inflation, health index, health index (moving average), index without energy and petroleum , last 13 months',
      path: [
        'Consumer price index per month, per base year according to the ECOICOP Ver. 2 classification'
      ],
      updated: '2026-10-29'
    });
    expect(docs[3]).toMatchObject({
      updated: '2024-10-04',
      discontinued: true
    });
  });

  it('maps string columns to variables, merges the time columns and lists the indicators', async () => {
    const table = await setup().getMetadata('en', CPI);

    expect(table.title).toMatch(/last 13 months \(last update: 2026-10-29\)$/);
    expect(table.variables).toEqual([
      expect.objectContaining({ code: 'Base year', values: ['2025 = 100'] }),
      expect.objectContaining({ code: 'Global Index', eliminable: false }),
      {
        code: 'Level 1',
        label: 'Level 1',
        values: ['_T', 'Health index'],
        valueLabels: ['Total', 'Health index'],
        eliminable: true,
        isTime: false
      },
      {
        code: 'period',
        label: 'Period',
        values: ['2026M08', '2026M09', '2026M10'],
        valueLabels: ['August 2026', 'September 2026', 'October 2026'],
        eliminable: false,
        isTime: true
      },
      {
        code: 'indicator',
        label: 'Indicator',
        values: ['Consumer price index'],
        valueLabels: ['Consumer price index'],
        eliminable: false,
        isTime: false
      }
    ]);
  });

  it.each<[string, Record<string, Cell>[], string[][] | undefined]>([
    [
      'English quarters',
      [{ Quarter: '3rd quarter 2025' }],
      [['2025Q3'], ['3rd quarter 2025']]
    ],
    [
      'French quarters under a year',
      [{ Année: '2025', Trimestre: '4ème trimestre 2025' }],
      [['2025Q4'], ['4ème trimestre 2025']]
    ],
    [
      'the finest of Dutch year, "Trimester" and month columns',
      [{ Jaar: '2024', Trimester: '1ste kwartaal 2024', Maand: 'Maart 2024' }],
      [['2024M03'], ['Maart 2024']]
    ],
    [
      'month numbers that take the year from the year column',
      [{ Année: '2025', Mois: ' 1' }],
      [['2025M01'], ['2025M01']]
    ],
    [
      'German months next to an annual row',
      [
        { Jahr: '2026', Monat: 'März 2026' },
        { Jahr: '2025', Monat: null }
      ],
      [
        ['2025', '2026M03'],
        ['2025', 'März 2026']
      ]
    ],
    [
      'half years',
      [{ Année: '2018', Semestre: '1er semestre 2018' }],
      [['2018S1'], ['1er semestre 2018']]
    ],
    [
      'padded years',
      [{ Referentiejaar: '        2018' }],
      [['2018'], ['2018']]
    ],
    ['a time column that does not parse', [{ Year: '2020-2021' }], undefined],
    ['a quarter above four', [{ Quarter: '5th quarter 2025' }], undefined]
  ])('reads periods from %s', async (_case, facts, expected) => {
    const table = await withFacts(facts).getMetadata('en', CPI);

    const time = table.variables.find((variable) => variable.isTime);
    expect(time && [time.values, time.valueLabels]).toEqual(expected);
  });

  it('keeps the total of a left-out optional variable and rounds float noise', async () => {
    const table = await setup().query('en', UNEMPLOYMENT, [
      { code: 'Gender', selection: { filter: 'item', values: ['Males'] } },
      { code: 'period', selection: { filter: 'top', values: ['1'] } },
      {
        code: 'indicator',
        selection: { filter: 'item', values: ['Unemployment rate'] }
      }
    ]);

    expect(table.columns.join('|')).toBe(
      'Belgium|Region|Total|Gender|Period|Indicator|Value'
    );
    expect(table.rows.map((row) => row.join('|'))).toEqual([
      'Belgium|Total|Total|Males|2nd quarter 2026|Unemployment rate|0.067'
    ]);
  });

  it.each<[string, Record<string, Cell>[], PxwebSelection[], Cell[][]]>([
    [
      'a child value when its parent has no total rows',
      [
        { Region: null, Province: null },
        { Region: 'Flanders', Province: null },
        { Region: 'Flanders', Province: 'Antwerp' }
      ],
      [
        {
          code: 'Province',
          selection: { filter: 'item', values: ['Antwerp'] }
        }
      ],
      [['Flanders', 'Antwerp', 'v', 1]]
    ],
    [
      'the latest period of each frequency',
      [
        { Year: '2026', Month: null },
        { Year: '2026', Month: 'September 2026' },
        { Year: '2025', Month: null },
        { Year: '2026', Month: 'October 2026' }
      ],
      [{ code: 'period', selection: { filter: 'top', values: ['1'] } }],
      [
        ['2026', 'v', 1],
        ['October 2026', 'v', 1]
      ]
    ]
  ])('selects %s', async (_case, facts, selections, rows) => {
    const table = await withFacts(facts).query('en', CPI, selections);

    expect(table.rows).toEqual(rows);
  });

  it('loads a view once for metadata and a query', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(String(input)).pathname.replace('/bestat/api/', '');
      return Response.json(responses.get(path) ?? {});
    });
    const tooLargeToCache: Cache = {
      get: async () => undefined,
      set: async () => undefined
    };
    const client = createStatbelClient({
      baseUrl: ROOT,
      fetch: fetchMock,
      cache: tooLargeToCache
    });

    await client.getMetadata('en', CPI);
    await client.query('en', CPI, []);

    const loads = fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith(`views/${CPI}/result/JSON`)
    );
    expect(loads).toHaveLength(1);
  });

  it('refuses a result above the cell limit', async () => {
    await expect(
      setup().query('en', UNEMPLOYMENT, [
        { code: 'period', selection: { filter: 'all', values: ['*'] } }
      ])
    ).rejects.toMatchObject({ status: 400, message: /above the limit of 5/ });
  });

  it.each<[string, string, Record<string, Response>, number, RegExp]>([
    [
      'an unknown view',
      '00000000-0000-0000-0000-000000000000',
      {},
      404,
      /search_tables/
    ],
    [
      'a view without data',
      CPI,
      { [`views/${CPI}/result/JSON`]: new Response('') },
      404,
      /has no data/
    ],
    [
      'a server error',
      CPI,
      { [`views/${CPI}/result/JSON`]: new Response('error', { status: 500 }) },
      502,
      /Statbel could not answer/
    ],
    ['an invalid id', '../views', {}, 400, /Invalid table id/]
  ])('reports %s', async (_case, tableId, overrides, status, message) => {
    await expect(
      setup(overrides).getMetadata('en', tableId)
    ).rejects.toMatchObject({
      status,
      message: expect.stringMatching(message)
    });
  });
});
