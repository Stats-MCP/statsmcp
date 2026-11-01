import { createMcpHandler } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  createMultiServer,
  type MultiServerEntry
} from '@/create-multi-server';
import type { PxwebPreset } from '@/preset';
import type { PxwebClient } from '@/pxweb-client';

function preset(
  name: string,
  languages: readonly [string, ...string[]]
): PxwebPreset {
  return {
    name,
    title: `${name.toUpperCase()} office`,
    version: '0.0.0',
    apiBaseUrl: `https://${name}.example/api`,
    languages,
    attribution: () => `Source: ${name.toUpperCase()} office`,
    tableUrl: (lang, tableId) => `https://${name}.example/${lang}/${tableId}`,
    instructions: `Hints for ${name}.`,
    maxCells: 5000,
    searchLimit: 10
  };
}

function fakeClient(name: string): PxwebClient {
  return {
    search: vi.fn<PxwebClient['search']>(async (lang, query) => [
      {
        tableId: `${name}-1`,
        title: `${name} ${lang} ${query}`,
        published: undefined
      }
    ]),
    getMetadata: vi.fn<PxwebClient['getMetadata']>(async () => ({
      title: `${name} table`,
      variables: []
    })),
    query: vi.fn<PxwebClient['query']>()
  };
}

const resultSchema = z.object({
  result: z.object({
    content: z.tuple([z.object({ text: z.string() })]).optional(),
    isError: z.boolean().optional(),
    tools: z
      .array(z.object({ name: z.string(), inputSchema: z.unknown() }))
      .optional()
  })
});

function setup() {
  const clients = { a: fakeClient('a'), b: fakeClient('b') };
  const factories = {
    a: vi.fn<() => PxwebClient>(() => clients.a),
    b: vi.fn<() => PxwebClient>(() => clients.b)
  };
  const entries: MultiServerEntry[] = [
    { code: 'a', preset: preset('a', ['xx', 'en']), client: factories.a },
    { code: 'b', preset: preset('b', ['en']), client: factories.b }
  ];
  async function rpc(method: string, params: unknown) {
    const handler = createMcpHandler(() =>
      createMultiServer(entries, {
        name: 'all',
        title: 'All',
        version: '0.0.0'
      })
    );
    const response = await handler.fetch(
      new Request('https://mcp.example/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-06-18'
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      })
    );
    const raw = await response.text();
    const line = raw
      .split('\n')
      .map((text) => text.replace(/^data: /, ''))
      .find((text) => text.startsWith('{'));
    const parsed: unknown = JSON.parse(line ?? raw);
    return resultSchema.parse(parsed).result;
  }
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await rpc('tools/call', { name, arguments: args });
    return {
      text: result.content?.[0].text ?? '',
      isError: result.isError === true
    };
  };
  return { clients, factories, rpc, call };
}

describe('createMultiServer', () => {
  it('lists four tools and requires a country on the data tools', async () => {
    const { rpc } = setup();

    const { tools = [] } = await rpc('tools/list', {});

    expect(tools.map((tool) => tool.name)).toEqual([
      'list_countries',
      'search_tables',
      'get_table_metadata',
      'query_table'
    ]);
    for (const tool of tools.slice(1)) {
      const { required } = z
        .object({ required: z.array(z.string()) })
        .parse(tool.inputSchema);
      expect(required).toContain('country');
    }
  });

  it('routes a call to the asked country and creates only that client', async () => {
    const { clients, factories, call } = setup();

    const result = await call('search_tables', { country: 'b', query: 'jobs' });

    expect(result.text).toContain('b-1 | b en jobs');
    expect(result.text).toContain('Source: B office');
    expect(clients.b.search).toHaveBeenCalledWith('en', 'jobs', {
      includeArchived: false
    });
    expect(factories.a).not.toHaveBeenCalled();
  });

  it.each([
    ['the default language', {}, 'xx'],
    ['an asked language', { lang: 'en' }, 'en']
  ])('searches in %s', async (_name, args, expected) => {
    const { clients, call } = setup();

    await call('search_tables', { country: 'a', query: 'jobs', ...args });

    expect(clients.a.search).toHaveBeenCalledWith(expected, 'jobs', {
      includeArchived: false
    });
  });

  it('refuses a language the country does not have, without a request', async () => {
    const { factories, clients, call } = setup();

    const result = await call('get_table_metadata', {
      country: 'b',
      tableId: 'T1',
      lang: 'xx'
    });

    expect(result).toMatchObject({ isError: true });
    expect(result.text).toContain('Use one of: en');
    expect(clients.b.getMetadata).not.toHaveBeenCalled();
    expect(factories.a).not.toHaveBeenCalled();
  });

  it('refuses an unknown country through the schema', async () => {
    const { call } = setup();

    const result = await call('search_tables', {
      country: 'zz',
      query: 'jobs'
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('country');
  });

  it('queries the asked country with the planned selections', async () => {
    const { clients, call } = setup();
    vi.mocked(clients.b.getMetadata).mockResolvedValue({
      title: 'Jobs',
      variables: [
        {
          code: 'YEAR',
          label: 'Year',
          values: ['2024', '2025'],
          valueLabels: ['2024', '2025'],
          eliminable: false,
          isTime: true
        }
      ]
    });
    vi.mocked(clients.b.query).mockResolvedValue({
      label: 'Jobs',
      columns: ['Year', 'Value'],
      rows: [['2025', 7]]
    });

    const result = await call('query_table', {
      country: 'b',
      tableId: 'T1',
      selections: [{ code: 'YEAR', latest: 1 }]
    });

    expect(clients.b.query).toHaveBeenCalledWith('en', 'T1', [
      { code: 'YEAR', selection: { filter: 'top', values: ['1'] } }
    ]);
    expect(result.text).toContain('Jobs. 1 rows.');
    expect(result.text).toContain('Source: B office, table T1');
  });

  it('refuses duplicate country codes', () => {
    const entry: MultiServerEntry = {
      code: 'a',
      preset: preset('a', ['en']),
      client: () => fakeClient('a')
    };

    expect(() =>
      createMultiServer([entry, entry], {
        name: 'all',
        title: 'All',
        version: '0.0.0'
      })
    ).toThrow('unique');
  });

  it.each([
    [{}, ['a | A office | languages: xx, en', 'b | B office | languages: en']],
    [{ country: 'a' }, ['A office', 'Hints for a.']]
  ])('lists countries with %j', async (args, expected) => {
    const { factories, call } = setup();

    const result = await call('list_countries', args);

    for (const part of expected) expect(result.text).toContain(part);
    expect(factories.a).not.toHaveBeenCalled();
  });
});
