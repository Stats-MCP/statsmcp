import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { scbPreset } from '@/preset';

describe('scbPreset', () => {
  it.each([
    ['sv', 'Källa: SCB, CC0'],
    ['en', 'Source: Statistics Sweden (SCB), CC0'],
    ['de', 'Source: Statistics Sweden (SCB), CC0']
  ])('attributes Statistics Sweden in %s', (lang, expected) => {
    expect(scbPreset.attribution(lang)).toContain(expected);
  });

  it.each([
    ['en', 'https://www.statistikdatabasen.scb.se/pxweb/en/ssd/'],
    ['sv', 'https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/']
  ])('links %s tables to the database start page', (lang, expected) => {
    expect(scbPreset.tableUrl(lang, 'TAB6596')).toBe(expected);
  });

  it.each([
    [
      'Consumer Price Index (CPI), total 1980=100 (no update after 2025M12). Month',
      true
    ],
    [
      'Konsumentprisindex (KPI), totalt, 1980=100 (uppdateras ej efter 2025M12)',
      true
    ],
    ['The Swedish central government debt by item (not updated). Month', true],
    ['Consumer Price Index (CPI), total 2020=100. Month 1980M01-2026M09', false]
  ])('treats "%s" as archived: %s', (title, archived) => {
    expect(scbPreset.isArchived?.({ id: 'TAB1', title })).toBe(archived);
  });

  it('uses the PxWeb v2 API', () => {
    expect(scbPreset.api).toBe('pxweb-v2');
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: scbPreset.version });
  });
});
