import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { asubPreset } from '@/preset';

describe('asubPreset', () => {
  it.each([
    ['sv', 'Källa: ÅSUB, CC BY 4.0'],
    ['en', 'Source: Statistics and Research Åland (ÅSUB), CC BY 4.0'],
    ['de', 'Source: Statistics and Research Åland (ÅSUB), CC BY 4.0']
  ])('attributes ÅSUB in %s with the terms link', (lang, expected) => {
    expect(asubPreset.attribution(lang)).toContain(expected);
    expect(asubPreset.attribution(lang)).toContain(
      'https://www.asub.ax/sv/om-asub/om-asubax/anvandarvillkor'
    );
  });

  it.each([
    [
      'en',
      'KO/KO011.px',
      'https://pxweb.asub.ax/PXWeb/pxweb/en/Statistik/Statistik__KO/KO011.px/'
    ],
    [
      'sv',
      'BE/Befolkningens storlek och struktur/BE004.px',
      'https://pxweb.asub.ax/PXWeb/pxweb/sv/Statistik/Statistik__BE__Befolkningens%20storlek%20och%20struktur/BE004.px/'
    ]
  ])('links %s table %s to its page', (lang, tableId, expected) => {
    expect(asubPreset.tableUrl(lang, tableId)).toBe(expected);
  });

  it.each([
    ['/KO/Avslutade', true],
    ['/TUTRSJ/TU/Inkvartering/Avslutade tidsserier', true],
    ['/KO', false]
  ])('treats a table in %s as archived: %s', (path, archived) => {
    expect(
      asubPreset.isArchived?.({ id: 'KO008.px', title: 'CPI', path })
    ).toBe(archived);
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: asubPreset.version });
  });
});
