import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { dstPreset } from '@/preset';

describe('dstPreset', () => {
  it.each([
    ['da', 'Kilde: Danmarks Statistik, CC BY 4.0'],
    ['en', 'Source: Statistics Denmark, CC BY 4.0'],
    ['de', 'Source: Statistics Denmark, CC BY 4.0']
  ])('attributes Statistics Denmark in %s', (lang, expected) => {
    expect(dstPreset.attribution(lang)).toContain(expected);
  });

  it.each([
    ['en', 'https://www.statbank.dk/PRIS01'],
    ['da', 'https://www.statistikbanken.dk/PRIS01']
  ])('links %s table PRIS01 to %s', (lang, expected) => {
    expect(dstPreset.tableUrl(lang, 'PRIS01')).toBe(expected);
  });

  it('uses the StatBank API', () => {
    expect(dstPreset.api).toBe('statbank-dk');
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: dstPreset.version });
  });
});
