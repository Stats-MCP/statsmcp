import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { onsPreset } from '@/preset';

describe('onsPreset', () => {
  it('attributes the ONS with the Open Government Licence link', () => {
    expect(onsPreset.attribution('en')).toBe(
      'Source: Office for National Statistics licensed under the Open Government Licence v.3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)'
    );
  });

  it('links an unresolved series to the ONS time series search', () => {
    expect(onsPreset.tableUrl('en', 'MM23/D7G7')).toBe(
      'https://www.ons.gov.uk/search?q=D7G7&filter=time_series'
    );
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: onsPreset.version });
  });
});
