import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { kasPreset } from '@/preset';

describe('kasPreset', () => {
  it.each([
    ['sq', 'Burimi: Agjencia e Statistikave të Kosovës (ASK)'],
    ['en', 'Source: Kosovo Agency of Statistics (KAS)'],
    ['de', 'Source: Kosovo Agency of Statistics (KAS)']
  ])('attributes KAS in %s with its website', (lang, expected) => {
    expect(kasPreset.attribution(lang)).toContain(expected);
    expect(kasPreset.attribution(lang)).toContain('https://ask.rks-gov.net');
  });

  it.each([
    [
      'en',
      'https://askdata.rks-gov.net/pxweb/en/ASKdata/ASKdata__Prices__Consumer%20Price%20Index__Monthly%20indicators/cpi08.px/'
    ],
    [
      'sq',
      'https://askdata.rks-gov.net/pxweb/sq/ASKdata/ASKdata__Prices__Consumer%20Price%20Index__Monthly%20indicators/cpi08.px/'
    ]
  ])('links the %s table page', (lang, expected) => {
    expect(
      kasPreset.tableUrl(
        lang,
        'Prices/Consumer Price Index/Monthly indicators/cpi08.px'
      )
    ).toBe(expected);
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: kasPreset.version });
  });
});
