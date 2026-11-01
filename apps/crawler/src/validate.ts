import type { Snapshot } from '@statsmcp/core';

export const MAX_COUNT_DROP = 0.2;

export function snapshotProblems(
  next: Snapshot,
  previous?: Snapshot
): string[] {
  const problems: string[] = [];
  if (next.count === 0) problems.push('no tables');
  const ids = new Set(next.docs.map((doc) => doc.id));
  if (ids.size !== next.count) {
    problems.push(`${next.count - ids.size} duplicate table ids`);
  }
  if (previous && next.count < previous.count * (1 - MAX_COUNT_DROP)) {
    problems.push(
      `table count fell from ${previous.count} to ${next.count} (more than ${MAX_COUNT_DROP * 100} %)`
    );
  }
  return problems;
}
