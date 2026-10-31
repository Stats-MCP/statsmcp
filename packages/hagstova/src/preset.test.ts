import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { hagstovaPreset } from '@/preset';

describe('hagstovaPreset', () => {
  it.each([
    ['fo', 'Kelda: Hagstova Føroya, CC BY 4.0'],
    ['en', 'Source: Statistics Faroe Islands, CC BY 4.0'],
    ['de', 'Source: Statistics Faroe Islands, CC BY 4.0']
  ])('attributes Statistics Faroe Islands in %s', (lang, expected) => {
    expect(hagstovaPreset.attribution(lang)).toContain(expected);
    expect(hagstovaPreset.attribution(lang)).toContain(
      'https://hagstova.fo/en/terms-use'
    );
  });

  it.each([
    [
      'en',
      'IP/IP02/pris_alt_t.px',
      'https://statbank.hagstova.fo/pxweb/en/H2/H2__IP__IP02/pris_alt_t.px/'
    ],
    [
      'fo',
      'IB/IB08/fo_sogtol.px',
      'https://statbank.hagstova.fo/pxweb/fo/H2/H2__IB__IB08/fo_sogtol.px/'
    ]
  ])('links %s table %s to %s', (lang, tableId, expected) => {
    expect(hagstovaPreset.tableUrl(lang, tableId)).toBe(expected);
  });

  it.each([
    ['IP02011 Consumer price index (2001M02–2024M02) - discontinued', true],
    ['IP02011 Brúkaraprístalið (2001M02–2024M02) - endað', true],
    [
      'IP02006 Consumer price index, by commodity groups (2001M02-2026M08)',
      false
    ],
    ['VV01 Discontinued operations by sector', false]
  ])('treats "%s" as archived: %s', (title, archived) => {
    expect(hagstovaPreset.isArchived?.({ id: 'x.px', title })).toBe(archived);
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: hagstovaPreset.version });
  });
});
