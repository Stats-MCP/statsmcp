import { describe, expect, it } from 'vitest';

import type { PxwebPreset } from '@/preset';
import type { PxwebClient } from '@/pxweb-client';
import { queryTable } from '@/tools/table-tools';

const preset: PxwebPreset = {
  name: 'test',
  title: 'Test statistics',
  version: '0.0.0',
  apiBaseUrl: 'https://stats.example/api',
  languages: ['en'],
  attribution: () => 'Source: Test office',
  tableUrl: (lang, tableId) => `https://stats.example/${lang}/${tableId}`,
  instructions: 'Test instructions.',
  maxCells: 5,
  searchLimit: 10
};

function clientReturning(rowCount: number): PxwebClient {
  return {
    search: async () => [],
    getMetadata: async () => ({
      title: 'Daily',
      variables: [
        {
          code: 'time',
          label: 'Time',
          values: ['2026-10-31'],
          valueLabels: ['2026-10-31'],
          eliminable: false,
          isTime: true,
          periodsIncomplete: true
        }
      ]
    }),
    query: async () => ({
      label: 'Daily',
      columns: ['Time', 'Value'],
      rows: Array.from({ length: rowCount }, (_, i) => [`d${i}`, i])
    })
  };
}

describe('queryTable', () => {
  it('refuses a result with more rows than the cell limit', async () => {
    const result = await queryTable(clientReturning(6), preset, {
      tableId: 'x',
      lang: 'en',
      selections: [{ code: 'time', latest: 5 }]
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining('above the limit of 5')
    });
  });

  it('returns a result within the limits', async () => {
    const result = await queryTable(clientReturning(3), preset, {
      tableId: 'x',
      lang: 'en',
      selections: [{ code: 'time', latest: 3 }]
    });

    expect(result.isError).toBeUndefined();
  });
});
