import { describe, expect, it } from 'vitest';

import { decodeXml, footerMessage } from '@/sdmx-ml';

describe('decodeXml', () => {
  it.each([
    [
      'a label escaped twice',
      'Children&amp;apos;s clothing',
      "Children's clothing"
    ],
    [
      'named and numeric entities',
      'A &lt; B &amp; C &#x41;&#66;',
      'A < B & C AB'
    ],
    [
      'line breaks and repeated spaces',
      '  Total\n   population ',
      'Total population'
    ]
  ])('decodes %s', (_case, input, expected) => {
    expect(decodeXml(input)).toBe(expected);
  });
});

describe('footerMessage', () => {
  it('reads the code and the texts of an error in the footer', () => {
    const xml = `<mes:GenericData><footer:Footer><footer:Message code="500" severity="Error">
      <com:Text xml:lang="lt">Klaida</com:Text>
      <com:Text xml:lang="en">Internal error</com:Text>
    </footer:Message></footer:Footer></mes:GenericData>`;

    const footer = footerMessage(xml);

    expect(footer?.code).toBe('500');
    expect(Object.fromEntries(footer?.texts ?? [])).toEqual({
      lt: 'Klaida',
      en: 'Internal error'
    });
  });

  it('finds nothing in an answer without a footer', () => {
    expect(
      footerMessage('<mes:GenericData></mes:GenericData>')
    ).toBeUndefined();
  });
});
