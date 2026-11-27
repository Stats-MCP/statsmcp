import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { bdlPreset } from '@/preset';

describe('bdlPreset', () => {
  it.each([
    [
      'pl',
      'Źródło: Główny Urząd Statystyczny, Bank Danych Lokalnych (licencja CC BY 4.0, https://creativecommons.org/licenses/by/4.0/deed.pl)'
    ],
    [
      'en',
      'Source: Statistics Poland, Local Data Bank (licensed under CC BY 4.0, https://creativecommons.org/licenses/by/4.0/)'
    ]
  ])(
    'attributes Statistics Poland in %s with the CC BY 4.0 link',
    (lang, expected) => {
      expect(bdlPreset.attribution(lang)).toBe(expected);
    }
  );

  it('links the BDL subject page by the subject number', () => {
    expect(bdlPreset.tableUrl('en', 'P3559')).toBe(
      'https://bdl.stat.gov.pl/bdl/dane/podgrup/temat/0/0/3559'
    );
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: bdlPreset.version });
  });
});
