import { describe, expect, it } from 'vitest';

import { flattenJsonStat, toCsv, type JsonStatDataset } from '@/json-stat';

const dataset: JsonStatDataset = {
  class: 'dataset',
  label: 'Basic population groups by SEX and QUARTER',
  id: ['SPOL', 'ČETRTLETJE'],
  size: [2, 2],
  dimension: {
    SPOL: {
      label: 'SEX',
      category: {
        index: { '1': 0, '2': 1 },
        label: { '1': 'Men', '2': 'Women' }
      }
    },
    ČETRTLETJE: {
      label: 'QUARTER',
      category: { index: ['2026Q2', '2026Q3'] }
    }
  },
  value: [1075355, 1076765, 1061030, 1061986]
};

describe('flattenJsonStat', () => {
  it('maps values row-major with the last dimension varying fastest', () => {
    const table = flattenJsonStat(dataset);

    expect(table.columns).toEqual(['SEX', 'QUARTER', 'Value']);
    expect(table.rows).toEqual([
      ['Men', '2026Q2', 1075355],
      ['Men', '2026Q3', 1076765],
      ['Women', '2026Q2', 1061030],
      ['Women', '2026Q3', 1061986]
    ]);
  });

  it('fills missing sparse values with null', () => {
    const table = flattenJsonStat({ ...dataset, value: { '0': 5, '3': 7 } });

    expect(table.rows.map((row) => row[2])).toEqual([5, null, null, 7]);
  });
});

describe('toCsv', () => {
  it('quotes cells that contain commas or quotes', () => {
    const csv = toCsv({
      label: undefined,
      updated: undefined,
      columns: ['Region', 'Value'],
      rows: [
        ['Ljubljana, city', 1],
        ['The "east"', null]
      ]
    });

    expect(csv).toBe('Region,Value\n"Ljubljana, city",1\n"The ""east""",');
  });
});
