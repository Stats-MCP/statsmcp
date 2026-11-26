# @statsmcp/bns

An MCP server for the [StatBank](https://statbank.statistica.md/PxWeb/pxweb/en/) of the National Bureau of Statistics of the Republic of Moldova (NBS). It gives AI assistants access to its tables in Romanian and English.

> This project is not affiliated with or endorsed by the National Bureau of Statistics of the Republic of Moldova.

## Use the server

### Hosted

Add `https://statsmcp.dev/md/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/moldova](https://statsmcp.dev/moldova/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "bns": { "command": "npx", "args": ["-y", "@statsmcp/bns"] }
  }
}
```

For Claude Code:

```sh
claude mcp add bns -- npx -y @statsmcp/bns
```

The API of the office would need one search per database, more than its rate limit allows. The server searches a copy of the table list from https://statsmcp.dev, or the copy in the package. To stop all requests to statsmcp.dev, set the environment variable `STATSMCP_INDEX=off`.

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in English or Romanian in all six thematic databases.                   |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only. Some tables are split by period: an older table and a newer one for the latest years.

## Use it in your own server

```sh
npm install @statsmcp/bns
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createBnsServer } from '@statsmcp/bns';
import { nodeTableSnapshots } from '@statsmcp/core/node';

const server = createBnsServer({
  userAgent: 'my-app/1.0',
  tableSnapshots: nodeTableSnapshots(new URL('./snapshots/', import.meta.url))
});
await server.connect(new StdioServerTransport());
```

`createBnsServer` returns an `McpServer`. Search needs `tableSnapshots`. It also accepts a `cache`.

## Data licence and attribution

The NBS publishes its content under the [Creative Commons Attribution 4.0 licence (CC BY 4.0)](https://statistica.gov.md/en/copyright-139.html). You can use it for commercial and non-commercial purposes if you state the source with a link to the material and say when you changed it.

Each result contains the source line and a link to the table.

## Licence

The code is under the MIT licence. The data belongs to the National Bureau of Statistics of the Republic of Moldova.
