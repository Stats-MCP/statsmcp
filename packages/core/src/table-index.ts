import MiniSearch, { type AsPlainObject } from 'minisearch';

import type { TableSearchHit } from '@/pxweb-client';
import { isHistorical, rankSearchHits } from '@/search-ranking';
import type { TableDoc } from '@/table-doc';
import { normalize } from '@/text';
import { searchTitles } from '@/title-search';

export type { TableDoc } from '@/table-doc';

export interface TableIndexSearchOptions {
  /** Also return discontinued tables; by default they are left out. */
  includeArchived?: boolean;
}

export interface TableIndex {
  readonly size: number;
  search(query: string, options?: TableIndexSearchOptions): TableSearchHit[];
}

export interface TableIndexOptions {
  /**
   * Year for the recency and current-data boosts, fixed when the index is built;
   * defaults to the current UTC year. Rebuild the index when the catalogue refreshes.
   */
  currentYear?: number;
}

/** Norwegian written standards share one stop-word list. */
const LANGUAGE_FAMILY: Readonly<Record<string, string>> = {
  nb: 'no',
  nn: 'no'
};

const FIELD_BOOST = { title: 3, path: 1 };
const PREFIX_MIN_LENGTH = 4;
const FUZZY_MIN_LENGTH = 6;
const FUZZY_DISTANCE = 0.2;
const MIN_TERM_LENGTH = 2;
const RECENCY_WEIGHT = 0.15;
const RECENCY_YEARS = 4;
const CLOSED_FACTOR = 0.5;
/** BM25 length normalisation; the MiniSearch default, kept after the golden-set evaluation. */
const LENGTH_NORMALIZATION = 0.75;
const CURRENT_DATA_BOOST = 0.3;
/** Rank constant of reciprocal rank fusion; small values trust the top ranks more. */
const FUSION_K = 10;

/** Function words of two or more letters (shorter words are never indexed). */
const STOP_WORDS: Readonly<Record<string, readonly string[]>> = {
  en: [
    'an',
    'and',
    'at',
    'by',
    'for',
    'from',
    'in',
    'of',
    'on',
    'or',
    'per',
    'the',
    'to',
    'with'
  ],
  da: ['af', 'den', 'det', 'efter', 'for', 'fordelt', 'med', 'og', 'pa', 'til'],
  de: [
    'das',
    'der',
    'die',
    'fur',
    'im',
    'in',
    'je',
    'mit',
    'nach',
    'und',
    'von'
  ],
  et: ['ja', 'ning'],
  fi: ['ja'],
  fo: ['og'],
  hr: ['do', 'i', 'iz', 'ili', 'na', 'od', 'po', 'prema', 'sa', 'te', 'za'],
  is: ['af', 'eftir', 'fra', 'med', 'og', 'til', 'um', 'vid'],
  fr: [
    'au',
    'aux',
    'de',
    'des',
    'du',
    'en',
    'et',
    'la',
    'le',
    'les',
    'par',
    'pour',
    'un',
    'une'
  ],
  nl: [
    'de',
    'een',
    'en',
    'het',
    'in',
    'met',
    'naar',
    'op',
    'per',
    'van',
    'voor'
  ],
  no: ['av', 'etter', 'for', 'med', 'og', 'pa', 'til'],
  es: [
    'al',
    'con',
    'de',
    'del',
    'el',
    'en',
    'la',
    'las',
    'los',
    'para',
    'por',
    'segun',
    'un',
    'una'
  ],
  pt: [
    'ao',
    'aos',
    'as',
    'com',
    'da',
    'das',
    'de',
    'do',
    'dos',
    'em',
    'na',
    'nas',
    'no',
    'nos',
    'os',
    'ou',
    'pela',
    'pelas',
    'pelo',
    'pelos',
    'por',
    'um',
    'uma'
  ],
  sl: ['in', 'na', 'po', 'ter', 'za'],
  sv: ['av', 'efter', 'for', 'med', 'och', 'pa', 'till']
};

function extractField(doc: TableDoc, field: string): string {
  if (field === 'path') return (doc.path ?? []).join(' ');
  if (field === 'id') return doc.id;
  return doc.title;
}

const PX_FILE = /\.px$/i;

/** Docs by key, leaving out keys that more than one doc shares. */
function uniqueBy(
  docs: readonly TableDoc[],
  key: (doc: TableDoc) => string | undefined
): Map<string, TableDoc> {
  const byKey = new Map<string, TableDoc | undefined>();
  for (const doc of docs) {
    const value = key(doc);
    if (value === undefined) continue;
    byKey.set(value, byKey.has(value) ? undefined : doc);
  }
  return new Map(
    [...byKey].filter(
      (entry): entry is [string, TableDoc] => entry[1] !== undefined
    )
  );
}

