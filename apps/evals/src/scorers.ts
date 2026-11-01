import type { EvalCase } from '@/dataset';

export interface TaskOutput {
  toolName: string | null;
  args: Record<string, unknown> | null;
}

/** `passed: null` means the scorer does not apply to the case; rates leave it out. */
export interface Score {
  name: string;
  passed: boolean | null;
  reason?: string;
}

export const SCORER_NAMES = ['tool', 'lang', 'keywords', 'short', 'tableId'];

/** A search query longer than this reads as a full question, not keywords. */
const MAX_QUERY_WORDS = 6;

function stringArg(output: TaskOutput, key: string): string | undefined {
  const value = output.args?.[key];
  return typeof value === 'string' ? value : undefined;
}

function result(name: string, passed: boolean, reason: string): Score {
  return passed ? { name, passed } : { name, passed, reason };
}

export function toolMatch(item: EvalCase, output: TaskOutput): Score {
  return result(
    'tool',
    output.toolName === item.expected.tool,
    `expected ${item.expected.tool}, got ${output.toolName ?? 'no tool call'}`
  );
}

/** The tools default to the first language, so a missing lang counts as that one. */
export function langMatch(
  item: EvalCase,
  output: TaskOutput,
  defaultLang: string
): Score {
  const expected = item.expected.lang;
  if (!expected) return { name: 'lang', passed: null };
  if (output.toolName === null) {
    return result('lang', false, 'no tool call');
  }
  const actual = stringArg(output, 'lang') ?? defaultLang;
  return result(
    'lang',
    actual === expected,
    `expected lang ${expected}, got ${actual}`
  );
}

export function queryKeywords(item: EvalCase, output: TaskOutput): Score {
  const words = item.expected.queryAny;
  if (!words?.length) return { name: 'keywords', passed: null };
  const query = (stringArg(output, 'query') ?? '').toLocaleLowerCase();
  return result(
    'keywords',
    words.some((word) => query.includes(word)),
    `query "${query}" has none of ${words.join(', ')}`
  );
}

export function shortQuery(item: EvalCase, output: TaskOutput): Score {
  if (item.expected.tool !== 'search_tables') {
    return { name: 'short', passed: null };
  }
  const query = stringArg(output, 'query') ?? '';
  const count = query.split(/\s+/).filter(Boolean).length;
  return result(
    'short',
    count > 0 && count <= MAX_QUERY_WORDS,
    `query has ${count} words`
  );
}

export function tableIdMatch(item: EvalCase, output: TaskOutput): Score {
  const expected = item.expected.tableId;
  if (!expected) return { name: 'tableId', passed: null };
  const actual = stringArg(output, 'tableId');
  return result(
    'tableId',
    actual === expected,
    `expected ${expected}, got ${actual ?? 'none'}`
  );
}

export function scoreCase(
  item: EvalCase,
  output: TaskOutput,
  defaultLang: string
): Score[] {
  return [
    toolMatch(item, output),
    langMatch(item, output, defaultLang),
    queryKeywords(item, output),
    shortQuery(item, output),
    tableIdMatch(item, output)
  ];
}

/** Share of the applicable cases that passed. */
export function passRate(scores: readonly Score[]): number {
  const applicable = scores.filter((score) => score.passed !== null);
  if (applicable.length === 0) return 1;
  return applicable.filter((score) => score.passed).length / applicable.length;
}
