# @statsmcp/bfs

An MCP server for [STAT-TAB](https://www.pxweb.bfs.admin.ch/pxweb/en/), the PxWeb database of the Swiss Federal Statistical Office (Bundesamt für Statistik BFS, Office fédéral de la statistique OFS, Ufficio federale di statistica UST). It gives AI assistants access to its tables in German, French, Italian and English.

> This project is not affiliated with or endorsed by the Federal Statistical Office.

## Use the server

### Hosted

Add `https://statsmcp.dev/ch/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/switzerland](https://statsmcp.dev/switzerland/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "bfs": { "command": "npx", "args": ["-y", "@statsmcp/bfs"] }
  }
}
```

For Claude Code:

```sh
claude mcp add bfs -- npx -y @statsmcp/bfs
```

The API of the office has no list of all tables. The server searches a copy of the table list from https://statsmcp.dev, or the copy in the package. To stop all requests to statsmcp.dev, set the environment variable `STATSMCP_INDEX=off`.

## Tools

| Tool                 | What it does                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `search_tables`      | Finds tables by keywords in their titles and folders. Returns table IDs, titles and update dates. |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name.  |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                        |

All tools are read-only. Each tool accepts `lang` (`de`, `fr`, `it` or `en`). German has the most tables. Some tables are not in English.

## Use it in your own server

```sh
npm install @statsmcp/bfs
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createBfsServer } from '@statsmcp/bfs';
import { nodeTableSnapshots } from '@statsmcp/core/node';

const server = createBfsServer({
  userAgent: 'my-app/1.0',
  tableSnapshots: nodeTableSnapshots(new URL('./snapshots/', import.meta.url))
});
await server.connect(new StdioServerTransport());
```

`createBfsServer` returns an `McpServer`. Search needs `tableSnapshots`. It also accepts a `cache`.

## Data licence and attribution

STAT-TAB states its terms of use on every page: "Open use. Must provide the source." This is the opendata.swiss category "Open use. Must provide the source.", which allows commercial use (https://opendata.swiss/en/terms-of-use).

Each result contains the source line and a link to the table. If you calculate new figures from the data, say so, for example: `Federal Statistical Office and own calculations`. Do not suggest that the Federal Statistical Office endorses your product.

The API allows 50 calls per 15 seconds per IP address.

## Licence

The code is under the MIT licence. The data belongs to the Federal Statistical Office.
