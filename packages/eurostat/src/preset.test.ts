import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { eurostatPreset } from '@/preset';

describe('eurostatPreset', () => {
  it.each([
    ['en', 'Source: Eurostat'],
    ['de', 'Quelle: Eurostat'],
    ['fr', 'Source : Eurostat'],
    ['sl', 'Source: Eurostat']
  ])('attributes Eurostat in %s', (lang, expected) => {
    expect(eurostatPreset.attribution(lang)).toContain(expected);
  });

  it('links a dataset to the Eurostat data browser in the asked language', () => {
    expect(eurostatPreset.tableUrl('de', 'prc_hicp_minr')).toBe(
      'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table?lang=de'
    );
  });

  it('uses the Eurostat API', () => {
    expect(eurostatPreset.api).toBe('eurostat');
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: eurostatPreset.version });
  });
});
