/** Letters that Unicode does not decompose into a base letter and a mark. */
const FOLDED_LETTERS: Readonly<Record<string, string>> = {
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  þ: 'th'
};

/** Lower case without diacritics, so "Plača" matches "placa" and "Købekraft" matches "kobekraft". */
export function normalize(text: string, lang: string): string {
  return text
    .toLocaleLowerCase(lang)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[øæœßđðłþ]/gu, (letter) => FOLDED_LETTERS[letter] ?? letter);
}

/** True when `term` starts a word in `text`, so "price" matches "prices" but "wage" does not match "sewage". */
export function startsWord(text: string, term: string): boolean {
  let index = text.indexOf(term);
  while (index >= 0) {
    if (!/\p{L}/u.test(text[index - 1] ?? ' ')) return true;
    index = text.indexOf(term, index + 1);
  }
  return false;
}
