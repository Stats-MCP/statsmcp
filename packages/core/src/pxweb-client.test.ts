import { describe, expect, it, vi } from 'vitest';

import { createPxwebClient, isValidTableId, PxwebError } from '@/pxweb-client';

const BASE_URL = 'https://stats.example/api/v1';

const metadataBody = JSON.stringify({
  title: 'Population',
  variables: [
    {
      code: 'SPOL',
      text: 'SEX',
      values: ['1'],
      valueTexts: ['Men'],
      elimination: true
    }
  ]
});

const scoredHit = (id: string, score: number) => ({
  id,
  path: '/prices',
  title: `${id}: Table`,
  score
});

function multiClient(fetchMock: typeof fetch) {
  return createPxwebClient({
    baseUrl: BASE_URL,
    database: ['Econ', 'People'],
    fetch: fetchMock
  });
}

describe('isValidTableId', () => {
  it.each([
    ['0156101S.px', true],
    ['folder/sub/05A1002S.px', true],
    ['05A1002S', true],
    ['Kpi10', true],
    ['if/if01/kpi/SBMENU12005/Kpi10', true],
    ['0156101S.PX', true],
    ['../secret.px', false],
    ['/05A1002S.px', false],
    ['a/../b.px', false],
    ['05A1002S.px?x=1', false],
    ['05A1002S.csv', false],
    ['a.b/c', false],
    ['%2e%2e/x', false],
    ['a\\b', false],
    ['a/b.px\n', false],
    ['tabela-č', false],
    ['a//b', false]
  ])('%s → %s', (tableId, valid) => {
    expect(isValidTableId(tableId)).toBe(valid);
  });
});

