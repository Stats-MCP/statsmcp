# pxweb-mcp

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
