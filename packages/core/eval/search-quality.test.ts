import { readFileSync, writeFileSync } from 'node:fs';

import { loadDocs, loadGoldenSets, type EvalDoc } from '@eval/golden';
import { meanScores, scoreQuery, type QueryScores } from '@eval/metrics';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createTableIndex } from '@/table-index';

const CURRENT_YEAR = 2026;

/** The engine under test: the BM25 table index over the fixture catalogue. */
function search(
  docs: readonly EvalDoc[],
  query: string,
  lang: string
): string[] {
  const index =
    indexes.get(docs) ??
    createTableIndex(docs, lang, { currentYear: CURRENT_YEAR });
  indexes.set(docs, index);
  return index.search(query).map((hit) => hit.tableId);
}

const indexes = new WeakMap<
  readonly EvalDoc[],
  ReturnType<typeof createTableIndex>
>();

const scoresSchema = z.object({
  mrr: z.number(),
  ndcg: z.number(),
  recall: z.number(),
  success3: z.number()
});
const floorsUrl = new URL('./floors.json', import.meta.url);
const floors = z
  .record(z.string(), scoresSchema)
  .parse(JSON.parse(readFileSync(floorsUrl, 'utf8')));
const MIN_QUERIES = 8;

describe('search quality on the golden sets', () => {
  const sets = loadGoldenSets();
  const report: Record<string, QueryScores> = {};

  it('has a golden set for every floor and a judged best table for every query', () => {
    const keys = sets.map((set) => `${set.source}-${set.lang}`);
    expect(sets.length).toBeGreaterThan(0);
    expect(Object.keys(floors).toSorted()).toEqual(keys.toSorted());
    for (const set of sets) {
      expect(set.queries.length).toBeGreaterThanOrEqual(MIN_QUERIES);
      const withoutBest = set.queries
        .filter((item) => !Object.values(item.relevant).includes(2))
        .map((item) => item.query);
      expect(withoutBest).toEqual([]);
    }
  });

  it.each(sets.map((set) => [`${set.source}-${set.lang}`, set] as const))(
    '%s stays at or above its floor',
    (key, set) => {
      const docs = loadDocs(set.source, set.lang);
      const scores = meanScores(
        set.queries.map((item) =>
          scoreQuery(search(docs, item.query, set.lang), item.relevant)
        )
      );
      report[key] = scores;
      if (process.env.UPDATE_FLOORS) return;
      const floor = floors[key];
      expect(floor, `no floor for ${key}`).toBeDefined();
      for (const metric of ['mrr', 'ndcg', 'recall', 'success3'] as const) {
        expect(scores[metric], `${key} ${metric}`).toBeGreaterThanOrEqual(
          (floor?.[metric] ?? 1) - 1e-9
        );
      }
    }
  );

  afterAll(() => {
    // Write only a complete run, so a filtered or failed run cannot drop floors.
    if (
      !process.env.UPDATE_FLOORS ||
      Object.keys(report).length !== sets.length
    )
      return;
    writeFileSync(floorsUrl, `${JSON.stringify(report, null, 2)}\n`);
  });
});