describe('createPxwebClient', () => {
  it('serves repeated metadata requests from the cache', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(metadataBody)
    );
    const client = createPxwebClient({ baseUrl: BASE_URL, fetch: fetchMock });

    await client.getMetadata('en', 'T1.px');
    const metadata = await client.getMetadata('en', 'T1.px');
    await client.getMetadata('sl', 'T1.px');

    expect(metadata.variables[0]).toMatchObject({
      code: 'SPOL',
      eliminable: true,
      isTime: false
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache a response with an unexpected shape', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"unexpected":true}'))
      .mockResolvedValueOnce(new Response(metadataBody));
    const client = createPxwebClient({ baseUrl: BASE_URL, fetch: fetchMock });

    await expect(client.getMetadata('en', 'T1.px')).rejects.toBeInstanceOf(
      PxwebError
    );
    await expect(client.getMetadata('en', 'T1.px')).resolves.toMatchObject({
      title: 'Population'
    });
  });

  it('cancels a body larger than the limit when no length is declared', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const cancel = vi.fn<() => void>();
    const stream = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.enqueue(chunk),
      cancel
    });
    const client = createPxwebClient({
      baseUrl: BASE_URL,
      fetch: async () => new Response(stream)
    });

    await expect(client.search('en', 'x')).rejects.toThrow(/too large/);
    expect(cancel).toHaveBeenCalled();
  });

  it('decodes a character that is split across chunks', async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify([{ id: 'T1.px', title: 'ČETRTLETJE' }])
    );
    const split = bytes.indexOf(0xc4) + 1;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split));
        controller.close();
      }
    });
    const client = createPxwebClient({
      baseUrl: BASE_URL,
      fetch: async () => new Response(stream)
    });

    await expect(client.search('en', 'x')).resolves.toMatchObject([
      { title: 'ČETRTLETJE' }
    ]);
  });

  it('does not cache a JSON-stat dataset that cannot be flattened', async () => {
    const dataset = {
      class: 'dataset',
      id: ['SPOL'],
      size: [1],
      dimension: { SPOL: { category: { index: ['1'] } } },
      value: [5]
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...dataset, size: [2] }))
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(dataset)));
    const client = createPxwebClient({ baseUrl: BASE_URL, fetch: fetchMock });
    const selections = [
      { code: 'SPOL', selection: { filter: 'item' as const, values: ['1'] } }
    ];

    await expect(client.query('en', 'T1.px', selections)).rejects.toThrow(
      'PxWeb returned an invalid JSON-stat dataset.'
    );
    await expect(
      client.query('en', 'T1.px', selections)
    ).resolves.toMatchObject({ rows: [['1', 5]] });
  });

  it('reports upstream HTTP errors with their status', async () => {
    const client = createPxwebClient({
      baseUrl: BASE_URL,
      fetch: async () => new Response('Too many', { status: 429 })
    });

    await expect(client.search('en', 'x')).rejects.toMatchObject({
      status: 429
    });
  });

  it.each([
    [undefined, 'Data'],
    ['StatFin', 'StatFin']
  ])('builds URLs with database %s', async (database, segment) => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('[]'));
    const client = createPxwebClient({
      baseUrl: `${BASE_URL}/`,
      database,
      fetch: fetchMock
    });

    await client.search('en', 'population');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/en/${segment}?query=population`,
      expect.anything()
    );
  });

  it.each([400, 404])(
    'reports an unknown table clearly (HTTP %i)',
    async (status) => {
      const client = createPxwebClient({
        baseUrl: BASE_URL,
        fetch: async () => new Response('Bad Request', { status })
      });

      await expect(client.getMetadata('en', 'NOPE.px')).rejects.toMatchObject({
        status: 404,
        message:
          'Table "NOPE.px" was not found. Use search_tables to find a table id.'
      });
    }
  );

  it('passes other metadata errors through unchanged', async () => {
    const client = createPxwebClient({
      baseUrl: BASE_URL,
      fetch: async () => new Response('Too many', { status: 429 })
    });

    await expect(client.getMetadata('en', 'T1.px')).rejects.toMatchObject({
      status: 429
    });
  });

  it('builds table ids with the preset hook, falls back for bad ids and keeps the first duplicate', async () => {
    const hits = [
      {
        id: 'Kpi10',
        path: '/if/a',
        title: '14710: Consumer price index',
        published: '2026-10-09'
      },
      {
        id: 'Kpi10',
        path: '/pp/b',
        title: '14710: Copy of the index',
        published: '2026-10-09'
      },
      { id: 'X1', path: '/z', title: 'No number here', published: '2026-10-09' }
    ];
    const client = createPxwebClient({
      baseUrl: BASE_URL,
      fetch: async () => new Response(JSON.stringify(hits)),
      tableIdFromHit: (hit) => /^(\d+):/.exec(hit.title)?.[1] ?? ''
    });

    const result = await client.search('en', 'prices');

    expect(result.map((hit) => [hit.tableId, hit.title])).toEqual([
      ['14710', '14710: Consumer price index'],
      ['z/X1', 'No number here']
    ]);
  });

  it('marks hits from the preset archive hook and ranks them last', async () => {
    const hits = [
      { id: 'PA66.PX', path: '/Lepetatud_tabelid/x', title: 'PA66: Wages' },
      { id: 'IA002.px', path: '/majandus/hinnad', title: 'IA002: Prices' }
    ];
    const client = createPxwebClient({
      baseUrl: BASE_URL,
      fetch: async () => new Response(JSON.stringify(hits)),
      tableIdFromHit: (hit) => hit.id,
      isArchived: (hit) => hit.path?.startsWith('/Lepetatud_tabelid/') ?? false
    });

    const result = await client.search('en', 'prices');

    expect(result).toEqual([
      { tableId: 'IA002.px', title: 'IA002: Prices', published: undefined },
      {
        tableId: 'PA66.PX',
        title: 'PA66: Wages',
        published: undefined,
        archived: true
      }
    ]);
  });

  it('uses a table id without a suffix verbatim in the URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(metadataBody)
    );
    const client = createPxwebClient({
      baseUrl: BASE_URL,
      database: 'table',
      fetch: fetchMock
    });

    await client.getMetadata('en', 'if/if01/kpi/SBMENU12005/Kpi10');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/en/table/if/if01/kpi/SBMENU12005/Kpi10`,
      expect.anything()
    );
  });

  it('uses the API root of the language and rejects a language without one', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(metadataBody)
    );
    const client = createPxwebClient({
      baseUrl: {
        en: 'https://px.example/pxen/api/v1/',
        is: 'https://px.example/pxis/api/v1'
      },
      fetch: fetchMock
    });

    await client.getMetadata('en', 'a/T1.px');
    await client.getMetadata('is', 'a/T1.px');
    const missing = client.search('sl', 'population');
    const inherited = client.search('constructor', 'population');

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://px.example/pxen/api/v1/en/Data/a/T1.px',
      'https://px.example/pxis/api/v1/is/Data/a/T1.px'
    ]);
    await expect(missing).rejects.toMatchObject({ status: 400 });
    await expect(inherited).rejects.toMatchObject({ status: 400 });
  });

  describe('with several databases', () => {
    it('searches every database, prefixes ids and orders hits by score', async () => {
      const fetchMock = vi.fn<typeof fetch>(async (url) =>
        String(url).includes('/Econ?')
          ? new Response(JSON.stringify([scoredHit('A.px', 0.2)]))
          : new Response(JSON.stringify([scoredHit('B.px', 0.9)]))
      );

      const hits = await multiClient(fetchMock).search('en', 'prices');

      expect(hits.map((h) => h.tableId)).toEqual([
        'People/prices/B.px',
        'Econ/prices/A.px'
      ]);
    });

    it('keeps the results of the other databases when one fails, and fails when all fail', async () => {
      const oneDown = vi.fn<typeof fetch>(async (url) =>
        String(url).includes('/Econ?')
          ? new Response('down', { status: 503 })
          : new Response(JSON.stringify([scoredHit('B.px', 0.9)]))
      );
      const allDown = vi.fn<typeof fetch>(
        async () => new Response('down', { status: 503 })
      );

      const hits = await multiClient(oneDown).search('en', 'prices');

      expect(hits.map((h) => h.tableId)).toEqual(['People/prices/B.px']);
      await expect(
        multiClient(allDown).search('en', 'prices')
      ).rejects.toMatchObject({ status: 503 });
    });

    it('reads a table from the database in its id and rejects an unknown database without a request', async () => {
      const fetchMock = vi.fn<typeof fetch>(
        async () => new Response(metadataBody)
      );
      const client = multiClient(fetchMock);

      await client.getMetadata('en', 'People/prices/B.px');
      const unknown = client.getMetadata('en', 'Other/prices/B.px');

      await expect(unknown).rejects.toMatchObject({ status: 404 });
      expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
        `${BASE_URL}/en/People/prices/B.px`
      ]);
    });
  });

  it.each(['Econ', 'Other/prices/B.px'])(
    'answers "not found" without a request for the id %s with a database array',
    async (tableId) => {
      const fetchMock = vi.fn<typeof fetch>();
      const client = createPxwebClient({
        baseUrl: BASE_URL,
        database: ['Econ'],
        fetch: fetchMock
      });

      await expect(client.getMetadata('en', tableId)).rejects.toMatchObject({
        status: 404
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('prefixes ids with the database for a one-element database array', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify([scoredHit('A.px', 0.5)]))
    );
    const client = createPxwebClient({
      baseUrl: BASE_URL,
      database: ['Econ'],
      fetch: fetchMock
    });

    const hits = await client.search('en', 'prices');

    expect(hits.map((h) => h.tableId)).toEqual(['Econ/prices/A.px']);
  });

  it('rejects a database segment that could change the path', () => {
    expect(() =>
      createPxwebClient({ baseUrl: BASE_URL, database: '../admin' })
    ).toThrow(/Invalid PxWeb database/);
  });
});
