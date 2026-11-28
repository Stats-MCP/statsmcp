import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { bfsPreset } from '@/preset';

describe('bfsPreset', () => {
  it.each([
    ['de', 'Quelle: Bundesamt für Statistik (BFS)'],
    ['fr', 'Source : Office fédéral de la statistique (OFS)'],
    ['it', 'Fonte: Ufficio federale di statistica (UST)'],
    ['en', 'Source: Federal Statistical Office (FSO)'],
    ['rm', 'Source: Federal Statistical Office (FSO)']
  ])('attributes the Federal Statistical Office in %s', (lang, expected) => {
    expect(bfsPreset.attribution(lang)).toContain(expected);
  });

  it.each([
    ['fr', 'fr'],
    ['rm', 'en']
  ])('links the STAT-TAB page of a table in %s', (lang, pageLang) => {
    expect(
      bfsPreset.tableUrl(lang, 'px-x-0102010000_101/px-x-0102010000_101.px')
    ).toBe(
      `https://www.pxweb.bfs.admin.ch/pxweb/${pageLang}/px-x-0102010000_101/-/px-x-0102010000_101.px/`
    );
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: bfsPreset.version });
  });
});
