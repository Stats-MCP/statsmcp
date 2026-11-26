import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { bnsPreset } from '@/preset';

describe('bnsPreset', () => {
  it.each([
    [
      'ro',
      'Sursa: Biroul Național de Statistică al Republicii Moldova, CC BY 4.0'
    ],
    [
      'en',
      'Source: National Bureau of Statistics of the Republic of Moldova, CC BY 4.0'
    ],
    [
      'de',
      'Source: National Bureau of Statistics of the Republic of Moldova, CC BY 4.0'
    ]
  ])('attributes the NBS in %s with the terms link', (lang, expected) => {
    expect(bnsPreset.attribution(lang)).toContain(expected);
    expect(bnsPreset.attribution(lang)).toContain(
      'https://statistica.gov.md/en/copyright-139.html'
    );
  });

  it.each([
    [
      'en',
      'https://statbank.statistica.md/PxWeb/pxweb/en/20%20Populatia%20si%20procesele%20demografice/20%20Populatia%20si%20procesele%20demografice__POP010__POPst/POP010100.px/'
    ],
    [
      'ro',
      'https://statbank.statistica.md/PxWeb/pxweb/ro/20%20Populatia%20si%20procesele%20demografice/20%20Populatia%20si%20procesele%20demografice__POP010__POPst/POP010100.px/'
    ]
  ])('links the %s table page', (lang, expected) => {
    expect(
      bnsPreset.tableUrl(
        lang,
        '20 Populatia si procesele demografice/POP010/POPst/POP010100.px'
      )
    ).toBe(expected);
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: bnsPreset.version });
  });
});
