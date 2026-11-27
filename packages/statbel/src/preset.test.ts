import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { statbelPreset } from '@/preset';

describe('statbelPreset', () => {
  it.each([
    ['nl', 'Bron: Statbel, CC BY 4.0'],
    ['fr', 'Source : Statbel, CC BY 4.0'],
    ['en', 'Source: Statbel, CC BY 4.0'],
    ['de', 'Source: Statbel, CC BY 4.0']
  ])('attributes Statbel in %s with the licence link', (lang, expected) => {
    expect(statbelPreset.attribution(lang)).toBe(
      `${expected} (https://statbel.fgov.be/en/cc-40)`
    );
  });

  it('links the view page', () => {
    expect(
      statbelPreset.tableUrl('en', '86586e27-90ac-47c6-87ce-64b63194e605')
    ).toBe(
      'https://bestat.statbel.fgov.be/bestat/crosstable.xhtml?view=86586e27-90ac-47c6-87ce-64b63194e605'
    );
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: statbelPreset.version });
  });
});
