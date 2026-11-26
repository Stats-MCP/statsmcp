import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { statecPreset } from '@/preset';

describe('statecPreset', () => {
  it.each([
    ['fr', 'Source : STATEC (Luxembourg), CC0 1.0'],
    ['en', 'Source: STATEC (Luxembourg), CC0 1.0'],
    ['de', 'Source: STATEC (Luxembourg), CC0 1.0']
  ])(
    'attributes STATEC in %s with the CC0 and terms links',
    (lang, expected) => {
      expect(statecPreset.attribution(lang)).toContain(expected);
      expect(statecPreset.attribution(lang)).toContain(
        'https://creativecommons.org/publicdomain/zero/1.0/'
      );
      expect(statecPreset.attribution(lang)).toContain(
        'https://statistiques.public.lu/en/support/notice.html'
      );
    }
  );

  it.each([
    [
      'en',
      'https://lustat.statec.lu/vis?df[ds]=ds-release&df[id]=DSD_ECOICOP_PRIX%40DF_E5405&df[ag]=LU1&lc=en'
    ],
    [
      'fr',
      'https://lustat.statec.lu/vis?df[ds]=ds-release&df[id]=DSD_ECOICOP_PRIX%40DF_E5405&df[ag]=LU1&lc=fr'
    ]
  ])('links the %s Data Explorer page', (lang, expected) => {
    expect(statecPreset.tableUrl(lang, 'DSD_ECOICOP_PRIX@DF_E5405')).toBe(
      expected
    );
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: statecPreset.version });
  });
});
