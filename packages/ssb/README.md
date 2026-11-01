# @statsmcp/ssb

An MCP server for [Statbank Norway](https://www.ssb.no/en/statbank), the database of Statistics Norway (SSB). It gives AI assistants access to Statbank tables in Norwegian and English.

> This project is not affiliated with or endorsed by Statistics Norway.

## Use the server

### Hosted

Add `https://statsmcp.dev/no/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/norway](https://statsmcp.dev/norway/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "ssb": { "command": "npx", "args": ["-y", "@statsmcp/ssb"] }
  }
}
```

For Claude Code:

```sh
claude mcp add ssb -- npx -y @statsmcp/ssb
```

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in their titles. Returns table numbers, titles and publication dates.   |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only. Each tool accepts `lang` (`no` or `en`).

SSB allows about 40 API calls per minute. The server keeps results in a cache to use fewer calls.

## Use it in your own server

```sh
npm install @statsmcp/ssb
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createSsbServer } from '@statsmcp/ssb';

const server = createSsbServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createSsbServer` returns an `McpServer`. It also accepts a `cache`. To make one, install `@statsmcp/core` and use `createMemoryCache`, or implement the `Cache` interface.

## Data licence and attribution

SSB data is under the [Creative Commons Attribution 4.0 licence (CC BY 4.0)](https://www.ssb.no/en/diverse/lisens). You can use it for any purpose, including commercial use, if you name Statistics Norway (SSB) as the source.

Each result contains the source line with the licence link, and a link to the table on ssb.no. If you change the data or calculate new figures, you must say so, for example: `Source: Statistics Norway (SSB) / Calculated by <you>`.

## Licence

The code is under the MIT licence. The data belongs to Statistics Norway.
