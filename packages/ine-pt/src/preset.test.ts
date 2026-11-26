import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { inePtPreset } from '@/preset';

describe('inePtPreset', () => {
  it.each([
    ['pt', 'Fonte: Instituto Nacional de Estatística – Portugal, CC BY 4.0'],
    [
      'en',
      'Source: Instituto Nacional de Estatística – Portugal (Statistics Portugal), CC BY 4.0'
    ],
    [
      'de',
      'Source: Instituto Nacional de Estatística – Portugal (Statistics Portugal), CC BY 4.0'
    ]
  ])(
    'attributes Statistics Portugal in %s with the terms link',
    (lang, expected) => {
      expect(inePtPreset.attribution(lang)).toContain(expected);
      expect(inePtPreset.attribution(lang)).toContain(
        'https://www.ine.pt/xportal/xmain?xpid=INE&xpgid=ine_cont_inst&INST=3585857&xlang=en'
      );
    }
  );

  it.each([
    [
      'en',
      'https://www.ine.pt/xportal/xmain?xpid=INE&xpgid=ine_indicadores&indOcorrCod=0008074&contexto=bd&selTab=tab2&xlang=en'
    ],
    [
      'pt',
      'https://www.ine.pt/xportal/xmain?xpid=INE&xpgid=ine_indicadores&indOcorrCod=0008074&contexto=bd&selTab=tab2&xlang=pt'
    ]
  ])('links the %s indicator page', (lang, expected) => {
    expect(inePtPreset.tableUrl(lang, '0008074')).toBe(expected);
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: inePtPreset.version });
  });
});
