import { describe, expect, it, vi } from 'vitest';

import type { Cache } from '@/cache';
import fixture from '@/fixtures/ibge.json';
import { createIbgeClient } from '@/ibge-client';
import type { PxwebSelection } from '@/pxweb-client';

const ROOT = 'https://ibge.example/api/v3/agregados';
const SIDRA = 'https://sidra.example/values';
const responses = new Map<string, unknown>(Object.entries(fixture));

function setup(overrides: Record<string, Response> = {}, cache?: Cache) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    const path = decodeURIComponent(url.slice(ROOT.length + 1));
    let key = path || 'catalogue';
    if (url.startsWith(SIDRA)) key = 'data';
    const override = overrides[key];
    if (override) return override.clone();
    const body = responses.get(key);
    return body === undefined
      ? Response.json({ statusCode: 500 }, { status: 500 })
      : Response.json(body);
  });
  const client = createIbgeClient({
    baseUrl: ROOT,
    sidraUrl: SIDRA,
    fetch: fetchMock,
    maxCells: 12,
    now: () => new Date('2026-11-27T00:00:00Z'),
    ...(cache && { cache })
  });
  const sidraPath = () =>
    fetchMock.mock.calls
      .map(([input]) => String(input))
      .findLast((input) => input.startsWith(SIDRA))
      ?.slice(SIDRA.length + 1);
  return { client, fetchMock, sidraPath };
}

const SEX: PxwebSelection = {
  code: 'c2',
  selection: { filter: 'item', values: ['4', '5'] }
};
const TITLE =
  'População residente, por sexo e grupos de idade - Pirâmide etária';
const POPULATION = ['Brasil', 'População (Mil pessoas)'];
const POPULATION_2025: PxwebSelection[] = [
  { code: 'variavel', selection: { filter: 'item', values: ['606'] } },
  { code: 'periodo', selection: { filter: 'item', values: ['2025'] } }
];

describe('createIbgeClient', () => {
  it('exposes variables, classifications, localities by level and ordered periods', async () => {
    const { client } = setup();

    expect(await client.getMetadata('pt', '6706')).toEqual({
      title: TITLE,
      variables: [
        {
          code: 'variavel',
          label: 'Variável',
          values: ['606', '8413'],
          valueLabels: [
            'População (Mil pessoas)',
            'Distribuição percentual da população por sexo segundo grupos de idade (%)'
          ],
          eliminable: false,
          isTime: false
        },
        {
          code: 'c2',
          label: 'Sexo',
          values: ['6794', '4', '5'],
          valueLabels: ['Total', 'Homens', 'Mulheres'],
          eliminable: true,
          isTime: false
        },
        {
          code: 'c58',
          label: 'Grupo de idade',
          values: ['1140', '1141'],
          valueLabels: ['0 a 4 anos', '5 a 9 anos'],
          eliminable: false,
          isTime: false
        },
        {
          code: 'localidade',
          label: 'Localidade',
          values: ['N1:1', 'N2:1', 'N3:33', 'N3:35', 'N6:3550308'],
          valueLabels: [
            'Brasil',
            'Norte',
            'Rio de Janeiro',
            'São Paulo',
            'São Paulo'
          ],
          eliminable: true,
          isTime: false
        },
        {
          code: 'periodo',
          label: 'Período',
          values: ['2023', '2024', '2025'],
          valueLabels: ['2023', '2024', '2025'],
          eliminable: false,
          isTime: true
        }
      ]
    });
  });

  it('returns labelled rows from one SIDRA request, with "-" as zero and symbols as null', async () => {
    const data: Record<string, string>[] = structuredClone(fixture.data);
    data[2] = { ...data[2], V: '-' };
    data[3] = { ...data[3], V: '...' };
    const { client, sidraPath } = setup({ data: Response.json(data) });

    const table = await client.query('pt', '6706', [
      { code: 'variavel', selection: { filter: 'item', values: ['606'] } },
      SEX,
      { code: 'periodo', selection: { filter: 'top', values: ['1'] } }
    ]);

    expect(sidraPath()).toBe('t/6706/n1/all/v/606/p/2025/c2/4,5/c58/all');
    expect(table).toEqual({
      label: TITLE,
      columns: [
        'Localidade',
        'Variável',
        'Sexo',
        'Grupo de idade',
        'Período',
        'Valor'
      ],
      rows: [
        [...POPULATION, 'Homens', '0 a 4 anos', '2025', 6463],
        [...POPULATION, 'Homens', '5 a 9 anos', '2025', 0],
        [...POPULATION, 'Mulheres', '0 a 4 anos', '2025', null]
      ]
    });
  });

  it.each<[string, PxwebSelection, string]>([
    [
      'chosen localities grouped by level',
      {
        code: 'localidade',
        selection: { filter: 'item', values: ['N3:35', 'N6:3550308', 'N3:33'] }
      },
      't/6706/n3/35,33/n6/3550308/v/606/p/2025/c58/all'
    ],
    [
      'every level when all localities are asked for',
      { code: 'localidade', selection: { filter: 'all', values: ['*'] } },
      't/6706/n1/all/n2/all/n3/all/n6/all/v/606/p/2025/c58/all'
    ]
  ])('selects %s', async (_case, selection, path) => {
    const { client, sidraPath } = setup();

    await client.query('pt', '6706', [...POPULATION_2025, selection]);

    expect(sidraPath()).toBe(path);
  });

  it('loads an aggregate once for metadata and a query', async () => {
    const noCache: Cache = {
      get: async () => undefined,
      set: async () => undefined
    };
    const { client, fetchMock } = setup({}, noCache);

    await client.getMetadata('pt', '6706');
    await client.query('pt', '6706', [...POPULATION_2025, SEX]);
    await client.getMetadata('pt', '6706');

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('refuses a selection above the cell limit before it asks for data', async () => {
    const { client, sidraPath } = setup();

    await expect(
      client.query('pt', '6706', [
        SEX,
        { code: 'periodo', selection: { filter: 'top', values: ['2'] } }
      ])
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('16 cells')
    });
    expect(sidraPath()).toBeUndefined();
  });

  it.each([
    [
      'an aggregate missing from the catalogue',
      '9999',
      {},
      404,
      'search_tables'
    ],
    [
      'a catalogued aggregate whose metadata fails',
      '1737',
      {},
      502,
      'IBGE could not answer'
    ],
    [
      'a refused selection',
      '6706',
      { data: new Response('Parâmetro V inexistente', { status: 400 }) },
      400,
      'SIDRA refused this selection: Parâmetro V'
    ],
    [
      'a SIDRA server error',
      '6706',
      { data: new Response('error', { status: 503 }) },
      502,
      'IBGE could not answer'
    ]
  ])('reports %s', async (_case, tableId, overrides, status, message) => {
    const { client } = setup(overrides);

    await expect(
      client.query('pt', tableId, [...POPULATION_2025, SEX])
    ).rejects.toMatchObject({
      status,
      message: expect.stringContaining(message)
    });
  });

  it('lists the catalogue with the survey as path and marks ended series', async () => {
    const { client } = setup();

    const docs = await client.listTables('pt');

    expect(docs.find((doc) => doc.id === '4099')?.path).toEqual([
      'Pesquisa Nacional por Amostra de Domicílios Contínua trimestral'
    ]);
    expect(docs.filter((doc) => doc.discontinued).map((doc) => doc.id)).toEqual(
      ['1419', '2168', '3839']
    );
  });
});
