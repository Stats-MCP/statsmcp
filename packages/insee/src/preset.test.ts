import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { inseePreset } from '@/preset';

describe('inseePreset', () => {
  it.each([
    ['fr', 'Source : Insee, Licence Ouverte 2.0'],
    ['en', 'Source: Insee, Licence Ouverte / Open Licence 2.0'],
    ['de', 'Source: Insee, Licence Ouverte / Open Licence 2.0']
  ])('attributes INSEE in %s with the licence link', (lang, expected) => {
    expect(inseePreset.attribution(lang)).toContain(expected);
    expect(inseePreset.attribution(lang)).toContain(
      'https://www.etalab.gouv.fr/licence-ouverte-open-licence'
    );
  });

  it.each([
    [
      'fr',
      'https://catalogue-donnees.insee.fr/fr/catalogue/recherche/DS_IPC_PRINC'
    ],
    [
      'en',
      'https://catalogue-donnees.insee.fr/en/catalogue/recherche/DS_IPC_PRINC'
    ]
  ])('links the %s dataset page', (lang, expected) => {
    expect(inseePreset.tableUrl(lang, 'DS_IPC_PRINC')).toBe(expected);
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: inseePreset.version });
  });
});