/** Path ids ("db/folder/MAN00101.px") also match by a file name that only one table has. */
function uniqueFileNames(
  docs: readonly TableDoc[],
  lang: string
): Map<string, TableDoc> {
  return uniqueBy(docs, (doc) =>
    doc.id.includes('/')
      ? normalize(doc.id.split('/').at(-1) ?? '', lang).replace(PX_FILE, '')
      : undefined
  );
}

function recency(updated: string | undefined, currentYear: number): number {
  const year = Number(updated?.slice(0, 4));
  if (!Number.isFinite(year)) return 0;
  return Math.max(
    0,
    Math.min(1, (RECENCY_YEARS - (currentYear - year)) / RECENCY_YEARS)
  );
}

function toHit(doc: TableDoc): TableSearchHit {
  return {
    tableId: doc.id,
    title: doc.title,
    published: doc.updated,
    ...(doc.discontinued ? { archived: true as const } : {})
  };
}

/**
 * Reciprocal rank fusion (Cormack et al. 2009): each list adds 1 / (k + rank),
 * so a table that ranks well in both lists comes first.
 */
function fuseRankings(lists: readonly string[][], k: number): string[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

/** True when the last period lies in the current or the previous year. */
function hasCurrentData(
  lastPeriod: string | undefined,
  currentYear: number
): boolean {
  const year = Number(/(\d{4})/.exec(lastPeriod ?? '')?.[1]);
  return Number.isFinite(year) && year >= currentYear - 1;
}

/** Bump when the index fields or the MiniSearch version change; term processing is checked by its fingerprint. */
export const SEARCH_INDEX_VERSION = 1;

/** A search index built ahead of time, for example by the crawler. */
export interface PrebuiltSearchIndex {
  version: number;
  /** How the language's terms were processed; a change to normalization or stop words rebuilds. */
  terms?: string;
  index: AsPlainObject;
}

/** The prebuilt index stored in a snapshot, if it has the expected shape. */
export function asPrebuiltIndex(
  value: unknown
): PrebuiltSearchIndex | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (!('version' in value) || typeof value.version !== 'number')
    return undefined;
  if (!('index' in value) || !isPlainIndex(value.index)) return undefined;
  const terms =
    'terms' in value && typeof value.terms === 'string'
      ? value.terms
      : undefined;
  return {
    version: value.version,
    ...(terms && { terms }),
    index: value.index
  };
}

// A shallow check, so a large index is not walked; loadIndex catches a deeper damage.
function isPlainIndex(value: unknown): value is AsPlainObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    'documentCount' in value &&
    typeof value.documentCount === 'number' &&
    'index' in value &&
    Array.isArray(value.index) &&
    'serializationVersion' in value &&
    typeof value.serializationVersion === 'number'
  );
}

// Keyed by the doc list a prebuilt index belongs to, so it is used for exactly that list.
// The entry is used once; building another index for the same list builds it on the spot.
const prebuiltIndexes = new WeakMap<readonly TableDoc[], PrebuiltSearchIndex>();

/** Lets createTableIndex load this prebuilt index instead of building one for these docs. */
export function attachSearchIndex(
  docs: readonly TableDoc[],
  prebuilt: PrebuiltSearchIndex
): void {
  prebuiltIndexes.set(docs, prebuilt);
}

function miniSearchOptions(lang: string) {
  const stopWords = new Set(STOP_WORDS[LANGUAGE_FAMILY[lang] ?? lang] ?? []);
  return {
    idField: 'id',
    fields: ['title', 'path'],
    extractField,
    processTerm: (term: string): string | null => {
      const value = normalize(term, lang);
      return value.length < MIN_TERM_LENGTH || stopWords.has(value)
        ? null
        : value;
    }
  };
}

// Sample words that show the effect of normalization and stop words.
const TERM_PROBE =
  'Ætt Øl Ål Ää Öö Üü Ññ Çç Šš Žž Čč Ćć Đđ Łł Ðð Þþ ß Ĳ ı İ Ş Ţ Ș Ț Ё Ђ Ѓ Ќ ќ 2026 1,5 e-mail';

