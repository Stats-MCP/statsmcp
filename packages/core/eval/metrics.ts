/** Graded judgements for one query: table id → 2 (best) or 1 (acceptable). */
export type Judgements = Readonly<Record<string, number>>;

export interface QueryScores {
  mrr: number;
  ndcg: number;
  recall: number;
  success3: number;
}

const CUTOFF = 10;

function dcg(gains: number[]): number {
  return gains.reduce(
    (sum, gain, index) => sum + (2 ** gain - 1) / Math.log2(index + 2),
    0
  );
}

/** Standard IR metrics at 10 (Success at 3) for one ranked list of table ids. */
export function scoreQuery(
  ranked: readonly string[],
  relevant: Judgements
): QueryScores {
  const top = [...new Set(ranked)].slice(0, CUTOFF);
  const grades = top.map((id) => relevant[id] ?? 0);
  const firstHit = grades.findIndex((grade) => grade > 0);
  const ideal = Object.values(relevant)
    .toSorted((a, b) => b - a)
    .slice(0, CUTOFF);
  const relevantCount = Object.values(relevant).filter(
    (grade) => grade > 0
  ).length;
  return {
    mrr: firstHit < 0 ? 0 : 1 / (firstHit + 1),
    ndcg: dcg(ideal) === 0 ? 0 : dcg(grades) / dcg(ideal),
    recall:
      relevantCount === 0
        ? 0
        : grades.filter((grade) => grade > 0).length / relevantCount,
    success3: grades.slice(0, 3).some((grade) => grade === 2) ? 1 : 0
  };
}

export function meanScores(scores: readonly QueryScores[]): QueryScores {
  const mean = (key: keyof QueryScores) =>
    scores.length === 0
      ? 0
      : scores.reduce((sum, score) => sum + score[key], 0) / scores.length;
  return {
    mrr: mean('mrr'),
    ndcg: mean('ndcg'),
    recall: mean('recall'),
    success3: mean('success3')
  };
}
