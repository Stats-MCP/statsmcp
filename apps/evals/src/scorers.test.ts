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
    keywords: { en: ['inflation', 'consumer price'], sl: ['inflacij'] }
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
      'an English word in a search with the default language',
      call('search_tables', { query: 'inflation' }),
      ['keywords']
    ],
    [
      'a search in the other accepted language',
      call('search_tables', { query: 'inflacija', lang: 'sl' }),
      []
    ],
    [
      'a language the case does not accept',
      call('search_tables', { query: 'inflation', lang: 'de' }),
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
      expected: { ...searchCase.expected, keywords: { sl: ['plač'] } }
    };

    expect(
      failed(native, call('search_tables', { query: 'povprečna plača' }))
    ).toEqual([]);
  });

  it('fails lang without a tool call, even when the default language is expected', () => {
    const native: EvalCase = {
      ...searchCase,
      expected: { ...searchCase.expected, keywords: { sl: ['plač'] } }
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

describe('scoreCase on the all-countries endpoint', () => {
  it.each([
    ['list_countries', true],
    ['search_tables', true],
    ['query_table', false]
  ])('accepts %s for a case that allows two tools: %s', (toolName, passed) => {
    const either: EvalCase = {
      id: 'z',
      server: 'all',
      tags: ['all-countries'],
      ask: 'What is the population of Japan?',
      expected: { tool: ['list_countries', 'search_tables'] }
    };

    const failedTool = failed(either, call(toolName, {})).includes('tool');
    expect(failedTool).toBe(!passed);
  });

  it.each([
    [{ country: 'fi' }, []],
    [{ country: 'no' }, ['country']],
    [{}, ['country']]
  ])('checks the country %j', (args, expected) => {
    const pick: EvalCase = {
      id: 'c',
      server: 'all',
      tags: ['all-countries'],
      ask: 'Compare unemployment in Finland and Sweden.',
      expected: { tool: 'get_table_metadata', countries: ['fi', 'se'] }
    };

    expect(failed(pick, call('get_table_metadata', args))).toEqual(expected);
  });

  it('scores nothing but the tool when the model lists countries', () => {
    const either: EvalCase = {
      id: 'j',
      server: 'all',
      tags: ['all-countries'],
      ask: 'What is the population of Japan?',
      expected: { tool: ['list_countries', 'search_tables'] }
    };

    expect(
      scoreCase(either, call('list_countries', {}), 'en')
        .filter((score) => score.passed !== null)
        .map((score) => score.name)
    ).toEqual(['tool']);
  });

  it('checks the query length when such a case searches', () => {
    const either: EvalCase = {
      id: 'j',
      server: 'all',
      tags: ['all-countries'],
      ask: 'What is the population of Japan?',
      expected: { tool: ['list_countries', 'search_tables'] }
    };

    expect(
      failed(
        either,
        call('search_tables', {
          country: 'eu',
          query: 'what is the population of japan in total'
        })
      )
    ).toEqual(['short']);
  });

  it('fails a language that the chosen country does not offer', () => {
    const compare: EvalCase = {
      id: 'l',
      server: 'all',
      tags: ['all-countries'],
      ask: 'Compare unemployment in Finland and Sweden.',
      expected: {
        tool: 'search_tables',
        countries: ['fi', 'eu'],
        keywords: { fi: ['työttöm'], en: ['unemploy'] }
      }
    };
    const output = call('search_tables', {
      country: 'eu',
      lang: 'fi',
      query: 'työttömyys'
    });

    const langScore = scoreCase(compare, output, 'en', ['en', 'de', 'fr']).find(
      (score) => score.name === 'lang'
    );
    expect(langScore?.passed).toBe(false);
  });
});
