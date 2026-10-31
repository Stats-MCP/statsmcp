import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { sistatPreset } from '@/preset';

describe('sistatPreset', () => {
  it.each([
    ['sl', 'Vir: SURS'],
    ['en', 'Source: SURS'],
    ['de', 'Source: SURS']
  ])('attributes SURS as the source in %s', (lang, expected) => {
    expect(sistatPreset.attribution(lang)).toContain(expected);
  });

  it('links to the SiStat table page without the folder path', () => {
    expect(sistatPreset.tableUrl('en', 'folder/05A1002S.px')).toBe(
      'https://pxweb.stat.si/SiStatData/pxweb/en/Data/-/05A1002S.px'
    );
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: sistatPreset.version });
  });
});
