import { meanScores, scoreQuery } from '@eval/metrics';
import { describe, expect, it } from 'vitest';

describe('scoreQuery', () => {
  it('scores a ranking against graded judgements', () => {
    const scores = scoreQuery(['x', 'b', 'a', 'b'], { a: 2, b: 1 });

    const dcg = 1 / Math.log2(3) + 3 / Math.log2(4);
    const ideal = 3 / Math.log2(2) + 1 / Math.log2(3);
    expect(scores.mrr).toBe(0.5);
    expect(scores.ndcg).toBeCloseTo(dcg / ideal, 10);
    expect(scores.recall).toBe(1);
    expect(scores.success3).toBe(1);
  });

  it('gives zero when nothing relevant is found', () => {
    expect(scoreQuery(['x', 'y'], { a: 2 })).toEqual({
      mrr: 0,
      ndcg: 0,
      recall: 0,
      success3: 0
    });
  });

  it('averages scores and handles an empty list', () => {
    expect(meanScores([])).toEqual({ mrr: 0, ndcg: 0, recall: 0, success3: 0 });
    expect(
      meanScores([
        { mrr: 1, ndcg: 1, recall: 1, success3: 1 },
        { mrr: 0, ndcg: 0, recall: 0, success3: 0 }
      ]).mrr
    ).toBe(0.5);
  });
});
