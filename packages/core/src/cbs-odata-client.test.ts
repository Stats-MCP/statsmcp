import { describe, expect, it, vi } from 'vitest';

import { createCbsODataClient } from '@/cbs-odata-client';

const BASE_URL = 'https://cbs.example';

const catalogue = {
  value: [
    {
      Identifier: '86141ENG',
      Title: 'Consumer prices; CPI 2025=100',
      Language: 'en',
      Modified: '2026-10-13T06:30:00',
      OutputStatus: 'Regular'
    },
    {
      Identifier: '83131ENG',
      Title: 'Consumer prices; CPI 2015=100',
      Language: 'en',
      Modified: '2026-01-13T06:30:00',
      OutputStatus: 'Discontinued'
    },
    {
      Identifier: '86141NED',
      Title: 'Consumentenprijzen; CPI 2025=100',
      Language: 'nl',
      Modified: '2026-10-13T06:30:00',
      OutputStatus: 'Regulier'
    }
  ]
};

const responses: Record<string, unknown> = {
  TableInfos: { value: [{ Title: 'Consumer prices; CPI 2025=100' }] },
  DataProperties: {
    value: [
      {
        Type: 'Dimension',
        Key: 'ExpenditureCategories',
        Title: 'Expenditure categories'
      },
      { Type: 'TimeDimension', Key: 'Periods', Title: 'Periods' },
      { Type: 'Topic', Key: 'CPI_1', Title: 'CPI', Unit: '2025=100' },
      {
        Type: 'Topic',
        Key: 'AnnualRateOfChangeCPI_5',
        Title: 'Annual rate of change CPI',
        Unit: '%'
      }
    ]
  },
  ExpenditureCategories: {
    value: [
      { Key: 'T001112  ', Title: '000000 All items' },
      { Key: 'CPI010000', Title: '010000 Food' }
    ]
  },
  Periods: {
    value: [
      { Key: '2026MM07', Title: '2026 July' },
      { Key: '2026MM08', Title: '2026 August' },
      { Key: '2026MM09', Title: '2026 September' }
    ]
  },
  TypedDataSet: {
    value: [
      {
        ExpenditureCategories: 'T001112  ',
        Periods: '2026MM08',
        AnnualRateOfChangeCPI_5: 3.3
      },
      {
        ExpenditureCategories: 'T001112  ',
        Periods: '2026MM09',
        AnnualRateOfChangeCPI_5: 3.4
      }
    ]
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function tableFetch(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input) => {
    const path = new URL(String(input)).pathname.split('/').at(-1) ?? '';
    return path in responses ? json(responses[path]) : json({}, 404);
  });
}

