import type { SearchHit } from '@/pxweb-client';

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
  /** PxWeb API v1 root, for example "https://pxweb.stat.si/SiStatData/api/v1". */
  apiBaseUrl: string;
  /** Path segment after the language: "Data" on SiStat (the default), "table" on SSB. */
  database?: string;
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
  /** Per language. Each matching alias adds one search in the database's own wording. */
  searchAliases?: Readonly<Record<string, readonly SearchAlias[]>>;
}
