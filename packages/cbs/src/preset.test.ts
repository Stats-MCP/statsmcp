import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { cbsPreset } from '@/preset';

describe('cbsPreset', () => {
  it.each([
    ['nl', 'Bron: CBS, CC BY 4.0'],
    ['en', 'Source: Statistics Netherlands (CBS), CC BY 4.0'],
    ['de', 'Source: Statistics Netherlands (CBS), CC BY 4.0']
  ])('attributes CBS in %s', (lang, expected) => {
    expect(cbsPreset.attribution(lang)).toContain(expected);
  });

  it.each([
    ['en', '86141ENG', 'https://www.cbs.nl/en-gb/figures/detail/86141ENG'],
    ['nl', '86141NED', 'https://www.cbs.nl/nl-nl/cijfers/detail/86141NED']
  ])('links %s table %s to %s', (lang, tableId, expected) => {
    expect(cbsPreset.tableUrl(lang, tableId)).toBe(expected);
  });

  it('uses the CBS OData API', () => {
    expect(cbsPreset.api).toBe('cbs-odata');
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: cbsPreset.version });
  });
});
