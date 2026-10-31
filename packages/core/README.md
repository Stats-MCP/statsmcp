# pxweb-mcp

A toolkit to make MCP servers for statistics databases that use the [PxWeb API v1](https://www.scb.se/en/services/open-data-api/api-for-the-statistical-database/). Many national statistics offices use PxWeb.

For a ready server, refer to [sistat-mcp](https://www.npmjs.com/package/sistat-mcp) (Slovenia).

## Install

You need Node.js 20 or later.

```sh
npm install pxweb-mcp @modelcontextprotocol/server
```

`@modelcontextprotocol/server` is a peer dependency. Your server and this package must use the same copy.

## Make a server

Make a `PxwebPreset` for the PxWeb instance, then give it to `createPresetServer`:

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import {
  createMemoryCache,
  createPresetServer,
  type PxwebPreset
} from 'pxweb-mcp';

const preset: PxwebPreset = {
  name: 'statfin',
  title: 'Statistics Finland',
  version: '0.1.0',
  apiBaseUrl: 'https://pxdata.stat.fi/PXWeb/api/v1',
  database: 'StatFin',
  languages: ['fi', 'en', 'sv'],
  attribution: () => 'Source: Statistics Finland',
  tableUrl: (lang) => `https://pxdata.stat.fi/PxWeb/pxweb/${lang}/StatFin/`,
  instructions: 'Official statistics for Finland. Call search_tables first.',
  maxCells: 5000,
  searchLimit: 10
};

const server = createPresetServer(preset, { cache: createMemoryCache() });
await server.connect(new StdioServerTransport());
```

`createPresetServer` makes the PxWeb client from the preset. Its options are `cache`, `fetch` and `userAgent`. The default user agent is `<name>-mcp/<version>`. To use your own client, call `createPxwebServer(preset, client)`.

The server has three tools: `search_tables`, `get_table_metadata` and `query_table`. Each result ends with the text from `attribution`. Results of the table tools also contain the link from `tableUrl`.

## Preset fields

| Field           | Description                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | Server name that the MCP client sees.                                                                                                                    |
| `title`         | Display name.                                                                                                                                            |
| `version`       | Server version.                                                                                                                                          |
| `apiBaseUrl`    | API root, without the language segment. If each language has its own root, use an object, for example `{ en: '…/pxen/api/v1', is: '…/pxis/api/v1' }`.    |
| `database`      | Optional. Path segment after the language: `Data` (default) on SiStat, `table` on SSB, `StatFin` on StatFin.                                             |
| `languages`     | Language codes. The first one is the default.                                                                                                            |
| `attribution`   | Source line for a language. It is added to every result.                                                                                                 |
| `tableUrl`      | Link in table results. It gets the language and the table ID.                                                                                            |
| `instructions`  | Instructions for the model, sent when the client connects.                                                                                               |
| `maxCells`      | Maximum number of cells in one query. Larger queries are refused.                                                                                        |
| `searchLimit`   | Default number of search results.                                                                                                                        |
| `searchAliases` | Optional. Per language, `{ terms, query }` pairs. If the query contains a term, the server also searches for `query`, for example `salary` → `earnings`. |

## Other exports

- `createPxwebClient`: the PxWeb client alone (`search`, `getMetadata`, `query`). It has a timeout and a response size limit, and it validates each response.
- `createMemoryCache`: an in-memory cache with a size limit. To use a different store, implement the `Cache` interface (`get` and `set`).
- `planQuery`: checks a selection against the table metadata and counts the cells.
- `flattenJsonStat` and `toCsv`: convert a JSON-stat 2 dataset to rows and CSV.
- `PxwebError` and `QueryPlanError`: the errors of the client and the planner.

## Terms of use

Before you publish a server for a PxWeb instance, read the terms of use of that statistics office. Most offices require that you name them as the source.

## Licence

MIT
