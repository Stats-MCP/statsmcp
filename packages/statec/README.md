# @statsmcp/statec

An MCP server for [LUSTAT](https://lustat.statec.lu/), the statistics portal of STATEC, the national statistics office of Luxembourg. It gives AI assistants access to its tables in English and French.

> This project is not affiliated with or endorsed by STATEC.

## Use the server

### Hosted

Add `https://statsmcp.dev/lu/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/luxembourg](https://statsmcp.dev/luxembourg/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "statec": { "command": "npx", "args": ["-y", "@statsmcp/statec"] }
  }
}
```

For Claude Code:

```sh
claude mcp add statec -- npx -y @statsmcp/statec
```

SDMX has no title search. The server searches the list of dataflows. If that list cannot be loaded, it uses a copy from https://statsmcp.dev or the copy in the package. To stop all requests to statsmcp.dev, set the environment variable `STATSMCP_INDEX=off`.

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in English or French.                                                   |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only.

## Use it in your own server

```sh
npm install @statsmcp/statec
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';
import { createStatecServer } from '@statsmcp/statec';

const server = createStatecServer({
  userAgent: 'my-app/1.0',
  tableSnapshots: nodeTableSnapshots(new URL('./snapshots/', import.meta.url))
});
await server.connect(new StdioServerTransport());
```

`createStatecServer` returns an `McpServer`. It also accepts a `cache`.

## Data licence and attribution

STATEC publishes LUSTAT under [Creative Commons CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), without restriction. Its [usage guidelines](https://statistiques.public.lu/en/support/notice.html) are based on goodwill: keep the links to CC0 and to the guidelines, say when you changed the data, and do not suggest that STATEC endorses your use.

Each result contains the source line with these links and a link to the table.

## Licence

The code is under the MIT licence. The data is published by STATEC under CC0 1.0.
