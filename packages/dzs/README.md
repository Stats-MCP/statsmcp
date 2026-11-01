# dzs-mcp

An MCP server for the [PX-Web database of the Croatian Bureau of Statistics](https://web.dzs.hr/PXWeb/pxweb/en/) (Državni zavod za statistiku). It gives AI assistants access to its tables.

> This project is not affiliated with or endorsed by the Croatian Bureau of Statistics.

## Use the server

### Hosted

Add `https://statsmcp.dev/hr/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/croatia](https://statsmcp.dev/croatia/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "dzs": { "command": "npx", "args": ["-y", "dzs-mcp"] }
  }
}
```

For Claude Code:

```sh
claude mcp add dzs -- npx -y dzs-mcp
```

The API of the office has no list of all tables. The server searches a copy of the table list from https://statsmcp.dev, or the copy in the package. To stop all requests to statsmcp.dev, set the environment variable `STATSMCP_INDEX=off`.

## Tools

| Tool                 | What it does                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `search_tables`      | Finds tables by keywords in their titles and folders. Returns table IDs, titles and update dates. |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name.  |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                        |

All tools are read-only. Each tool accepts `lang` (`hr` or `en`). The Croatian list has one database more than the English list (settlements and population of Croatia).

## Use it in your own server

```sh
npm install dzs-mcp
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createDzsServer } from 'dzs-mcp';
import { nodeTableSnapshots } from 'pxweb-mcp/node';

const server = createDzsServer({
  userAgent: 'my-app/1.0',
  tableSnapshots: nodeTableSnapshots(new URL('./snapshots/', import.meta.url))
});
await server.connect(new StdioServerTransport());
```

`createDzsServer` returns an `McpServer`. Search needs `tableSnapshots`. It also accepts a `cache`.

## Data licence and attribution

The Croatian Bureau of Statistics publishes its data under the [Open Licence of the Republic of Croatia](https://web.dzs.hr/Hrv/about_us/Legals/Open%20Licence.pdf). You can use the data and the metadata for any purpose, including commercial use. You must name the source, give the date of the last update and link to the table.

Each result contains the source line and a link to the table. The search results show the date of the last update of each table. Give this date with the source. If you change the data or calculate new figures, say so, for example: `Croatian Bureau of Statistics and own calculations`. Do not suggest that the Croatian Bureau of Statistics endorses your product.

## Licence

The code is under the MIT licence. The data belongs to the Croatian Bureau of Statistics.
