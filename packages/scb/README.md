# @statsmcp/scb

An MCP server for the [Statistical Database](https://www.statistikdatabasen.scb.se/pxweb/en/ssd/) of Statistics Sweden (SCB). It uses the PxWeb API v2 and gives AI assistants access to its tables in Swedish and English.

> This project is not affiliated with or endorsed by Statistics Sweden.

## Use the server

### Hosted

Add `https://statsmcp.dev/se/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/sweden](https://statsmcp.dev/sweden/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "scb": { "command": "npx", "args": ["-y", "@statsmcp/scb"] }
  }
}
```

For Claude Code:

```sh
claude mcp add scb -- npx -y @statsmcp/scb
```

The server searches the full table list of the office. If the office API cannot give this list, the server uses a copy of the list from https://statsmcp.dev, or the copy in the package. To stop all requests to statsmcp.dev, set the environment variable `STATSMCP_INDEX=off`.

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in their titles. Returns table IDs, titles and publication dates.       |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only. Each tool accepts `lang` (`sv` or `en`). Statistics Sweden allows about 30 API calls per 10 seconds. Tables that are no longer updated are marked "archived". The server keeps results in a cache to use fewer calls.

## Use it in your own server

```sh
npm install @statsmcp/scb
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createScbServer } from '@statsmcp/scb';

const server = createScbServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createScbServer` returns an `McpServer`. It also accepts a `cache`. To make one, install `@statsmcp/core` and use `createMemoryCache`, or implement the `Cache` interface.

## Data licence and attribution

Statistics Sweden publishes the Statistical Database under [CC0](https://creativecommons.org/publicdomain/zero/1.0/). You can use the data for any purpose. Statistics Sweden asks you to name it as the source: `Source: Statistics Sweden`.

Each result contains the source line and the table ID. If you change the data or calculate new figures, say so, for example: `Source: Statistics Sweden / Calculated by <you>`.

## Licence

The code is under the MIT licence. The data belongs to Statistics Sweden.
