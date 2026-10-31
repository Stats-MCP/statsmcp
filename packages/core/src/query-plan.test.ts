import { describe, expect, it } from 'vitest';

import type { TableMetadata } from '@/pxweb-client';
import { planQuery, QueryPlanError } from '@/query-plan';

const metadata: TableMetadata = {
  title: 'Population',
  variables: [
    {
      code: 'SPOL',
      label: 'SEX',
      values: ['0', '1', '2'],
      valueLabels: ['Total', 'Men', 'Women'],
      eliminable: true,
      isTime: false
    },
    {
      code: 'OBČINE',
      label: 'MUNICIPALITIES',
      values: Array.from({ length: 212 }, (_, i) => String(i)),
      valueLabels: Array.from({ length: 212 }, (_, i) => `M${i}`),
      eliminable: true,
      isTime: false
    },
    {
      code: 'LETO',
      label: 'YEAR',
      values: ['2023', '2024', '2025'],
      valueLabels: ['2023', '2024', '2025'],
      eliminable: false,
      isTime: true
    }
  ]
};

describe('planQuery', () => {
  it('drops omitted optional variables and returns every value of omitted required ones', () => {
    const plan = planQuery(metadata, [], 1000);

    expect(plan.selections).toEqual([
      { code: 'LETO', selection: { filter: 'all', values: ['*'] } }
    ]);
    expect(plan.cells).toBe(3);
  });

  it('counts item and latest selections toward cells', () => {
    const plan = planQuery(
      metadata,
      [
        { code: 'SPOL', values: ['1', '2'] },
        { code: 'LETO', latest: 2 }
      ],
      1000
    );

    expect(plan.selections).toEqual([
      { code: 'SPOL', selection: { filter: 'item', values: ['1', '2'] } },
      { code: 'LETO', selection: { filter: 'top', values: ['2'] } }
    ]);
    expect(plan.cells).toBe(4);
  });

  it.each([
    [
      'an unknown variable',
      [{ code: 'NOPE', values: ['1'] }],
      /Unknown variable "NOPE"/
    ],
    ['an unknown value', [{ code: 'SPOL', values: ['9'] }], /has no values 9/],
    [
      'values and latest together',
      [{ code: 'LETO', values: ['2024'], latest: 1 }],
      /either values or latest/
    ],
    [
      'a variable selected twice',
      [
        { code: 'SPOL', values: ['1'] },
        { code: 'SPOL', values: ['2'] }
      ],
      /more than once/
    ],
    ['an empty values list', [{ code: 'SPOL', values: [] }], /values is empty/],
    [
      'an entry with neither values nor latest',
      [{ code: 'SPOL' }],
      /either values or latest/
    ]
  ])('rejects %s', (_, inputs, message) => {
    expect(() => planQuery(metadata, inputs, 1000)).toThrow(message);
  });

  it('rejects queries above the cell cap and names the largest variable', () => {
    const allMunicipalities = metadata.variables[1]?.values ?? [];

    expect(() =>
      planQuery(metadata, [{ code: 'OBČINE', values: allMunicipalities }], 500)
    ).toThrow(
      new QueryPlanError(
        'The query would return 636 cells, above the limit of 500. Select fewer values for MUNICIPALITIES (212 values), YEAR (3 values).'
      )
    );
  });

  it('clamps latest to the number of values and keeps required variables when others are selected', () => {
    const plan = planQuery(
      metadata,
      [{ code: 'SPOL', values: ['1', '1', '2'] }],
      1000
    );

    expect(plan.selections).toEqual([
      { code: 'SPOL', selection: { filter: 'item', values: ['1', '2'] } },
      { code: 'LETO', selection: { filter: 'all', values: ['*'] } }
    ]);
    expect(
      planQuery(metadata, [{ code: 'LETO', latest: 99 }], 1000).cells
    ).toBe(3);
  });

  it('refuses a result that would be too large for the context and names the largest variables', () => {
    const query = [
      { code: 'OBČINE', values: metadata.variables[1]?.values ?? [] }
    ];

    expect(() => planQuery(metadata, query, 5000, 2000)).toThrow(
      /about \d+ characters \(about \d+ tokens\), above the limit of 2000\. Select fewer values for MUNICIPALITIES \(212 values\)/
    );
  });

  it('estimates the result size from the selected labels', () => {
    const plan = planQuery(metadata, [{ code: 'SPOL', values: ['1'] }], 1000);

    expect(plan.estimatedChars).toBe(3 * (3 + 1 + 4 + 1 + 10));
  });

  it('estimates latest periods from the last labels', () => {
    const plan = planQuery(metadata, [{ code: 'LETO', latest: 1 }], 1000);

    expect(plan.estimatedChars).toBe(4 + 1 + 10);
  });
});
