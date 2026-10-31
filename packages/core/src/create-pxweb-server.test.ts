import { createMcpHandler } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createPresetServer, createPxwebServer } from '@/create-pxweb-server';
import type { PxwebPreset } from '@/preset';
import { createPxwebClient } from '@/pxweb-client';

const preset: PxwebPreset = {
  name: 'test',
  title: 'Test statistics',
  version: '0.0.0',
  apiBaseUrl: 'https://stats.example/api/v1',
  languages: ['en'],
  attribution: () => 'Source: Test office',
  tableUrl: (lang, tableId) => `https://stats.example/${lang}/${tableId}`,
  instructions: 'Test instructions.',
  maxCells: 100,
  searchLimit: 10
};

const months = Array.from({ length: 40 }, (_, i) => `2020M${String(i + 1)}`);

const metadata = {
  title: 'Prices',
  variables: [
    {
      code: 'MESEC',
      text: 'MONTH',
      values: months,
      valueTexts: months,
      time: true
    },
    {
      code: 'OBČINE',
      text: 'MUNICIPALITIES',
      values: ['061', '070'],
      valueTexts: ['Ljubljana', 'Maribor']
    }
  ]
};

const dataset = {
  class: 'dataset',
  label: 'Prices by MONTH and MUNICIPALITIES',
  id: ['MESEC', 'OBČINE'],
  size: [1, 2],
  dimension: {
    MESEC: { label: 'MONTH', category: { index: ['2020M40'] } },
    OBČINE: {
      label: 'MUNICIPALITIES',
      category: {
        index: ['061', '070'],
        label: { '061': 'Ljubljana', '070': 'Maribor' }
      }
    }
  },
  value: [101.5, 99]
};

const toolResponseSchema = z.object({
  result: z.object({
    content: z.tuple([z.object({ text: z.string() })]),
    isError: z.boolean().optional()
  })
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

async function callTool(
  fetchMock: typeof fetch,
  name: string,
  args: Record<string, unknown>,
  serverPreset: PxwebPreset = preset
): Promise<{ text: string; isError: boolean }> {
  const client = createPxwebClient({
    baseUrl: preset.apiBaseUrl,
    fetch: fetchMock
  });
  const handler = createMcpHandler(() =>
    createPxwebServer(serverPreset, client)
  );
  const response = await handler.fetch(
    new Request('https://mcp.example/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args }
      })
    })
  );
  const raw = await response.text();
  const payload = raw.includes('data:')
    ? raw
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5))
        .join('')
    : raw;
  const { result } = toolResponseSchema.parse(JSON.parse(payload));
  return { text: result.content[0].text, isError: result.isError === true };
}

