import type { TableMetadata, TableVariable } from '@/pxweb-client';

const FULL_LIST_MAX = 30;
const HEAD_COUNT = 10;
const TAIL_COUNT = 5;
const FILTER_MATCH_MAX = 50;

function formatValue(variable: TableVariable, index: number): string {
  const code = variable.values[index] ?? '';
  const label = variable.valueLabels[index] ?? code;
  return code === label ? code : `${code}=${label}`;
}

function formatValues(variable: TableVariable, valueFilter?: string): string {
  const indexes = variable.values.map((_, index) => index);

  if (valueFilter) {
    const needle = valueFilter.toLocaleLowerCase();
    const matches = indexes.filter((index) =>
      (variable.valueLabels[index] ?? '').toLocaleLowerCase().includes(needle)
    );
    if (!matches.length) return `  no values match "${valueFilter}"`;
    const shown = matches
      .slice(0, FILTER_MATCH_MAX)
      .map((index) => formatValue(variable, index))
      .join('; ');
    const hidden = matches.length - FILTER_MATCH_MAX;
    return hidden > 0 ? `  ${shown}; +${hidden} more matches` : `  ${shown}`;
  }

  if (indexes.length <= FULL_LIST_MAX) {
    return `  ${indexes.map((index) => formatValue(variable, index)).join('; ')}`;
  }

  const head = indexes.slice(0, HEAD_COUNT);
  const tail = indexes.slice(-TAIL_COUNT);
  const hidden = indexes.length - HEAD_COUNT - TAIL_COUNT;
  return `  ${head.map((index) => formatValue(variable, index)).join('; ')}; … ${hidden} more …; ${tail.map((index) => formatValue(variable, index)).join('; ')}`;
}

export function formatMetadata(
  tableId: string,
  metadata: TableMetadata,
  valueFilter?: string
): string {
  const prefix = `${tableId.split('/').at(-1)?.replace(/\.px$/i, '')}: `;
  const title = metadata.title.startsWith(prefix)
    ? metadata.title.slice(prefix.length)
    : metadata.title;
  const lines = [`Table ${tableId}: ${title}`];
  for (const variable of metadata.variables) {
    const flags = [
      `${variable.values.length} values`,
      variable.isTime ? 'time' : undefined,
      variable.eliminable ? 'optional' : 'required'
    ].filter(Boolean);
    lines.push(`- ${variable.code} "${variable.label}" (${flags.join(', ')})`);
    lines.push(formatValues(variable, valueFilter));
  }
  return lines.join('\n');
}
