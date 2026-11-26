import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { makstatPreset } from '@/preset';

describe('makstatPreset', () => {
  it.each([
    ['mk', 'Извор: Државен завод за статистика'],
    [
      'en',
      'Source: State Statistical Office of the Republic of North Macedonia'
    ],
    [
      'de',
      'Source: State Statistical Office of the Republic of North Macedonia'
    ]
  ])(
    'attributes the State Statistical Office in %s with the terms link',
    (lang, expected) => {
      expect(makstatPreset.attribution(lang)).toContain(expected);
      expect(makstatPreset.attribution(lang)).toContain(
        'https://www.stat.mk/en/about-us/policies-and-strategies/open-data/'
      );
    }
  );

  it.each([
    [
      'en',
      'https://makstat.stat.gov.mk/PXWeb/pxweb/en/MakStat/MakStat__Ceni__IndeksTrosZivot__TrosociZivot/121_CeniTr_Mk_IndTroZi_ecoicop_ml.px/'
    ],
    [
      'mk',
      'https://makstat.stat.gov.mk/PXWeb/pxweb/mk/MakStat/MakStat__Ceni__IndeksTrosZivot__TrosociZivot/121_CeniTr_Mk_IndTroZi_ecoicop_ml.px/'
    ]
  ])('links the %s table page', (lang, expected) => {
    expect(
      makstatPreset.tableUrl(
        lang,
        'Ceni/IndeksTrosZivot/TrosociZivot/121_CeniTr_Mk_IndTroZi_ecoicop_ml.px'
      )
    ).toBe(expected);
  });

  it.each([
    ['/PazarNaTrud/PazarTrudArhiva/StapkiDrugiIndikatoriArhiva', 'x.px', true],
    ['/BDP/BDPInvesGodisni/ArhivaBDPGodisni', 'x.px', true],
    [
      '/Ceni/IndeksTrosZivot/DetPod',
      '130_CeniTr_Mk_DetalnoTroZi_arh_ml.px',
      true
    ],
    [
      '/Ceni/IndeksTrosZivot/TrosociZivot',
      '121_CeniTr_Mk_IndTroZi_ecoicop_ml.px',
      false
    ]
  ])('treats a table in %s named %s as archived: %s', (path, id, archived) => {
    expect(makstatPreset.isArchived?.({ id, title: 'x', path })).toBe(archived);
  });

  it('matches the package version', () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );

    expect(packageJson).toMatchObject({ version: makstatPreset.version });
  });
});
