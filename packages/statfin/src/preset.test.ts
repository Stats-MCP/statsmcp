import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { statfinPreset } from '@/preset';

describe('statfinPreset', () => {
  it.each([
    ['fi', 'Lähde: Tilastokeskus, CC BY 4.0'],
    ['sv', 'Källa: Statistikcentralen, CC BY 4.0'],
    ['en', 'Source: Statistics Finland, CC BY 4.0'],
    ['de', 'Source: Statistics Finland, CC BY 4.0']
  ])('attributes Statistics Finland in %s', (lang, expected) => {
    expect(statfinPreset.attribution(lang)).toContain(expected);
  });

  it.each([
    [
      'en',
      'khi/11xt.px',
      'https://pxdata.stat.fi/PxWeb/pxweb/en/StatFin/StatFin__khi/11xt.px/'
    ],
    [
      'sv',
      'khi/11xt.px',
      'https://pxdata.stat.fi/PxWeb/pxweb/sv/StatFin/StatFin__khi/11xt.px/'
    ],
    [
      'de',
      'vaerak/11rb.px',
      'https://pxdata.stat.fi/PxWeb/pxweb/en/StatFin/StatFin__vaerak/11rb.px/'
    ]
  ])('links %s table %s to %s', (lang, tableId, expected) => {
    expect(statfinPreset.tableUrl(lang, tableId)).toBe(expected);
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: statfinPreset.version });
  });
});
