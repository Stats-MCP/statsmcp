import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { createInePtClient } from '@/ine-pt-client';

const ROOT = 'https://ine.example/ine';

function fixture(name: string): string {
  return readFileSync(
    new URL(`fixtures/ine-pt/${name}`, import.meta.url),
    'utf8'
  );
}

function setup({
  metadata = fixture('metadata.json'),
  data = fixture('data.json'),
  catalogue = fixture('catalogue.xml'),
  maxCells
}: {
  metadata?: string;
  data?: string;
  catalogue?: string;
  maxCells?: number;
} = {}) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('pindicaMeta.jsp')) return new Response(metadata);
    if (url.includes('pindica.jsp')) return new Response(data);
    return new Response(catalogue);
  });
  const client = createInePtClient({
    baseUrl: ROOT,
    fetch: fetchMock,
    maxCells
  });
  const urls = () => fetchMock.mock.calls.map(([url]) => String(url));
  return { client, fetchMock, urls };
}

describe('createInePtClient', () => {
  it('maps the Dim_Num{n}_{code} categories to variables with Dim1 as time', async () => {
    const { client, urls } = setup();

    const table = await client.getMetadata('en', '0008074');

    expect(urls()).toEqual([
      `${ROOT}/json_indicador/pindicaMeta.jsp?varcd=0008074&lang=EN`
    ]);
    expect(table).toEqual({
      title:
        'Crime rate (‰) by Geographic localization (NUTS - 2013) and Category of crime; Annual - Directorate General for Justice Policy',
      variables: [
        {
          code: 'Dim1',
          label: 'Data reference period',
          values: ['S7A2020', 'S7A2021', 'S7A2022'],
          valueLabels: ['2020', '2021', '2022'],
          eliminable: false,
          isTime: true
        },
        {
          code: 'Dim2',
          label: 'Geographic localization (NUTS - 2013)',
          values: ['PT', '11'],
          valueLabels: ['Portugal', 'Norte'],
          eliminable: false,
          isTime: false
        },
        {
          code: 'Dim3',
          label: 'Category of crime',
          values: ['T', '1'],
          valueLabels: ['Overall total', 'Crimes of assault'],
          eliminable: false,
          isTime: false
        }
      ]
    });
  });

  it('asks for the latest periods and chosen values as DimN parameters and sorts the rows', async () => {
    const { client, urls } = setup();

    const table = await client.query('en', '0008074', [
      { code: 'Dim1', selection: { filter: 'top', values: ['2'] } },
      { code: 'Dim2', selection: { filter: 'item', values: ['PT', '11'] } },
      { code: 'Dim3', selection: { filter: 'item', values: ['1'] } }
    ]);

    expect(urls()[1]).toBe(
      `${ROOT}/json_indicador/pindica.jsp?op=2&varcd=0008074&Dim1=S7A2021,S7A2022&Dim2=PT,11&Dim3=1&lang=EN`
    );
    expect(table).toEqual({
      label: expect.stringContaining('Crime rate'),
      columns: [
        'Data reference period',
        'Geographic localization (NUTS - 2013)',
        'Category of crime',
        'Value'
      ],
      rows: [
        ['2021', 'Portugal', 'Crimes of assault', 4.6],
        ['2021', 'Norte', 'Crimes of assault', 4.3],
        ['2022', 'Portugal', 'Crimes of assault', 5.1],
        ['2022', 'Norte', 'Crimes of assault', 4.6]
      ]
    });
  });

  it('lists every period for "all" but leaves out other dimensions, which INE returns whole', async () => {
    const { client, urls } = setup();

    await client.query('en', '0008074', [
      { code: 'Dim1', selection: { filter: 'all', values: ['*'] } },
      { code: 'Dim2', selection: { filter: 'all', values: ['*'] } },
      { code: 'Dim3', selection: { filter: 'item', values: ['1'] } }
    ]);

    expect(new URL(urls()[1] ?? '').search).toBe(
      '?op=2&varcd=0008074&Dim1=S7A2020,S7A2021,S7A2022&Dim3=1&lang=EN'
    );
  });

  it('refuses a query above the cell cap before asking for data', async () => {
    const { client, urls } = setup({ maxCells: 11 });

    await expect(client.query('en', '0008074', [])).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('12 cells, above the limit of 11')
    });
    expect(urls()).toHaveLength(1);
  });

  it.each([
    [
      'an unknown indicator',
      () =>
        setup({
          metadata: fixture('unknown-indicator.json')
        }).client.getMetadata('en', '9999999'),
      { status: 404, message: expect.stringContaining('was not found') }
    ],
    [
      'an invalid value code',
      () =>
        setup({ data: fixture('invalid-code.json') }).client.query(
          'en',
          '0008074',
          []
        ),
      {
        status: 400,
        message:
          'INE refused the request: Code(s) in Dim1 not valid for the indicator.'
      }
    ],
    [
      'an id that is not an indicator code',
      () => setup().client.getMetadata('en', '../0008074'),
      { status: 400, message: expect.stringContaining('Invalid table id') }
    ]
  ])('reports %s', async (_case, run, error) => {
    await expect(run()).rejects.toMatchObject(error);
  });

  it('lists the catalogue with paths and ISO dates, most recently updated first', async () => {
    const { client, urls } = setup();

    const docs = await client.listTables('pt');

    expect(urls()).toEqual([`${ROOT}/xml_indic.jsp?opc=2&lang=PT`]);
    expect(docs).toEqual([
      {
        id: '0001164',
        title:
          'Expected likelihood to spend money on major purchases over the next 12 months (Balance) of consumers; Monthly - Statistics Portugal, Short-term statistics on business - consumers survey',
        path: ['Short-term trends', 'Demand of goods and services'],
        updated: '2026-10-29',
        lastPeriod: '202610'
      },
      {
        id: '0008074',
        title:
          'Crime rate (‰) by Geographic localization (NUTS - 2013) and Category of crime; Annual - Directorate General for Justice Policy',
        path: ['Justice', 'Police'],
        updated: '2026-06-30',
        lastPeriod: '2022'
      }
    ]);
  });

  it('refuses a catalogue that the server cut short', async () => {
    const { client } = setup({
      catalogue: fixture('catalogue.xml').replace('</catalog>', '')
    });

    await expect(client.listTables('pt')).rejects.toMatchObject({
      status: 502
    });
  });
});
