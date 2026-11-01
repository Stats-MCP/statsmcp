import { describe, expect, it } from 'vitest';

import type { EvalCase } from '@/dataset';
import { passRate, scoreCase, type TaskOutput } from '@/scorers';

const searchCase: EvalCase = {
  id: 'x',
  server: 'si',
  tags: ['english'],
  ask: 'What is the latest inflation rate in Slovenia?',
  expected: {
    tool: 'search_tables',
    lang: 'en',
    queryAny: ['inflation', 'consumer price']
  }
};

const idCase: EvalCase = {
  id: 'y',
  server: 'au',
  tags: ['id-lookup'],
  ask: 'Show the dimensions of the ABS dataset CPI.',
  expected: { tool: 'get_table_metadata', tableId: 'CPI' }
};

const call = (toolName: string, args: Record<string, unknown>): TaskOutput => ({
  toolName,
  args
});

function failed(
  item: EvalCase,
  output: TaskOutput,
  defaultLang = 'sl'
): string[] {
  return scoreCase(item, output, defaultLang)
    .filter((score) => score.passed === false)
    .map((score) => score.name);
}

describe('scoreCase', () => {
  it.each([
    [
      'a good search',
      call('search_tables', { query: 'consumer price index', lang: 'en' }),
      []
    ],
    [
      'no tool call',
      { toolName: null, args: null },
      ['tool', 'lang', 'keywords', 'short']
    ],
    [
      'the wrong tool',
      call('query_table', { tableId: 'x', lang: 'en' }),
      ['tool', 'keywords', 'short']
    ],
    [
      'the default language when English is expected',
      call('search_tables', { query: 'inflation' }),
      ['lang']
    ],
    [
      'a query without any keyword',
      call('search_tables', { query: 'prices', lang: 'en' }),
      ['keywords']
    ],
    [
      'a full question as the query',
      call('search_tables', {
        query: 'what is the latest inflation rate in slovenia',
        lang: 'en'
      }),
      ['short']
    ]
  ])('scores %s', (_name, output, expected) => {
    expect(failed(searchCase, output)).toEqual(expected);
  });

  it.each([
    ['the right table', call('get_table_metadata', { tableId: 'CPI' }), []],
    [
      'another table',
      call('get_table_metadata', { tableId: 'CPI_M' }),
      ['tableId']
    ],
    [
      'a search instead',
      call('search_tables', { query: 'cpi' }),
      ['tool', 'tableId']
    ]
  ])('scores an id lookup with %s', (_name, output, expected) => {
    expect(failed(idCase, output, 'en')).toEqual(expected);
  });

  it('accepts the default language when it is the expected one', () => {
    const native: EvalCase = {
      ...searchCase,
      expected: { ...searchCase.expected, lang: 'sl', queryAny: ['plač'] }
    };

    expect(
      failed(native, call('search_tables', { query: 'povprečna plača' }))
    ).toEqual([]);
  });

  it('fails lang without a tool call, even when the default language is expected', () => {
    const native: EvalCase = {
      ...searchCase,
      expected: { ...searchCase.expected, lang: 'sl', queryAny: ['plač'] }
    };

    expect(failed(native, { toolName: null, args: null })).toContain('lang');
  });
});

describe('passRate', () => {
  it('leaves out scorers that do not apply', () => {
    expect(
      passRate([
        { name: 'tableId', passed: true },
        { name: 'tableId', passed: false },
        { name: 'tableId', passed: null },
        { name: 'tableId', passed: null }
      ])
    ).toBe(0.5);
  });
});
