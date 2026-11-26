import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ineEsPreset } from '@/preset';

describe('ineEsPreset', () => {
  it.each([
    ['es', 'Fuente: Sitio web del INE: www.ine.es, CC BY 4.0'],
    ['en', 'Source: INE website (Statistics Spain): www.ine.es, CC BY 4.0'],
    ['de', 'Source: INE website (Statistics Spain): www.ine.es, CC BY 4.0']
  ])('attributes INE in %s with the licence link', (lang, expected) => {
    expect(ineEsPreset.attribution(lang)).toContain(expected);
    expect(ineEsPreset.attribution(lang)).toContain(
      'https://www.ine.es/dyngs/AYU/index.htm?cid=125'
    );
  });

  it.each([
    ['es', 'https://www.ine.es/jaxiT3/Tabla.htm?t=76136&L=0'],
    ['en', 'https://www.ine.es/jaxiT3/Tabla.htm?t=76136&L=1']
  ])('links the %s table page', (lang, expected) => {
    expect(ineEsPreset.tableUrl(lang, '76136')).toBe(expected);
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: ineEsPreset.version });
  });
});
