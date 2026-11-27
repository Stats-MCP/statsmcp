import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ibgePreset } from '@/preset';

describe('ibgePreset', () => {
  it.each([
    ['pt', 'Fonte: IBGE'],
    ['en', 'Source: IBGE, Brazilian Institute of Geography and Statistics']
  ])('attributes IBGE in %s', (lang, expected) => {
    expect(ibgePreset.attribution(lang)).toBe(expected);
  });

  it('links the SIDRA table page', () => {
    expect(ibgePreset.tableUrl('pt', '1737')).toBe(
      'https://sidra.ibge.gov.br/tabela/1737'
    );
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: ibgePreset.version });
  });
});
