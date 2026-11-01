import { describe, expect, it } from 'vitest';

import { searchTitles } from '@/title-search';

const tables = [
  {
    tableId: 'FOLK1A',
    title: 'Population at the first day of the quarter',
    published: undefined
  },
  { tableId: 'PRIS111', title: 'Consumer price index', published: undefined },
  {
    tableId: 'PRIS113',
    title: 'Consumer price index (annual)',
    published: undefined
  },
  { tableId: 'LON1', title: 'Earnings by sector', published: undefined },
  { tableId: 'KØB1', title: 'Købekraft og priser', published: undefined }
];

describe('searchTitles', () => {
  it('ranks tables that match more query words first and keeps list order on ties', () => {
    expect(
      searchTitles(tables, 'annual consumer index', 'en').map((t) => t.tableId)
    ).toEqual(['PRIS113', 'PRIS111']);
  });

  it.each([
    ['folk1a', ['FOLK1A']],
    ['koebekraft', []],
    ['kobekraft', ['KØB1']],
    ['sewage', []],
    ['a', []]
  ])(
    'matches %s to %j by id, word start and without diacritics',
    (query, expected) => {
      expect(searchTitles(tables, query, 'da').map((t) => t.tableId)).toEqual(
        expected
      );
    }
  );
});