function termFingerprint(lang: string): string {
  const { processTerm } = miniSearchOptions(lang);
  const stopWords = STOP_WORDS[LANGUAGE_FAMILY[lang] ?? lang] ?? [];
  const probe = TERM_PROBE.split(' ').map((term) => processTerm(term) ?? '-');
  return [...probe, '|', ...stopWords].join(' ');
}

function uniqueDocs(docs: readonly TableDoc[]): TableDoc[] {
  return [...new Map(docs.map((doc) => [doc.id, doc])).values()];
}

/** Builds the search index of a table list, to store with the list. */
export function buildSearchIndex(
  docs: readonly TableDoc[],
  lang: string
): PrebuiltSearchIndex {
  const index = new MiniSearch<TableDoc>(miniSearchOptions(lang));
  index.addAll(uniqueDocs(docs));
  return {
    version: SEARCH_INDEX_VERSION,
    terms: termFingerprint(lang),
    index: index.toJSON()
  };
}

function loadIndex(
  docs: readonly TableDoc[],
  unique: TableDoc[],
  lang: string,
  options: ReturnType<typeof miniSearchOptions>
): MiniSearch<TableDoc> {
  const prebuilt = prebuiltIndexes.get(docs);
  prebuiltIndexes.delete(docs);
  if (
    prebuilt?.version === SEARCH_INDEX_VERSION &&
    prebuilt.terms === termFingerprint(lang)
  ) {
    try {
      const loaded = MiniSearch.loadJS<TableDoc>(prebuilt.index, options);
      if (loaded.documentCount === unique.length) return loaded;
    } catch {
      // A damaged prebuilt index is rebuilt below.
    }
  }
  const index = new MiniSearch<TableDoc>(options);
  index.addAll(unique);
  return index;
}

/**
 * Keyword search over a source's table catalogue, for APIs whose own search is
 * missing, broken or weak. It fuses two rankings: BM25 over titles (three times)
 * and subject folders, and word-start matches in the office's own catalogue order,
 * where offices list their main tables first.
 */
export function createTableIndex(
  docs: readonly TableDoc[],
  lang: string,
  options: TableIndexOptions = {}
): TableIndex {
  const currentYear = options.currentYear ?? new Date().getUTCFullYear();
  const indexOptions = miniSearchOptions(lang);
  const processTerm = indexOptions.processTerm;
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const byNormalizedId = uniqueBy(docs, (doc) => normalize(doc.id, lang));
  const byFileName = uniqueFileNames(docs, lang);
  const factor = new Map(
    docs.map((doc) => {
      const closed = doc.discontinued || isHistorical(doc.title, currentYear);
      const current = hasCurrentData(doc.lastPeriod, currentYear);
      const boost =
        (closed ? CLOSED_FACTOR : 1) *
        (1 + RECENCY_WEIGHT * recency(doc.updated, currentYear)) *
        (current ? 1 + CURRENT_DATA_BOOST : 1);
      return [doc.id, boost];
    })
  );
  const index = loadIndex(docs, [...byId.values()], lang, indexOptions);

  const base = {
    boost: FIELD_BOOST,
    prefix: (term: string) => term.length >= PREFIX_MIN_LENGTH,
    boostDocument: (id: string) => factor.get(id) ?? 1,
    bm25: { k: 1.2, b: LENGTH_NORMALIZATION, d: 0.5 }
  };

  const hits = [...byId.values()].map(toHit);

  return {
    size: byId.size,
    search(query, searchOptions = {}) {
      const wanted = normalize(query.trim(), lang);
      const exact =
        byId.get(query.trim()) ??
        byNormalizedId.get(wanted) ??
        byFileName.get(wanted.replace(PX_FILE, ''));
      let ids = [
        ...index.search(query, { ...base, combineWith: 'AND' }),
        ...index.search(query, { ...base, combineWith: 'OR' })
      ].map((result) => String(result.id));
      if (ids.length === 0) {
        ids = index
          .search(query, {
            ...base,
            combineWith: 'OR',
            fuzzy: (term: string) =>
              term.length >= FUZZY_MIN_LENGTH ? FUZZY_DISTANCE : false
          })
          .map((result) => String(result.id));
      }
      const visible = (id: string) =>
        searchOptions.includeArchived || !byId.get(id)?.discontinued;
      const bm25 = [...new Set(ids)].filter(visible);
      const keywords = query
        .split(/[^\p{L}\p{N}]+/u)
        .filter((term) => processTerm(term) !== null)
        .join(' ');
      const catalogue = rankSearchHits(
        searchTitles(hits, keywords, lang),
        currentYear
      )
        .map((hit) => hit.tableId)
        .filter(visible);
      const fused = fuseRankings([bm25, catalogue], FUSION_K);
      return [...new Set([...(exact ? [exact.id] : []), ...fused])]
        .map((id) => byId.get(id))
        .filter((doc): doc is TableDoc => doc !== undefined)
        .map(toHit);
    }
  };
}

