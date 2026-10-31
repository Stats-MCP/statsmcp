import { z } from 'zod';

const categorySchema = z.object({
  index: z.union([z.record(z.string(), z.number()), z.array(z.string())]),
  label: z.record(z.string(), z.string()).optional()
});

export const jsonStatDatasetSchema = z.object({
  class: z.literal('dataset'),
  label: z.string().optional(),
  source: z.string().optional(),
  id: z.array(z.string()),
  size: z.array(z.number()),
  dimension: z.record(
    z.string(),
    z.object({ label: z.string().optional(), category: categorySchema })
  ),
  value: z.union([
    z.array(z.number().nullable()),
    z.record(z.string(), z.number().nullable())
  ])
});

export type JsonStatDataset = z.infer<typeof jsonStatDatasetSchema>;

export interface FlatTable {
  label: string | undefined;
  columns: string[];
  rows: (string | number | null)[][];
}

export function orderedCodes(
  index: Record<string, number> | string[]
): string[] {
  if (Array.isArray(index)) return index;
  return Object.entries(index)
    .toSorted(([, a], [, b]) => a - b)
    .map(([code]) => code);
}

export function flattenJsonStat(dataset: JsonStatDataset): FlatTable {
  if (dataset.id.length !== dataset.size.length) {
    throw new Error('JSON-stat id and size have different lengths.');
  }
  const dims = dataset.id.map((id, d) => {
    const dimension = dataset.dimension[id];
    if (!dimension) throw new Error(`JSON-stat dimension "${id}" is missing.`);
    const codes = orderedCodes(dimension.category.index);
    if (codes.length !== dataset.size[d]) {
      throw new Error(`JSON-stat dimension "${id}" does not match its size.`);
    }
    const labels = codes.map(
      (code) => dimension.category.label?.[code] ?? code
    );
    return { label: dimension.label ?? id, labels };
  });

  const total = dataset.size.reduce((product, size) => product * size, 1);
  const rows: (string | number | null)[][] = [];

  for (let flatIndex = 0; flatIndex < total; flatIndex++) {
    const row: (string | number | null)[] = [];
    let remainder = flatIndex;
    for (let d = dims.length - 1; d >= 0; d--) {
      const size = dataset.size[d] ?? 1;
      row[d] = dims[d]?.labels[remainder % size] ?? null;
      remainder = Math.floor(remainder / size);
    }
    const value = Array.isArray(dataset.value)
      ? dataset.value[flatIndex]
      : dataset.value[String(flatIndex)];
    row.push(value ?? null);
    rows.push(row);
  }

  return {
    label: dataset.label,
    columns: [...dims.map((dim) => dim.label), 'Value'],
    rows
  };
}

function csvCell(cell: string | number | null): string {
  if (cell === null) return '';
  const text = String(cell);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(table: FlatTable): string {
  return [table.columns, ...table.rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
}
