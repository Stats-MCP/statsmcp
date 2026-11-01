import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { dzsPreset } from '@/preset';

describe('dzsPreset', () => {
  it.each([
    ['hr', 'Izvor: Državni zavod za statistiku'],
    ['en', 'Source: Croatian Bureau of Statistics'],
    ['de', 'Source: Croatian Bureau of Statistics']
  ])('attributes the Croatian Bureau of Statistics in %s', (lang, expected) => {
    expect(dzsPreset.attribution(lang)).toContain(expected);
    expect(dzsPreset.attribution(lang)).toContain(
      'https://web.dzs.hr/Hrv/about_us/Legals/Open%20Licence.pdf'
    );
  });

  it('links a table page with encoded Croatian folder names', () => {
    expect(
      dzsPreset.tableUrl(
        'en',
        'Cijene/Indeksi potrošačkih cijena/Indeksi potrošačkih cijena – ECOICOP, ver. 2/ME_PS09.px'
      )
    ).toBe(
      'https://web.dzs.hr/PXWeb/pxweb/en/Cijene/Cijene__Indeksi%20potro%C5%A1a%C4%8Dkih%20cijena__Indeksi%20potro%C5%A1a%C4%8Dkih%20cijena%20%E2%80%93%20ECOICOP%2C%20ver.%202/ME_PS09.px/'
    );
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: dzsPreset.version });
  });
});
