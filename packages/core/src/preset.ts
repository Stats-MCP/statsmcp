import type { ApiBaseUrl, SearchHit } from '@/pxweb-client';

export interface SearchAlias {
  /** Lower-case words or phrases that trigger the alias when the query contains them. */
  terms: readonly string[];
  /** Extra query in the database's own wording, for example "earnings" for "salary". */
  query: string;
}

export interface PxwebPreset {
  /** MCP server name without a "-mcp" suffix, for example "sistat". */
  name: string;
  title: string;
  version: string;
  /**
   * PxWeb API v1 root, for example "https://pxweb.stat.si/SiStatData/api/v1".
   * Use `{ en: …, is: … }` when each language has its own root.
   */
  apiBaseUrl: ApiBaseUrl;
  /**
   * API type, default "pxweb-v1". The other types need one string `apiBaseUrl`
   * (the language is a parameter), use the API table ids as they are and ignore
   * `database` and `tableIdFromHit`.
   */
  api?:
    | 'pxweb-v1'
    | 'pxweb-v2'
    | 'statbank-dk'
    | 'cbs-odata'
    | 'eurostat'
    | 'statcan-wds'
    | 'singstat';
  /**
   * Search strategy for APIs that offer both: "api" uses the API's own search,
   * "index" lists every table and searches locally (better on the golden sets).
   * PxWeb v2 lists the tables itself. PxWeb v1 reads the crawled snapshot from the
   * server's `tableSnapshots` option. Other API types always search an index.
   */
  search?: 'api' | 'index';
  /**
   * Path segment after the language: "Data" on SiStat (the default), "table" on SSB.
   * With an array, search covers every database in it and each table id starts with its database.
   * A database that fails is left out of the results; search fails only if all fail.
   */
  database?: string | readonly [string, ...string[]];
  languages: readonly [string, ...string[]];
  /** Appended to every tool result. Most statistics offices require it. */
  attribution: (lang: string) => string;
  /** Human-facing table page, cited next to the attribution. */
  tableUrl: (lang: string, tableId: string) => string;
  instructions: string;
  maxCells: number;
  /** Maximum estimated size of a query result in characters. Default 30,000 (about 8,000 tokens). */
  maxResultChars?: number;
  searchLimit: number;
  /** Builds the table id from a search hit, for example the table number in the title. */
  tableIdFromHit?: (hit: SearchHit) => string;
  /** True when the office keeps the table in its archive, for example by its path. */
  isArchived?: (hit: SearchHit) => boolean;
  /** Per language. Each matching alias adds one search in the database's own wording. */
  searchAliases?: Readonly<Record<string, readonly SearchAlias[]>>;
}
