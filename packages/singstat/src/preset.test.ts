import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { singstatPreset } from '@/preset';

describe('singstatPreset', () => {
  it('names SingStat and links the Singapore Open Data Licence', () => {
    expect(singstatPreset.attribution('en')).toContain(
      'SingStat Table Builder'
    );
    expect(singstatPreset.attribution('en')).toContain(
      'https://data.gov.sg/open-data-licence'
    );
  });

  it('links a table to its Table Builder page', () => {
    expect(singstatPreset.tableUrl('en', 'M213751')).toBe(
      'https://tablebuilder.singstat.gov.sg/table/TS/M213751'
    );
  });

  it('uses the SingStat API', () => {
    expect(singstatPreset.api).toBe('singstat');
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: singstatPreset.version });
  });
});
