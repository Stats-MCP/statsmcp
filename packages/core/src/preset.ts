export interface PxwebPreset {
  /** MCP server name, for example "sistat". */
  name: string;
  title: string;
  version: string;
  /** PxWeb API v1 root, for example "https://pxweb.stat.si/SiStatData/api/v1". */
  apiBaseUrl: string;
  languages: readonly [string, ...string[]];
  /** Appended to every tool result. Most statistics offices require it. */
  attribution: (lang: string) => string;
  /** Human-facing table page, cited next to the attribution. */
  tableUrl: (lang: string, tableId: string) => string;
  instructions: string;
  maxCells: number;
  searchLimit: number;
}
