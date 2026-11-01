import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { statcanPreset } from '@/preset';

describe('statcanPreset', () => {
  it.each([
    ['en', 'Source: Statistics Canada, Statistics Canada Open Licence'],
    ['fr', 'Source : Statistique Canada, Licence ouverte'],
    ['de', 'Source: Statistics Canada']
  ])('attributes Statistics Canada in %s', (lang, expected) => {
    expect(statcanPreset.attribution(lang)).toContain(expected);
  });

  it.each([
    ['en', 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000401'],
    ['fr', 'https://www150.statcan.gc.ca/t1/tbl1/fr/tv.action?pid=1810000401']
  ])('links %s table 18100004 to %s', (lang, expected) => {
    expect(statcanPreset.tableUrl(lang, '18100004')).toBe(expected);
  });

  it('uses the StatCan WDS API', () => {
    expect(statcanPreset.api).toBe('statcan-wds');
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: statcanPreset.version });
  });
});