describe('createCbsODataClient', () => {
  it('searches the catalogue in the asked language and hides discontinued tables unless asked', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(catalogue));
    const client = createCbsODataClient({
      baseUrl: BASE_URL,
      fetch: fetchMock,
      now: () => new Date('2026-11-01')
    });

    const current = await client.search('en', 'consumer prices');
    const hits = await client.search('en', 'consumer prices', {
      includeArchived: true
    });

    expect(current.map((hit) => hit.tableId)).toEqual(['86141ENG']);
    expect(hits.map((hit) => [hit.tableId, hit.archived ?? false])).toEqual([
      ['86141ENG', false],
      ['83131ENG', true]
    ]);
  });

  it('exposes dimensions with trimmed codes and the measures as a Topics variable', async () => {
    const client = createCbsODataClient({
      baseUrl: BASE_URL,
      fetch: tableFetch()
    });

    const metadata = await client.getMetadata('en', '86141ENG');

    expect(metadata.title).toBe('Consumer prices; CPI 2025=100');
    expect(metadata.variables).toEqual([
      {
        code: 'ExpenditureCategories',
        label: 'Expenditure categories',
        values: ['T001112', 'CPI010000'],
        valueLabels: ['000000 All items', '010000 Food'],
        eliminable: false,
        isTime: false
      },
      {
        code: 'Periods',
        label: 'Periods',
        values: ['2026MM07', '2026MM08', '2026MM09'],
        valueLabels: ['2026 July', '2026 August', '2026 September'],
        eliminable: false,
        isTime: true
      },
      {
        code: 'Topics',
        label: 'Topics',
        values: ['CPI_1', 'AnnualRateOfChangeCPI_5'],
        valueLabels: ['CPI (2025=100)', 'Annual rate of change CPI (%)'],
        eliminable: false,
        isTime: false
      }
    ]);
  });

  it('filters with the stored keys, resolves the latest periods and returns one row per measure', async () => {
    const fetchMock = tableFetch();
    const client = createCbsODataClient({
      baseUrl: BASE_URL,
      fetch: fetchMock
    });

    const table = await client.query('en', '86141ENG', [
      {
        code: 'ExpenditureCategories',
        selection: { filter: 'item', values: ['T001112'] }
      },
      { code: 'Periods', selection: { filter: 'top', values: ['2'] } },
      {
        code: 'Topics',
        selection: { filter: 'item', values: ['AnnualRateOfChangeCPI_5'] }
      }
    ]);

    const dataUrl = new URL(
      String(
        fetchMock.mock.calls.find(([input]) =>
          String(input).includes('TypedDataSet')
        )?.[0]
      )
    );
    expect(dataUrl.searchParams.get('$filter')).toBe(
      "(ExpenditureCategories eq 'T001112  ') and (Periods eq '2026MM08' or Periods eq '2026MM09')"
    );
    expect(dataUrl.searchParams.get('$select')).toBe(
      'ExpenditureCategories,Periods,AnnualRateOfChangeCPI_5'
    );
    expect(table.columns).toEqual([
      'Expenditure categories',
      'Periods',
      'Topics',
      'Value'
    ]);
    expect(table.rows).toEqual([
      ['000000 All items', '2026 August', 'Annual rate of change CPI (%)', 3.3],
      [
        '000000 All items',
        '2026 September',
        'Annual rate of change CPI (%)',
        3.4
      ]
    ]);
  });

  it('adds no filter for an unselected dimension, uses every topic and escapes quotes', async () => {
    const fetchMock = tableFetch();
    const client = createCbsODataClient({
      baseUrl: BASE_URL,
      fetch: fetchMock
    });

    await client.query('en', '86141ENG', [
      {
        code: 'ExpenditureCategories',
        selection: { filter: 'item', values: ["O'Brien"] }
      }
    ]);

    const dataUrl = new URL(
      String(
        fetchMock.mock.calls.find(([input]) =>
          String(input).includes('TypedDataSet')
        )?.[0]
      )
    );
    expect(dataUrl.searchParams.get('$filter')).toBe(
      "(ExpenditureCategories eq 'O''Brien')"
    );
    expect(dataUrl.searchParams.get('$select')).toBe(
      'ExpenditureCategories,Periods,CPI_1,AnnualRateOfChangeCPI_5'
    );
  });

  it('rejects a topic that the table does not have without a data request', async () => {
    const fetchMock = tableFetch();
    const client = createCbsODataClient({
      baseUrl: BASE_URL,
      fetch: fetchMock
    });

    await expect(
      client.query('en', '86141ENG', [
        { code: 'Topics', selection: { filter: 'item', values: ['Nope_9'] } }
      ])
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Nope_9')
    });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('TypedDataSet')
      )
    ).toBe(false);
  });

  it('follows next links for a dimension with more than one page of keys', async () => {
    const pages: Record<string, unknown> = {
      ...responses,
      ExpenditureCategories: {
        value: [{ Key: 'A', Title: 'First' }],
        'odata.nextLink': `${BASE_URL}/ODataApi/odata/86141ENG/ExpenditureCategoriesPage2`
      },
      ExpenditureCategoriesPage2: { value: [{ Key: 'B', Title: 'Second' }] }
    };
    const client = createCbsODataClient({
      baseUrl: BASE_URL,
      fetch: async (input) => {
        const path = new URL(String(input)).pathname.split('/').at(-1) ?? '';
        return path in pages ? json(pages[path]) : json({}, 404);
      }
    });

    const metadata = await client.getMetadata('en', '86141ENG');

    expect(metadata.variables[0]?.values).toEqual(['A', 'B']);
  });

  it('reports an unknown table as not found', async () => {
    const client = createCbsODataClient({
      baseUrl: BASE_URL,
      fetch: async () => json({}, 404)
    });

    await expect(client.getMetadata('en', '99999ENG')).rejects.toMatchObject({
      status: 404
    });
  });

  it.each(['../x', '86141 ENG', "86141ENG'"])(
    'rejects the table id %s without a request',
    async (tableId) => {
      const fetchMock = vi.fn<typeof fetch>();
      const client = createCbsODataClient({
        baseUrl: BASE_URL,
        fetch: fetchMock
      });

      await expect(client.getMetadata('en', tableId)).rejects.toMatchObject({
        status: 400
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});
