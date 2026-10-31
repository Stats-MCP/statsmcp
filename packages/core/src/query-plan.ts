import type {
  PxwebSelection,
  TableMetadata,
  TableVariable
} from '@/pxweb-client';

export interface SelectionInput {
  code: string;
  values?: string[] | undefined;
  latest?: number | undefined;
}

export interface QueryPlan {
  selections: PxwebSelection[];
  cells: number;
  estimatedChars: number;
}

export const DEFAULT_MAX_RESULT_CHARS = 30_000;
const VALUE_CHARS = 10;
const CHARS_PER_TOKEN = 3.5;

function averageLabelLength(
  variable: TableVariable,
  values: readonly string[]
): number {
  if (values.length === 0) return 0;
  const labels = new Map(
    variable.values.map((value, index) => [value, variable.valueLabels[index]])
  );
  const total = values.reduce(
    (sum, value) => sum + (labels.get(value) ?? value).length,
    0
  );
  return total / values.length;
}

export class QueryPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryPlanError';
  }
}

const MAX_LISTED_CODES = 10;

function listCodes(codes: string[]): string {
  const shown = codes.slice(0, MAX_LISTED_CODES).join(', ');
  return codes.length > MAX_LISTED_CODES
    ? `${shown} (+${codes.length - MAX_LISTED_CODES} more)`
    : shown;
}

/**
 * PxWeb aggregates an omitted eliminable variable into one total and returns
 * every value of an omitted non-eliminable one, so both count toward cells.
 */
export function planQuery(
  metadata: TableMetadata,
  inputs: SelectionInput[],
  maxCells: number,
  maxResultChars: number = DEFAULT_MAX_RESULT_CHARS
): QueryPlan {
  const byCode = new Map(metadata.variables.map((v) => [v.code, v]));
  const inputByCode = new Map<string, SelectionInput>();

  for (const input of inputs) {
    if (!byCode.has(input.code)) {
      throw new QueryPlanError(
        `Unknown variable "${input.code}". Valid codes: ${listCodes([...byCode.keys()])}.`
      );
    }
    if (inputByCode.has(input.code)) {
      throw new QueryPlanError(
        `Variable "${input.code}" is selected more than once.`
      );
    }
    const hasValues = input.values !== undefined;
    const hasLatest = input.latest !== undefined;
    if (hasValues === hasLatest) {
      throw new QueryPlanError(
        `Variable "${input.code}": give either values or latest.`
      );
    }
    if (input.values?.length === 0) {
      throw new QueryPlanError(
        `Variable "${input.code}": values is empty. Leave the variable out instead.`
      );
    }
    inputByCode.set(input.code, {
      ...input,
      values: input.values && [...new Set(input.values)]
    });
  }

  const selections: PxwebSelection[] = [];
  const sizes: { label: string; count: number; labelChars: number }[] = [];

  for (const variable of metadata.variables) {
    const input = inputByCode.get(variable.code);

    if (input?.latest !== undefined) {
      const count = Math.min(input.latest, variable.values.length);
      selections.push({
        code: variable.code,
        selection: { filter: 'top', values: [String(count)] }
      });
      sizes.push({
        label: variable.label,
        count,
        labelChars: averageLabelLength(variable, variable.values.slice(-count))
      });
      continue;
    }

    if (input?.values?.length) {
      const known = new Set(variable.values);
      const unknown = input.values.filter((value) => !known.has(value));
      if (unknown.length) {
        throw new QueryPlanError(
          `Variable "${variable.code}" has no values ${listCodes(unknown)}. Call get_table_metadata to see valid value codes.`
        );
      }
      selections.push({
        code: variable.code,
        selection: { filter: 'item', values: input.values }
      });
      sizes.push({
        label: variable.label,
        count: input.values.length,
        labelChars: averageLabelLength(variable, input.values)
      });
      continue;
    }

    if (variable.eliminable) continue;

    selections.push({
      code: variable.code,
      selection: { filter: 'all', values: ['*'] }
    });
    sizes.push({
      label: variable.label,
      count: variable.values.length,
      labelChars: averageLabelLength(variable, variable.values)
    });
  }

  const cells = sizes.reduce((product, size) => product * size.count, 1);
  const largest = sizes
    .toSorted((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((size) => `${size.label} (${size.count} values)`)
    .join(', ');
  if (cells > maxCells) {
    throw new QueryPlanError(
      `The query would return ${cells} cells, above the limit of ${maxCells}. Select fewer values for ${largest}.`
    );
  }

  const rowChars = sizes.reduce(
    (sum, size) => sum + size.labelChars + 1,
    VALUE_CHARS
  );
  const estimatedChars = Math.round(cells * rowChars);
  if (estimatedChars > maxResultChars) {
    const tokens = Math.round(estimatedChars / CHARS_PER_TOKEN);
    throw new QueryPlanError(
      `The result would be about ${estimatedChars} characters (about ${tokens} tokens), above the limit of ${maxResultChars}. Select fewer values for ${largest}.`
    );
  }

  return { selections, cells, estimatedChars };
}
