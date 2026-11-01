import { describe, expect, it } from 'vitest';

import { normalize } from '@/text';

describe('normalize', () => {
  it.each([
    ['Plača', 'placa'],
    ['Købekraft', 'kobekraft'],
    ['Æble', 'aeble'],
    ['Straße', 'strasse'],
    ['Łódź', 'lodz'],
    ['Đakovo', 'dakovo'],
    ['Þjóð', 'thjod'],
    ['Œuvre', 'oeuvre']
  ])('folds %s to %s', (text, expected) => {
    expect(normalize(text, 'en')).toBe(expected);
  });
});
