import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ssbPreset } from '@/preset';

describe('ssbPreset', () => {
  it.each([
    ['no', 'Kilde: Statistisk sentralbyrå (SSB)'],
    ['en', 'Source: Statistics Norway (SSB)'],
    ['de', 'Source: Statistics Norway (SSB)']
  ])('attributes SSB as the source in %s', (lang, expected) => {
    expect(ssbPreset.attribution(lang)).toContain(expected);
  });

  it.each([
    ['en', '14710', 'https://www.ssb.no/en/statbank/table/14710'],
    ['no', '14710', 'https://www.ssb.no/statbank/table/14710'],
    ['en', 'if/kpi/Kpi10', 'https://www.ssb.no/en/statbank']
  ])('links %s table %s to %s', (lang, tableId, expected) => {
    expect(ssbPreset.tableUrl(lang, tableId)).toBe(expected);
  });

  it('uses the table number from the title as the table id', () => {
    const hit = {
      id: 'Kpi10',
      path: '/if/kpi',
      title: '14710: Consumer price index'
    };

    expect(ssbPreset.tableIdFromHit?.(hit)).toBe('14710');
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: ssbPreset.version });
  });
});
