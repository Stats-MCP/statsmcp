import { describe, expect, it } from 'vitest';

import { QueryPlanError } from '@/query-plan';
import {
  checkMetadataInput,
  checkQueryInput,
  checkSearchInput,
  MAX_QUERY_LENGTH,
  MAX_SELECTIONS,
  MAX_TABLE_ID_LENGTH,
  MAX_VALUE_CODE_LENGTH,
  MAX_VALUE_FILTER_LENGTH,
  MAX_VALUES_PER_SELECTION
} from '@/tools/input-limits';

const selection = (values: string[]) => ({ code: 'geo', values });

describe('input limits', () => {
  it.each([
    [
      'search query',
      (n: number) => checkSearchInput('a'.repeat(n)),
      MAX_QUERY_LENGTH
    ],
    [
      'metadata tableId',
      (n: number) => checkMetadataInput('a'.repeat(n), undefined),
      MAX_TABLE_ID_LENGTH
    ],
    [
      'valueFilter',
      (n: number) => checkMetadataInput('t', 'a'.repeat(n)),
      MAX_VALUE_FILTER_LENGTH
    ],
    [
      'query tableId',
      (n: number) => checkQueryInput('a'.repeat(n), []),
      MAX_TABLE_ID_LENGTH
    ],
    [
      'selection count',
      (n: number) =>
        checkQueryInput(
          't',
          Array.from({ length: n }, () => ({ code: 'geo' }))
        ),
      MAX_SELECTIONS
    ],
    [
      'values per selection',
      (n: number) =>
        checkQueryInput('t', [selection(Array.from({ length: n }, () => 'a'))]),
      MAX_VALUES_PER_SELECTION
    ],
    [
      'value code length',
      (n: number) => checkQueryInput('t', [selection(['a'.repeat(n)])]),
      MAX_VALUE_CODE_LENGTH
    ]
  ])('%s: passes at the limit and fails one over', (_name, check, max) => {
    expect(() => check(max)).not.toThrow();
    expect(() => check(max + 1)).toThrow(QueryPlanError);
  });
});
