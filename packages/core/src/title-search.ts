import type { TableSearchHit } from '@/pxweb-client';
import { normalize, startsWord } from '@/text';

const MIN_TERM_LENGTH = 2;

function termsOf(query: string, lang: string): string[] {
  return [
    ...new Set(
      normalize(query, lang)
        .split(/[^\p{L}\p{N}]+/u)
        .filter((term) => term.length >= MIN_TERM_LENGTH)
    )
  ];
}

/**
 * Keyword search over a local list of tables, for APIs without a working search.
 * A table matches when a query word starts a word in its title or equals its id.
 * Tables that match more words come first; ties keep the list order.
 */
export function searchTitles(
  tables: readonly TableSearchHit[],
  query: string,
  lang: string
): TableSearchHit[] {
  const terms = termsOf(query, lang);
  if (terms.length === 0) return [];
  return tables
    .map((table, index) => {
      const title = normalize(table.title, lang);
      const id = normalize(table.tableId, lang);
      const matches = terms.filter(
        (term) => id === term || startsWord(title, term)
      ).length;
      return { table, matches, index };
    })
    .filter((entry) => entry.matches > 0)
    .toSorted((a, b) => b.matches - a.matches || a.index - b.index)
    .map((entry) => entry.table);
}
