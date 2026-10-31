# pxweb-mcp

MCP servers for official statistics published through the [PxWeb API v1](https://www.scb.se/en/services/open-data-api/api-for-the-statistical-database/).

The first server is **sistat-mcp**. It gives AI assistants access to [SiStat](https://pxweb.stat.si/SiStat/en), the database of the Statistical Office of the Republic of Slovenia (SURS). SiStat has more than 4,800 tables, in Slovenian and English.

> This project is not affiliated with or endorsed by SURS.

## Packages

| Package                         | Description                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [`pxweb-mcp`](packages/core)    | Generic toolkit: PxWeb v1 client, query planner, MCP tools. Use it to make a server for a different PxWeb instance. |
| [`sistat-mcp`](packages/sistat) | SiStat preset and a stdio server.                                                                                   |
| [`apps/worker`](apps/worker)    | The free hosted endpoint on Cloudflare Workers.                                                                     |

## Use the server

### Hosted endpoint

The hosted endpoint is free and needs no authentication. The public URL is not available yet.

```json
{
  "mcpServers": {
    "sistat": { "url": "https://<domain>/mcp" }
  }
}
```

### Local (stdio)

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "sistat": { "command": "npx", "args": ["-y", "sistat-mcp"] }
  }
}
```

For Claude Code:

```sh
claude mcp add sistat -- npx -y sistat-mcp
```

## Tools

| Tool                 | What it does                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in their titles. Returns table IDs, titles and publication dates.                                                             |
| `get_table_metadata` | Lists the variables of a table and their value codes. Long lists are shortened. Use `valueFilter` to find a value by name, for example a municipality. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods. A query that is too large is refused with advice on how to make it smaller. |

All tools are read-only. Each tool accepts `lang` (`sl` or `en`).

For real calls and results, refer to [docs/examples.md](docs/examples.md).

## Data licence and attribution

SURS data is free to use for any purpose, including commercial use, if you name SURS as the source. Refer to the [SURS copyright terms](https://www.stat.si/StatWeb/en/StaticPages/Index/Copyright). The Slovenian open data portal lists SiStat tables under [CC BY 4.0](https://podatki.gov.si/).

This server adds the source to every result:

- `Source: SURS (Statistical Office of the Republic of Slovenia)` (English)
- `Vir: SURS (Statistični urad Republike Slovenije)` (Slovenian)

Each `get_table_metadata` and `query_table` result also includes the table ID and a link to the table on SiStat.

If you calculate new figures from the data, you must say so, for example: `Source: SURS / Calculated by <you>`.

## Limits

- One query can return a maximum of 5,000 cells. The SiStat API allows 50 million cells, but large results fill the context of the model.
- The hosted endpoint allows 60 requests per minute for each IP address.
- Search results are cached for 1 hour, table metadata for 24 hours, and query results for 1 hour.

## Development

You need Node.js 24 and pnpm 12.

```sh
pnpm install
pnpm build        # build packages/core and packages/sistat
pnpm test         # unit tests
pnpm typecheck
pnpm format       # oxfmt check
```

### Test locally

1. Build the packages:

   ```sh
   pnpm install && pnpm build
   ```

2. Connect a client. Use one of these two options.

   Stdio server from source:

   ```sh
   claude mcp add sistat-local -- node "$PWD/packages/sistat/dist/bin.mjs"
   ```

   Worker on your computer (the same code as the hosted endpoint):

   ```sh
   pnpm dev:worker
   claude mcp add --transport http sistat-worker http://127.0.0.1:8787/mcp
   ```

3. Ask a question from [docs/examples.md](docs/examples.md), for example "What is the latest inflation rate in Slovenia?".

To call the tools without an assistant, use the MCP Inspector:

```sh
npx @modelcontextprotocol/inspector node packages/sistat/dist/bin.mjs
```

Deploy the Worker:

```sh
pnpm deploy:worker
```

The Worker caches in memory and in the Cloudflare Cache API. The Cache API stores data only on a custom domain. On `workers.dev`, only the in-memory cache keeps data.

## Add a different PxWeb instance

Make a `PxwebPreset` and give it to `createPxwebServer`:

```ts
import {
  createPxwebClient,
  createPxwebServer,
  type PxwebPreset
} from 'pxweb-mcp';

const preset: PxwebPreset = {
  name: 'statfin',
  title: 'Statistics Finland',
  version: '0.1.0',
  apiBaseUrl: 'https://pxdata.stat.fi/PXWeb/api/v1',
  languages: ['fi', 'en', 'sv'],
  attribution: () => 'Source: Statistics Finland',
  tableUrl: (lang) => `https://pxdata.stat.fi/PxWeb/pxweb/${lang}/StatFin/`,
  instructions: 'Official statistics for Finland. Call search_tables first.',
  maxCells: 5000,
  searchLimit: 10
};

const server = createPxwebServer(
  preset,
  createPxwebClient({ baseUrl: preset.apiBaseUrl, database: 'StatFin' })
);
```

The `database` option is the path segment after the language. On SiStat it is `Data` (the default). On StatFin it is `StatFin`.

Before you publish a server for a different instance, read the terms of use of that statistics office.

## Licence

The code is under the [MIT](LICENSE) licence. The data belongs to the statistics office that publishes it.
