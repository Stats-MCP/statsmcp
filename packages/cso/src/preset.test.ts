import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { csoPreset } from '@/preset';

describe('csoPreset', () => {
  it('attributes the CSO under CC BY 4.0 in every language', () => {
    expect(csoPreset.attribution('en')).toBe(
      'Source: Central Statistics Office, Ireland, CC BY 4.0 (https://www.cso.ie/en/aboutus/whoweare/copyrightpolicy/)'
    );
  });

  it('links the table page that the CSO itself links', () => {
    expect(csoPreset.tableUrl('en', 'CPM20')).toBe(
      'https://data.cso.ie/table/CPM20'
    );
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: csoPreset.version });
  });
});
