import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { statEePreset } from '@/preset';

describe('statEePreset', () => {
  it.each([
    ['et', 'Allikas: Statistikaamet, CC BY-SA 4.0'],
    ['en', 'Source: Statistics Estonia, CC BY-SA 4.0'],
    ['de', 'Source: Statistics Estonia, CC BY-SA 4.0']
  ])(
    'attributes Statistics Estonia with the licence in %s',
    (lang, expected) => {
      expect(statEePreset.attribution(lang)).toContain(expected);
      expect(statEePreset.attribution(lang)).toContain(
        'https://creativecommons.org/licenses/by-sa/4.0/'
      );
    }
  );

  it.each([
    ['en', 'IA002.px', 'https://andmed.stat.ee/en/stat/IA002'],
    ['et', 'IA02.PX', 'https://andmed.stat.ee/et/stat/IA02'],
    ['de', 'RV071', 'https://andmed.stat.ee/en/stat/RV071']
  ])('links %s table %s to %s', (lang, tableId, expected) => {
    expect(statEePreset.tableUrl(lang, tableId)).toBe(expected);
  });

  it.each([
    ['/Lepetatud_tabelid/Majandus. Arhiiv/Hinnad. Arhiiv', true],
    ['/majandus/hinnad', false],
    [undefined, false]
  ])('treats a hit under %s as archived: %s', (path, archived) => {
    const hit = { id: 'IA02.PX', path, title: 'IA02: Consumer price index' };

    expect(statEePreset.isArchived?.(hit)).toBe(archived);
    expect(statEePreset.tableIdFromHit?.(hit)).toBe('IA02.PX');
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: statEePreset.version });
  });
});
