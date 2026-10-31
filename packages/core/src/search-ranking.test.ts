import { describe, expect, it } from 'vitest';

import type { TableSearchHit } from '@/pxweb-client';
import { isHistorical, rankSearchHits } from '@/search-ranking';

describe('isHistorical', () => {
  it.each([
    ['Retail price indices, Slovenia, 1953 - 2005', true],
    ['Consumer price indices, 2000M01 - 2016M12', true],
    ['Consumer price index (2025=100) 1920M03 - 2026M09', false],
    ['Population, 1995Q1 - 2025Q4', false],
    ['Inflation, Slovenia, monthly', false],
    ['Series, 2000 - 2024', true],
    ['Series, 2000 - 2025', false]
  ])('%s → %s', (title, expected) => {
    expect(isHistorical(title, 2026)).toBe(expected);
  });
});

describe('rankSearchHits', () => {
  it('moves closed historical series below current tables', () => {
    const hits = [
      {
        tableId: 'old',
        title: 'Retail prices, 1953 - 2005',
        published: '2022-01-24'
      },
      {
        tableId: 'new',
        title: 'Consumer price indices, monthly',
        published: '2026-10-05'
      }
    ];

    expect(rankSearchHits(hits, 2026).map((hit) => hit.tableId)).toEqual([
      'new',
      'old'
    ]);
  });

  it('lifts a recent table over an older one that the API ranked first', () => {
    const hits = [
      { tableId: 'a', title: 'Tourist arrivals', published: '2022-01-24' },
      { tableId: 'b', title: 'Tourism trips', published: '2026-05-28' }
    ];

    expect(rankSearchHits(hits, 2026).map((hit) => hit.tableId)).toEqual([
      'b',
      'a'
    ]);
  });

  it('ranks a hit without a publication date by its position only', () => {
    const hits: TableSearchHit[] = [
      { tableId: 'undated', title: 'Undated table', published: undefined },
      { tableId: 'dated', title: 'Dated table', published: '2026-01-01' }
    ];

    expect(rankSearchHits(hits, 2026).map((hit) => hit.tableId)).toEqual([
      'dated',
      'undated'
    ]);
  });

  it('keeps the API order for tables of the same age', () => {
    const hits = ['x', 'y', 'z'].map((tableId) => ({
      tableId,
      title: tableId,
      published: '2026-01-01'
    }));

    expect(rankSearchHits(hits, 2026).map((hit) => hit.tableId)).toEqual([
      'x',
      'y',
      'z'
    ]);
  });
});
