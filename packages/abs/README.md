# @statsmcp/abs

An MCP server for the [Data API of the Australian Bureau of Statistics](https://www.abs.gov.au/about/data-services/application-programming-interfaces-apis/data-api-user-guide) (ABS). It gives AI assistants access to its statistical tables.

> This project is not affiliated with or endorsed by the Australian Bureau of Statistics.

## Use the server

### Hosted

Add `https://statsmcp.dev/au/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/australia](https://statsmcp.dev/australia/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "abs": { "command": "npx", "args": ["-y", "@statsmcp/abs"] }
  }
}
```

For Claude Code:

```sh
claude mcp add abs -- npx -y @statsmcp/abs
```

The server searches the full table list of the ABS. If the ABS API cannot give this list, the server uses a copy of the list from https://statsmcp.dev, or the copy in the package. To stop all requests to statsmcp.dev, set the environment variable `STATSMCP_INDEX=off`.

## Tools

| Tool                 | What it does                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `search_tables`      | Finds tables by keywords in their titles. Returns table IDs and titles.                                  |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name.         |
| `query_table`        | Returns data as CSV with readable labels and the unit. Use `latest` on `TIME_PERIOD` for recent periods. |

All tools are read-only. The ABS publishes in English only (`lang` is `en`).

## Use it in your own server

```sh
npm install @statsmcp/abs
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createAbsServer } from '@statsmcp/abs';

const server = createAbsServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createAbsServer` returns an `McpServer`. It also accepts a `cache` and `tableSnapshots`.

## Data licence and attribution

The ABS publishes most of its material under the [Creative Commons Attribution 4.0 licence (CC BY 4.0)](https://www.abs.gov.au/website-privacy-copyright-and-disclaimer#copyright-and-creative-commons). You can use it for any purpose, including commercial use, if you name the ABS as the source.

Each result contains the source line and a link to the table. If you change the data or calculate new figures, say so. Do not suggest that the ABS endorses your product.

## Licence

The code is under the MIT licence. The data belongs to the Australian Bureau of Statistics.