export interface TableListOptions {
  /** Tables to use when the live table list fails, for example a crawled snapshot. */
  listFallback?: (lang: string) => Promise<readonly TableDoc[] | undefined>;
  /** Tables to use before the live table list, for example a crawled snapshot. */
  crawledList?: (lang: string) => Promise<readonly TableDoc[] | undefined>;
}

/** Loads the crawled list when it has tables, else the live list. */
export function preferCrawled(
  load: (lang: string) => Promise<readonly TableDoc[]>,
  crawled: TableListOptions['crawledList']
): (lang: string) => Promise<readonly TableDoc[]> {
  if (!crawled) return load;
  return async (lang) => {
    const docs = await crawled(lang).catch(() => undefined);
    return docs && docs.length > 0 ? docs : load(lang);
  };
}

export interface TableIndexLoaderOptions {
  /** How long a built index stays fresh. */
  ttlSeconds: number;
  /** Wait before retrying after a failed refresh; the old index serves meanwhile. */
  retrySeconds?: number;
  /** Year for recency at build time; defaults to the current UTC year. */
  currentYear?: () => number;
  /**
   * Tables for a language that has no index yet when the live list fails. A stale
   * live index wins over the fallback, and a fallback index is kept only until
   * the next retry.
   */
  fallback?: TableListOptions['listFallback'];
}

const DEFAULT_RETRY_SECONDS = 5 * 60;
// On Cloudflare Workers, a build started by a request that the runtime stopped
// (for example over the CPU limit) never settles, so later requests must not wait on it.
const PENDING_TIMEOUT_MS = 30_000;

/**
 * Keeps one built index per language. Parallel searches share a build, an index
 * is rebuilt after `ttlSeconds`, and a failed refresh keeps serving the old one.
 */
export function createTableIndexLoader(
  load: (lang: string) => Promise<readonly TableDoc[]>,
  options: TableIndexLoaderOptions
): (lang: string) => Promise<TableIndex> {
  const built = new Map<string, { at: number; index: TableIndex }>();
  const loading = new Map<
    string,
    { at: number; promise: Promise<TableIndex> }
  >();
  const ttlMs = options.ttlSeconds * 1000;
  const retryMs = (options.retrySeconds ?? DEFAULT_RETRY_SECONDS) * 1000;
  const build = (docs: readonly TableDoc[], lang: string): TableIndex =>
    createTableIndex(docs, lang, {
      currentYear: options.currentYear?.() ?? new Date().getUTCFullYear()
    });

  async function fallbackIndex(lang: string): Promise<TableIndex | undefined> {
    try {
      const docs = await options.fallback?.(lang);
      return docs && docs.length > 0 ? build(docs, lang) : undefined;
    } catch {
      return undefined;
    }
  }

  function start(lang: string): Promise<TableIndex> {
    const current = built.get(lang);
    const isCurrent = () => loading.get(lang)?.promise === promise;
    const promise = load(lang)
      .then((docs) => {
        const index = build(docs, lang);
        if (isCurrent()) built.set(lang, { at: Date.now(), index });
        return index;
      })
      .catch(async (err: unknown) => {
        const index = current?.index ?? (await fallbackIndex(lang));
        if (!index) throw err;
        if (isCurrent()) {
          built.set(lang, { at: Date.now() - ttlMs + retryMs, index });
        }
        return index;
      })
      .finally(() => {
        if (isCurrent()) loading.delete(lang);
      });
    loading.set(lang, { at: Date.now(), promise });
    return promise;
  }

  return (lang) => {
    const current = built.get(lang);
    if (current && Date.now() - current.at < ttlMs)
      return Promise.resolve(current.index);
    const pending = loading.get(lang);
    if (!pending || Date.now() - pending.at > PENDING_TIMEOUT_MS)
      return start(lang);
    return pending.promise.catch((err: unknown) => {
      const now = loading.get(lang);
      if (now && now !== pending) return now.promise;
      if (!now) {
        const fresh = built.get(lang);
        if (fresh && fresh !== current) return fresh.index;
        throw err;
      }
      loading.delete(lang);
      return start(lang);
    });
  };
}
