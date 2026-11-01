import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { absPreset } from '@/preset';

describe('absPreset', () => {
  it('attributes the ABS under CC BY 4.0', () => {
    expect(absPreset.attribution('en')).toBe(
      'Source: Australian Bureau of Statistics (ABS), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)'
    );
  });

  it('links the table in the ABS Data Explorer', () => {
    expect(absPreset.tableUrl('en', 'CPI')).toBe(
      'https://dataexplorer.abs.gov.au/vis?df[ds]=ABS_ABS_TOPICS&df[id]=CPI&df[ag]=ABS'
    );
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: absPreset.version });
  });
});
