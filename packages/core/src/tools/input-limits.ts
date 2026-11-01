import { QueryPlanError, type SelectionInput } from '@/query-plan';

export const MAX_QUERY_LENGTH = 200;
export const MAX_TABLE_ID_LENGTH = 200;
export const MAX_VALUE_FILTER_LENGTH = 100;
export const MAX_SELECTIONS = 30;
export const MAX_VALUES_PER_SELECTION = 5000;
export const MAX_VALUE_CODE_LENGTH = 200;

function checkLength(
  name: string,
  value: string,
  max: number,
  hint: string
): void {
  if (value.length > max) {
    throw new QueryPlanError(
      `${name} is too long (over ${max} characters). ${hint}`
    );
  }
}

function checkTableId(tableId: string): void {
  checkLength(
    'tableId',
    tableId,
    MAX_TABLE_ID_LENGTH,
    'Use the id exactly as search_tables returns it.'
  );
}

export function checkSearchInput(query: string): void {
  checkLength('query', query, MAX_QUERY_LENGTH, 'Use a few short keywords.');
}

export function checkMetadataInput(
  tableId: string,
  valueFilter: string | undefined
): void {
  checkTableId(tableId);
  if (valueFilter !== undefined) {
    checkLength(
      'valueFilter',
      valueFilter,
      MAX_VALUE_FILTER_LENGTH,
      'Use a short piece of a label.'
    );
  }
}

export function checkQueryInput(
  tableId: string,
  selections: SelectionInput[]
): void {
  checkTableId(tableId);
  if (selections.length > MAX_SELECTIONS) {
    throw new QueryPlanError(
      `Too many selections (over ${MAX_SELECTIONS}). Leave out variables you do not need.`
    );
  }
  for (const selection of selections) {
    const values = selection.values ?? [];
    if (values.length > MAX_VALUES_PER_SELECTION) {
      throw new QueryPlanError(
        `Too many values for "${selection.code}" (over ${MAX_VALUES_PER_SELECTION}). Select fewer values or use latest.`
      );
    }
    for (const value of values) {
      checkLength(
        'A value code',
        value,
        MAX_VALUE_CODE_LENGTH,
        'Use value codes exactly as get_table_metadata returns them.'
      );
    }
  }
}
