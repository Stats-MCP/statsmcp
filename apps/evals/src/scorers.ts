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

export const SCORER_NAMES = [
  'tool',
  'country',
  'lang',
  'keywords',
  'short',
  'tableId'
];

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
  const accepted = [item.expected.tool].flat();
  return result(
    'tool',
    accepted.some((tool) => tool === output.toolName),
    `expected ${accepted.join(' or ')}, got ${output.toolName ?? 'no tool call'}`
  );
}

function chosenLang(output: TaskOutput, defaultLang: string): string {
  return stringArg(output, 'lang') ?? defaultLang;
}

/**
 * Any accepted language passes; a missing lang counts as the endpoint's default.
 * On the all-countries endpoint the language must also exist for the chosen country.
 */
export function langMatch(
  item: EvalCase,
  output: TaskOutput,
  defaultLang: string,
  countryLanguages?: readonly string[]
): Score {
  const accepted = Object.keys(item.expected.keywords ?? {});
  if (accepted.length === 0) return { name: 'lang', passed: null };
  if (output.toolName === null) {
    return result('lang', false, 'no tool call');
  }
  const actual = chosenLang(output, defaultLang);
  const offered = countryLanguages ? countryLanguages.includes(actual) : true;
  return result(
    'lang',
    accepted.includes(actual) && offered,
    `expected lang ${accepted.join(' or ')}${offered ? '' : ' offered by the country'}, got ${actual}`
  );
}

/** Uses the keywords of the language the model chose, or all keywords if that language is not accepted. */
export function queryKeywords(
  item: EvalCase,
  output: TaskOutput,
  defaultLang: string
): Score {
  const keywords = item.expected.keywords;
  if (!keywords) return { name: 'keywords', passed: null };
  const words =
    keywords[chosenLang(output, defaultLang)] ?? Object.values(keywords).flat();
  const query = (stringArg(output, 'query') ?? '').toLocaleLowerCase();
  return result(
    'keywords',
    words.some((word) => query.includes(word)),
    `query "${query}" has none of ${words.join(', ')}`
  );
}

export function shortQuery(item: EvalCase, output: TaskOutput): Score {
  const searchExpected = [item.expected.tool].flat().includes('search_tables');
  if (!searchExpected || output.toolName === 'list_countries') {
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

export function countryMatch(item: EvalCase, output: TaskOutput): Score {
  const accepted = item.expected.countries;
  if (!accepted) return { name: 'country', passed: null };
  const actual = stringArg(output, 'country');
  return result(
    'country',
    actual !== undefined && accepted.includes(actual),
    `expected country ${accepted.join(' or ')}, got ${actual ?? 'none'}`
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
  defaultLang: string,
  countryLanguages?: readonly string[]
): Score[] {
  return [
    toolMatch(item, output),
    countryMatch(item, output),
    langMatch(item, output, defaultLang, countryLanguages),
    queryKeywords(item, output, defaultLang),
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
