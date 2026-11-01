import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { staticePreset } from '@/preset';

describe('staticePreset', () => {
  it.each([
    ['is', 'Heimild: Hagstofa Íslands, CC BY 4.0'],
    ['en', 'Source: Statistics Iceland, CC BY 4.0'],
    ['de', 'Source: Statistics Iceland, CC BY 4.0']
  ])('attributes Statistics Iceland in %s', (lang, expected) => {
    expect(staticePreset.attribution(lang)).toContain(expected);
    expect(staticePreset.attribution(lang)).toContain(
      'https://statice.is/publications/open-data-access'
    );
  });

  it.each([
    [
      'en',
      'https://px.hagstofa.is/pxen/pxweb/en/Efnahagur/Efnahagur__visitolur__1_vnv__1_vnv/VIS01000.px/'
    ],
    [
      'is',
      'https://px.hagstofa.is/pxis/pxweb/is/Efnahagur/Efnahagur__visitolur__1_vnv__1_vnv/VIS01000.px/'
    ]
  ])('links the %s table page', (lang, expected) => {
    expect(
      staticePreset.tableUrl(
        lang,
        'Efnahagur/visitolur/1_vnv/1_vnv/VIS01000.px'
      )
    ).toBe(expected);
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: staticePreset.version });
  });
});
