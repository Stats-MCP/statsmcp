import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createTableIndex,
  createTableIndexLoader,
  type TableDoc
} from '@/table-index';

const docs: TableDoc[] = [
  {
    id: 'FOLK1A',
    title: 'Population at the first day of the quarter',
    updated: '2026-08-10',
    lastPeriod: '2026Q3'
  },
  {
    id: 'SYG1',
    title: 'Population',
    updated: '2020-01-01',
    lastPeriod: '2019'
  },
  {
    id: 'PRIS01',
    title: 'Consumer price index',
    path: ['Economy', 'Prices'],
    updated: '2026-10-10',
    lastPeriod: '2026M09'
  },
  {
    id: 'PRIS111',
    title: 'Consumer price index',
    updated: '2026-01-12',
    lastPeriod: '2025M12',
    discontinued: true
  },
  { id: 'KØB1', title: 'Købekraft og priser', updated: '2025-05-01' },
  {
    id: 'ANIM1',
    title: 'Animal populations by region',
    path: ['Agriculture'],
    updated: '2025-01-01'
  }
];

const index = createTableIndex(docs, 'en', { currentYear: 2026 });

const ids = (query: string, options?: { includeArchived?: boolean }) =>
  index.search(query, options).map((hit) => hit.tableId);

describe('createTableIndex', () => {
  it('puts the office main table first when the catalogue lists it first', () => {
    expect(ids('population')[0]).toBe('FOLK1A');
  });

  it('hides discontinued tables unless asked and marks them archived', () => {
    expect(ids('consumer price index')).toEqual(['PRIS01']);
    expect(
      index.search('consumer price index', { includeArchived: true })
    ).toContainEqual({
      tableId: 'PRIS111',
      title: 'Consumer price index',
      published: '2026-01-12',
      archived: true
    });
  });

  it('finds a table by its exact id first, even a discontinued one', () => {
    expect(ids('pris111')[0]).toBe('PRIS111');
    expect(ids('KØB1')[0]).toBe('KØB1');
  });

  it('matches subject folders and word prefixes', () => {
    expect(ids('prices economy')[0]).toBe('PRIS01');
    expect(ids('popul')).toContain('FOLK1A');
  });

  it('ignores stop words and folds diacritics', () => {
    expect(ids('the of by')).toEqual([]);
    expect(
      createTableIndex(docs, 'da')
        .search('kobekraft')
        .map((hit) => hit.tableId)
    ).toEqual(['KØB1']);
  });

  it('falls back to fuzzy matching only when nothing matches exactly', () => {
    expect(ids('popluation')).toContain('FOLK1A');
    const typoNeighbour = createTableIndex(
      [
        { id: 'P1', title: 'Pollution of rivers' },
        { id: 'P2', title: 'Population of regions' }
      ],
      'en'
    );
    expect(
      typoNeighbour.search('population').map((hit) => hit.tableId)
    ).toEqual(['P2']);
  });

  it('ranks closed series and old tables below current ones', () => {
    const closed = createTableIndex(
      [
        {
          id: 'OLD',
          title: 'Wages by sector, 1990-2010',
          updated: '2011-01-01'
        },
        {
          id: 'NEW',
          title: 'Wages by sector',
          updated: '2026-09-01',
          lastPeriod: '2026Q2'
        }
      ],
      'en',
      { currentYear: 2026 }
    );
    expect(closed.search('wages sector').map((hit) => hit.tableId)).toEqual([
      'NEW',
      'OLD'
    ]);
  });

  it('ranks tables with all query words above tables with some', () => {
    const partial = createTableIndex(
      [
        { id: 'SOME', title: 'Regional employment' },
        { id: 'ALL', title: 'Regional unemployment rate' }
      ],
      'en'
    );
    expect(partial.search('regional unemployment rate')[0]?.tableId).toBe(
      'ALL'
    );
  });

  it('keeps the office order when BM25 prefers a short side table', () => {
    const catalogue = createTableIndex(
      [
        {
          id: 'MAIN',
          title: 'Population at the first day of the quarter by region and sex'
        },
        {
          id: 'OTHER',
          title:
            'Population projections by municipality, sex, age group, migration background and household type'
        },
        { id: 'SIDE', title: 'Population' }
      ],
      'en'
    );
    expect(catalogue.search('population')[0]?.tableId).toBe('MAIN');
  });

  it('returns nothing for an empty query and counts each id once', () => {
    const twice = createTableIndex([...docs, docs[0] as TableDoc], 'en');
    expect(twice.size).toBe(docs.length);
    expect(twice.search('   ')).toEqual([]);
  });
});

describe('createTableIndexLoader', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds once for parallel calls and reuses the index until it expires', async () => {
    vi.useFakeTimers();
    const load = vi.fn<(lang: string) => Promise<TableDoc[]>>(async () => docs);
    const loader = createTableIndexLoader(load, { ttlSeconds: 60 });

    const [first, second] = await Promise.all([loader('en'), loader('en')]);
    await loader('en');
    vi.advanceTimersByTime(61_000);
    await loader('en');

    expect(first).toBe(second);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps serving the old index when a refresh fails, and fails without one', async () => {
    vi.useFakeTimers();
    const load = vi
      .fn<(lang: string) => Promise<TableDoc[]>>()
      .mockResolvedValueOnce(docs)
      .mockRejectedValue(new Error('upstream down'));
    const loader = createTableIndexLoader(load, {
      ttlSeconds: 60,
      retrySeconds: 10
    });

    const fresh = await loader('en');
    vi.advanceTimersByTime(61_000);
    const stale = await loader('en');
    await loader('en');

    expect(stale).toBe(fresh);
    expect(load).toHaveBeenCalledTimes(2);
    await expect(loader('da')).rejects.toThrow('upstream down');
  });
});
