import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ospPreset } from '@/preset';

describe('ospPreset', () => {
  it.each([
    [
      'lt',
      'Šaltinis: Valstybės duomenų agentūra, Oficialiosios statistikos portalas (https://osp.stat.gov.lt)'
    ],
    [
      'en',
      'Source: State Data Agency (Statistics Lithuania), Official Statistics Portal (https://osp.stat.gov.lt)'
    ],
    [
      'de',
      'Source: State Data Agency (Statistics Lithuania), Official Statistics Portal (https://osp.stat.gov.lt)'
    ]
  ])('attributes the State Data Agency in %s', (lang, expected) => {
    expect(ospPreset.attribution(lang)).toBe(expected);
  });

  it.each([
    [
      'lt',
      'https://osp.stat.gov.lt/statistiniu-rodikliu-analize?indicator=S7R121'
    ],
    [
      'en',
      'https://osp.stat.gov.lt/en/statistiniu-rodikliu-analize?indicator=S7R121'
    ]
  ])('links the %s indicator page of a table', (lang, expected) => {
    expect(ospPreset.tableUrl(lang, 'S7R121_M2020103_1')).toBe(expected);
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: ospPreset.version });
  });
});
