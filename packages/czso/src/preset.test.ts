import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { czsoPreset } from '@/preset';

describe('czsoPreset', () => {
  it.each([
    [
      'cs',
      'Zdroj: Český statistický úřad, CC BY 4.0 (https://csu.gov.cz/podminky_pro_vyuzivani_a_dalsi_zverejnovani_statistickych_udaju_csu)'
    ],
    [
      'en',
      'Source: Czech Statistical Office (CZSO), CC BY 4.0 (https://csu.gov.cz/conditions_for_use_and_further_dissemination)'
    ],
    [
      'de',
      'Source: Czech Statistical Office (CZSO), CC BY 4.0 (https://csu.gov.cz/conditions_for_use_and_further_dissemination)'
    ]
  ])('attributes the CZSO in %s with the terms link', (lang, expected) => {
    expect(czsoPreset.attribution(lang)).toBe(expected);
  });

  it('links the dataset page', () => {
    expect(czsoPreset.tableUrl('en', 'CEN0101H')).toBe(
      'https://data.csu.gov.cz/datastat/info/SADA/CEN0101H'
    );
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: czsoPreset.version });
  });
});
