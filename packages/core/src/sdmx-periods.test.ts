import { describe, expect, it } from 'vitest';

import {
  comparePeriods,
  parseSdmxDate,
  periodCodes,
  periodStart
} from '@/sdmx-periods';

const utc = (text: string): Date => new Date(`${text}T00:00:00Z`);

describe('periodCodes', () => {
  it.each([
    ['Q', '1948-07-01', '1948-12-31', ['1948-Q3', '1948-Q4']],
    [
      'M',
      '2025-11-01',
      '2026-02-28',
      ['2025-11', '2025-12', '2026-01', '2026-02']
    ],
    ['A', '2006-01-01', '2008-12-31', ['2006', '2007', '2008']],
    ['S', '2025-03-01', '2026-01-31', ['2025-S1', '2025-S2', '2026-S1']],
    ['Q', '2026-01-01', '2026-05-15', ['2026-Q1', '2026-Q2']],
    ['A', '2027-01-01', '2026-01-01', []]
  ])('lists %s periods from %s to %s', (freq, start, end, expected) => {
    expect(periodCodes(freq, utc(start), utc(end))).toEqual(expected);
  });

  it.each(['D', 'B', 'W', 'H', 'N'])('lists no periods for %s', (freq) => {
    expect(periodCodes(freq, utc('2026-01-01'), utc('2026-03-31'))).toEqual([]);
  });
});

describe('periodStart', () => {
  it.each([
    ['2025', '2025-01-01'],
    ['2025-S2', '2025-07-01'],
    ['2025-Q3', '2025-07-01'],
    ['2025-09', '2025-09-01']
  ])('starts %s on %s', (code, expected) => {
    expect(periodStart(code)).toEqual(utc(expected));
  });

  it.each(['2025-13', '2025-Q5', '2025-W01', 'latest'])(
    'does not read %s',
    (code) => {
      expect(periodStart(code)).toBeUndefined();
    }
  );
});

describe('comparePeriods', () => {
  it('sorts by start date, the longer period first, unknown codes last', () => {
    const codes = ['2025-07', 'x', '2025-Q3', '2025', '2024-12', '2025-S2'];

    expect(codes.toSorted(comparePeriods)).toEqual([
      '2024-12',
      '2025',
      '2025-S2',
      '2025-Q3',
      '2025-07',
      'x'
    ]);
  });
});

describe('parseSdmxDate', () => {
  it.each([
    ['1948-07-01T00:00:00', '1948-07-01T00:00:00Z'],
    ['2026-09-30T00:00:00Z', '2026-09-30T00:00:00Z'],
    ['2026-09-30T02:00:00+02:00', '2026-09-30T00:00:00Z'],
    ['2026-09-30T02:00:00+0200', '2026-09-30T00:00:00Z']
  ])('reads %s as %s', (text, expected) => {
    expect(parseSdmxDate(text)).toEqual(new Date(expected));
  });

  it('gives undefined for text that is not a date', () => {
    expect(parseSdmxDate('not a date')).toBeUndefined();
  });
});
