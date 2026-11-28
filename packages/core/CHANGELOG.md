# @statsmcp/core

## 0.7.0

### Minor Changes

- [`af924ff`](https://github.com/Stats-MCP/statsmcp/commit/af924ffa6009fdb9aa5bfcb5a0b9f47c6d816c60) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Add Switzerland: the new package `@statsmcp/bfs` serves STAT-TAB, the PxWeb database of the Swiss Federal Statistical Office, in German, French, Italian and English. PxWeb presets can now set `databasePattern` for offices with one database per table.

## 0.6.0

### Patch Changes

- [`d557477`](https://github.com/Stats-MCP/statsmcp/commit/d557477ae2de26e1764389434e625b8a40204080) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Search ignores Portuguese and Spanish function words such as "de" and "por".

## 0.5.0

### Minor Changes

- [`0a31c89`](https://github.com/Stats-MCP/statsmcp/commit/0a31c89598b183f40c1529d1918bf759cd107a46) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Snapshots can carry a prebuilt search index (`searchIndex`), so search loads it instead of building it. The crawler writes it, and `crawl --reindex` adds it to existing snapshots.

### Patch Changes

- [`203c0b4`](https://github.com/Stats-MCP/statsmcp/commit/203c0b43ce1a5fb2f2ca0e7923a62f4ecd319078) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Find CBS tables with lower-case ids, such as 80590eng, on OData v4.

- [`b08c503`](https://github.com/Stats-MCP/statsmcp/commit/b08c503cb4511b6f45405e2ca90402b63f5dc4e4) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - The Statistics Lithuania and IBGE clients search a crawled table list first when one is given (`crawledList`), so the hosted worker no longer downloads their whole catalogues.

- [`4084aec`](https://github.com/Stats-MCP/statsmcp/commit/4084aec5edf7fcbc0a0dc0fc8cb510519573f471) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - The INSEE client keeps only finished tables in its table cache, so a load stopped on Cloudflare Workers no longer breaks later requests.

- [`fe90f8f`](https://github.com/Stats-MCP/statsmcp/commit/fe90f8f05321c79b00a761e50c32167fa1fc8fe6) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Let a PxWeb preset name time variables that the API does not flag, so `latest` picks the newest periods.

- [`e4312cf`](https://github.com/Stats-MCP/statsmcp/commit/e4312cff1301d8c12e3454fd21102abb5d884771) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - The Statistics Lithuania client stops a download at the observation limit, also when its period estimate is too low.

- [`c5f4f97`](https://github.com/Stats-MCP/statsmcp/commit/c5f4f97dcca8ed0e3c1901bb095628c92aed7931) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Search no longer waits on an index build that never finished. On Cloudflare Workers, a build stopped by the CPU limit made later searches fail; now a later search starts a new build.

- [`21c7635`](https://github.com/Stats-MCP/statsmcp/commit/21c7635441b11a15e7854fac716212ff4117b1a4) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Name the error type in the message for an unexpected tool error.

## 0.4.1

### Patch Changes

- [`d4c87e0`](https://github.com/Stats-MCP/statsmcp/commit/d4c87e067a46557722f1028cb888d6c954929a18) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Refuse oversized tool inputs, reject dot-only Eurostat codes, keep CBS paging on its own host and report CBS rate limits instead of 'not found'.

- [`26eaec3`](https://github.com/Stats-MCP/statsmcp/commit/26eaec3392c6cb6910a287b3f6a8cdbfa4fc795d) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - `latest: N` now returns N periods for daily, weekly and irregular tables, and query_table refuses results above the cell or size limit.

## 0.4.0

### Minor Changes

- [`540f1e6`](https://github.com/Stats-MCP/statsmcp/commit/540f1e6c862948c2166b1d5f5a0100ca6dc4a84e) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Add `createMultiServer`: one MCP server for many offices, with a required `country` argument on the data tools and a `list_countries` tool.

### Patch Changes

- [`f353e63`](https://github.com/Stats-MCP/statsmcp/commit/f353e63c0f8bf9ab920739f4c6b900b96c406150) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Server instructions now tell the model to call `search_tables` first, unless the user gives a table id, and to use only table ids from search results or from the user.

- [`5fb591e`](https://github.com/Stats-MCP/statsmcp/commit/5fb591e9d6e0b58a93bb8a2bf14f20f5539c5803) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Make the tool list smaller: leave the `$schema` URI out of tool input schemas and shorten the all-countries instructions and argument descriptions (about 270 fewer tokens for `/mcp`, 78 for one office).

## 0.3.0

### Minor Changes

- Packages now publish under the `@statsmcp` scope. This package was `pxweb-mcp`.
- [`735cc71`](https://github.com/Stats-MCP/statsmcp/commit/735cc71cec49dad952cea5c296bfa984ea489c0a) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Add an SDMX-JSON client (`api: 'sdmx'`, with `sdmxAgency`), first used for the Australian Bureau of Statistics.

### Patch Changes

- [`61cb1cc`](https://github.com/Stats-MCP/statsmcp/commit/61cb1ccc3dda0ee86068d05dbcfe42b9b2fe27dd) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - CBS: read tables from OData v4 (datasets.cbs.nl) when the v3 service refuses the request, as it does from Cloudflare Workers.

## 0.2.0

### Minor Changes

- [`fc5246e`](https://github.com/Stats-MCP/statsmcp/commit/fc5246eac3c0fce4abeec012b14dd876db769577) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - A preset can mark archived tables (`isArchived`). Search ranks them low and marks them "archived".

- [`dcf68e3`](https://github.com/Stats-MCP/statsmcp/commit/dcf68e3241a3d9342f76b6ef679879c35b67ae2e) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Add `createCbsODataClient` for the OData service of Statistics Netherlands (`api: 'cbs-odata'`). Measures appear as a "Topics" variable.

- [`8c75c5d`](https://github.com/Stats-MCP/statsmcp/commit/8c75c5dabdd75d55f23e0aef5972c44b6f8a976d) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Add `createEurostatClient` for the Eurostat dissemination API (`api: 'eurostat'`), and `createTextRequester` for APIs that answer with XML or TSV.

- [`3e6fc93`](https://github.com/Stats-MCP/statsmcp/commit/3e6fc93fca12e5cac35070b6746b9d48b0d635dc) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - A preset can set one API root per language (`apiBaseUrl: { en: …, is: … }`).

- [`9ba6878`](https://github.com/Stats-MCP/statsmcp/commit/9ba6878788d74262ca8b77b6843fce20c3bcd7f4) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Add `createPxstatClient` for PxStat (`api: 'cso-pxstat'`): metadata from the REST API, filtered data over JSON-RPC (an omitted optional variable gives its total), and search over the crawled table snapshot.

- [`31d2026`](https://github.com/Stats-MCP/statsmcp/commit/31d2026b3d6130bac2ea93deee4fcb83c3624afc) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Support the PxWeb API v2 (`createPxwebV2Client`) and the StatBank API of Statistics Denmark (`createStatbankDkClient`). A preset picks one with `api: 'pxweb-v2'` or `api: 'statbank-dk'`.

- [`95b8bee`](https://github.com/Stats-MCP/statsmcp/commit/95b8bee420e14df50790a2a286f2618fbfbd8f54) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Rank search results so that current tables come before historical series, refuse query results that are too large for the model context, add search aliases (for example "salary" also searches "earnings"), report unknown tables clearly, accept table ids without a `.px` suffix, and add `createPresetServer` with a `database` preset field.

- [`75c34d9`](https://github.com/Stats-MCP/statsmcp/commit/75c34d9290582025b463177cacc97199dfda193d) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - A preset can list several databases. Search covers all of them, and each table id starts with its database.

- [`a4bf6fe`](https://github.com/Stats-MCP/statsmcp/commit/a4bf6fedd96141f2fb2e57ee3e8ec734334ef6c1) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Add `createSingstatClient` for the SingStat Table Builder API of Singapore (`api: 'singstat'`).

- [`29ad2dc`](https://github.com/Stats-MCP/statsmcp/commit/29ad2dcd966398fc1f2b0e0577c40c355631b2e0) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Add table snapshots (`writeSnapshot`, `readSnapshot`, URL and R2 readers, `firstSnapshot`) and one zod schema for table documents.

- [`072ed69`](https://github.com/Stats-MCP/statsmcp/commit/072ed69228e4ceb2b6d095d200bb464d318939ee) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Add `createStatcanClient` for the Web Data Service of Statistics Canada (`api: 'statcan-wds'`).

- [`7b4d755`](https://github.com/Stats-MCP/statsmcp/commit/7b4d75564a2d9f1e692f40844684adc20e7b99df) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Add `createTableIndex`, a BM25 table search with stop words, folding, prefix and fuzzy matching and fusion with the office's catalogue order.

- [`b6471ce`](https://github.com/Stats-MCP/statsmcp/commit/b6471ced4f0682a6980260433bb0d5c263fe87cf) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - If the live table list of a source fails, search uses a crawled snapshot: first from statsmcp.dev, then the copy in the package. Set `STATSMCP_INDEX=off` to stop the requests to statsmcp.dev. New exports: `createPresetClient`, the `tableSnapshots` server option and `pxweb-mcp/node` (`nodeTableSnapshots`).

- [`421f4e8`](https://github.com/Stats-MCP/statsmcp/commit/421f4e83ab4a8f8b38fa4fef9b370766a1f23353) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - Add `searchTitles`, a keyword search over a local table list for APIs without a working search. Search now also folds ø, æ, ß, ł and similar letters.

- [`356ac0a`](https://github.com/Stats-MCP/statsmcp/commit/356ac0ab85002d1f069dc4d43e25901d59f134c8) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - A PxWeb v1 preset with `search: 'index'` searches the crawled table snapshot (`tableSnapshots`). Table ids may contain spaces, commas, dashes and letters with diacritics; each path segment is URL-encoded. Search also finds a path id by its unique file name, for example MAN00101.

- [`ab6f7ee`](https://github.com/Stats-MCP/statsmcp/commit/ab6f7eede6ee01adf65d3c98f1a77e27ed9044bf) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - PxWeb v2 presets can search a local index of all tables (`search: 'index'`); scb-mcp uses it.

### Patch Changes

- [`99c538c`](https://github.com/Stats-MCP/statsmcp/commit/99c538c08980acfa5b9b56b37d966b266fb97259) Thanks [@TadejPolajnar](https://github.com/TadejPolajnar)! - CBS search ranks the national tables above the tables for Caribbean Netherlands (Bonaire, Sint Eustatius and Saba). A query that names the Caribbean Netherlands still finds those tables.