describe('createPxwebServer', () => {
  it('lists search hits with their full table path and the source', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json([
        {
          id: 'T1.px',
          path: '/Economy/Prices/',
          title: 'Prices',
          published: '2026-10-05T10:00:00'
        }
      ])
    );

    const { text } = await callTool(fetchMock, 'search_tables', {
      query: 'prices'
    });

    expect(text).toBe(
      '1 tables match; showing 1.\nEconomy/Prices/T1.px | Prices | 2026-10-05\n\nSource: Test office'
    );
  });

  it('adds the hits of a matching search alias before the plain results', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('query=earnings')
        ? json([
            {
              id: 'E1.px',
              title: 'Average monthly earnings',
              published: '2026-10-01'
            }
          ])
        : json([])
    );
    const aliasPreset: PxwebPreset = {
      ...preset,
      searchAliases: { en: [{ terms: ['salary'], query: 'earnings' }] }
    };

    const { text } = await callTool(
      fetchMock,
      'search_tables',
      { query: 'average salary' },
      aliasPreset
    );

    expect(text).toContain('E1.px | Average monthly earnings');
  });

  it.each([
    ['a word inside another word', 'sewage treatment'],
    ['an alias query that fails', 'average wage']
  ])('keeps the plain results for %s', async (_case, query) => {
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('query=earnings')
        ? new Response('Too many', { status: 429 })
        : json([
            { id: 'S1.px', title: 'Plain result', published: '2026-01-01' }
          ])
    );
    const aliasPreset: PxwebPreset = {
      ...preset,
      searchAliases: { en: [{ terms: ['wage'], query: 'earnings' }] }
    };

    const result = await callTool(
      fetchMock,
      'search_tables',
      { query },
      aliasPreset
    );

    expect(result.isError).toBe(false);
    expect(result.text).toContain('S1.px | Plain result');
  });

  it('shortens long value lists and filters values by label', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(metadata));

    const full = await callTool(fetchMock, 'get_table_metadata', {
      tableId: 'T1.px'
    });
    const filtered = await callTool(fetchMock, 'get_table_metadata', {
      tableId: 'T1.px',
      valueFilter: 'MARI'
    });

    expect(full.text).toContain('… 25 more …');
    expect(full.text).toContain(
      'Source: Test office, table T1.px: https://stats.example/en/T1.px'
    );
    expect(filtered.text).toContain('070=Maribor');
    expect(filtered.text).not.toContain('061=Ljubljana');
  });

  it('sends the planned selection and returns CSV with the source', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(metadata))
      .mockResolvedValueOnce(json(dataset));

    const { text } = await callTool(fetchMock, 'query_table', {
      tableId: 'T1.px',
      selections: [{ code: 'MESEC', latest: 1 }]
    });

    const init = fetchMock.mock.calls[1]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      query: [
        { code: 'MESEC', selection: { filter: 'top', values: ['1'] } },
        { code: 'OBČINE', selection: { filter: 'all', values: ['*'] } }
      ],
      response: { format: 'json-stat2' }
    });
    expect(text).toBe(
      'Prices by MONTH and MUNICIPALITIES. 2 rows.\n\nMONTH,MUNICIPALITIES,Value\n2020M40,Ljubljana,101.5\n2020M40,Maribor,99\n\nSource: Test office, table T1.px: https://stats.example/en/T1.px'
    );
  });

  it.each([
    [
      'the API rate limits the request',
      async () => json({ message: 'slow down' }, 429),
      { code: 'MESEC', latest: 1 },
      'The statistics API is rate limiting requests. Wait a few seconds and try again.'
    ],
    [
      'the variable code is unknown',
      async () => json(metadata),
      { code: 'NOPE', latest: 1 },
      'Unknown variable "NOPE". Valid codes: MESEC, OBČINE.'
    ]
  ])(
    'returns a tool error when %s',
    async (_case, respond, selection, message) => {
      const fetchMock = vi.fn<typeof fetch>(respond);

      const result = await callTool(fetchMock, 'query_table', {
        tableId: 'T1.px',
        selections: [selection]
      });

      expect(result).toEqual({ text: message, isError: true });
    }
  );

  it.each([
    [undefined, undefined, '/en/Data?query=prices', 'test-mcp/0.0.0'],
    ['table', 'my-app/1.0', '/en/table?query=prices', 'my-app/1.0']
  ])(
    'createPresetServer uses database %s and user agent %s',
    async (database, userAgent, path, expectedAgent) => {
      const fetchMock = vi.fn<typeof fetch>(async () => json([]));
      const server = createPresetServer(
        { ...preset, database },
        { fetch: fetchMock, userAgent }
      );
      const handler = createMcpHandler(() => server);

      await handler.fetch(
        new Request('https://mcp.example/mcp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            'mcp-protocol-version': '2025-06-18'
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'search_tables', arguments: { query: 'prices' } }
          })
        })
      );

      const [url, init] = fetchMock.mock.calls[0] ?? [];
      expect(String(url)).toBe(`${preset.apiBaseUrl}${path}`);
      expect(new Headers(init?.headers).get('user-agent')).toBe(expectedAgent);
    }
  );
});
