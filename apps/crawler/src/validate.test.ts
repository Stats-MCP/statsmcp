import { describe, expect, it } from 'vitest';

import { snapshotProblems } from '@/validate';

import type { Snapshot } from 'pxweb-mcp';

function snapshot(ids: string[]): Snapshot {
  return {
    version: 1,
    source: 'demo',
    lang: 'en',
    builtAt: '2026-11-01T00:00:00.000Z',
    count: ids.length,
    docs: ids.map((id) => ({ id, title: `Table ${id}` }))
  };
}

const ten = snapshot(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);

describe('snapshotProblems', () => {
  it.each([
    ['a first crawl', snapshot(['A']), undefined, []],
    [
      'a drop of exactly 20 %',
      snapshot(['1', '2', '3', '4', '5', '6', '7', '8']),
      ten,
      []
    ],
    ['an empty list', snapshot([]), undefined, ['no tables']],
    [
      'duplicate ids',
      snapshot(['A', 'A', 'B']),
      undefined,
      ['1 duplicate table ids']
    ],
    [
      'a drop of more than 20 %',
      snapshot(['1', '2', '3', '4', '5', '6', '7']),
      ten,
      ['table count fell from 10 to 7 (more than 20 %)']
    ]
  ])('reports %s', (_case, next, previous, problems) => {
    expect(snapshotProblems(next, previous)).toEqual(problems);
  });
});
