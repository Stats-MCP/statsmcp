# @statsmcp/cso

An MCP server for [PxStat](https://data.cso.ie/), the database of the Central Statistics Office of Ireland (CSO). It gives AI assistants access to more than 13,000 tables.

> This project is not affiliated with or endorsed by the Central Statistics Office.

## Use the server

### Hosted

Add `https://statsmcp.dev/ie/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/ireland](https://statsmcp.dev/ireland/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "cso": { "command": "npx", "args": ["-y", "@statsmcp/cso"] }
  }
}
```

For Claude Code:

```sh
claude mcp add cso -- npx -y @statsmcp/cso
```

The API of the CSO has no search. The server searches a copy of the table list from https://statsmcp.dev, or the copy in the package. To stop all requests to statsmcp.dev, set the environment variable `STATSMCP_INDEX=off`.

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in their titles. Titles show the variables and the period range.        |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only. The data is in English.

## Use it in your own server

```sh
npm install @statsmcp/cso
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';
import { createCsoServer } from '@statsmcp/cso';

const server = createCsoServer({
  userAgent: 'my-app/1.0',
  tableSnapshots: nodeTableSnapshots(new URL('./snapshots/', import.meta.url))
});
await server.connect(new StdioServerTransport());
```

`createCsoServer` returns an `McpServer`. Search needs `tableSnapshots`. It also accepts a `cache`.

## Data licence and attribution

The CSO publishes its statistics under the [Creative Commons Attribution 4.0 licence (CC BY 4.0)](https://www.cso.ie/en/aboutus/whoweare/copyrightpolicy/). You can use them for any purpose, including commercial use, if you name the CSO as the source. Do not use the CSO logo for commercial purposes.

Each result contains the source line and a link to the table. If you change the data or calculate new figures, say so, for example: `CSO and own calculations`. Do not suggest that the CSO endorses your product.

## Licence

The code is under the MIT licence. The data belongs to the Central Statistics Office, Ireland.
