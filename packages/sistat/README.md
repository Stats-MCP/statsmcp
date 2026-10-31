# sistat-mcp

An MCP server for [SiStat](https://pxweb.stat.si/SiStat/en), the database of the Statistical Office of the Republic of Slovenia (SURS). It gives AI assistants access to more than 4,800 tables in Slovenian and English.

> This project is not affiliated with or endorsed by SURS.

## Use the server

### Hosted

Add `https://statsmcp.dev/si/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/slovenia](https://statsmcp.dev/slovenia/).

### Local

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

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in their titles. Returns table IDs, titles and publication dates.       |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only. Each tool accepts `lang` (`sl` or `en`). For real calls and results, refer to the [examples](https://github.com/Stats-MCP/statsmcp/blob/main/docs/examples.md).

## Use it in your own server

```sh
npm install sistat-mcp
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createSistatServer } from 'sistat-mcp';

const server = createSistatServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createSistatServer` returns an `McpServer`. It also accepts a `cache`. To make one, install `pxweb-mcp` and use `createMemoryCache`, or implement the `Cache` interface.

## Data licence and attribution

SURS data is free to use for any purpose, including commercial use, if you name SURS as the source. Refer to the [SURS copyright terms](https://www.stat.si/StatWeb/en/StaticPages/Index/Copyright).

Each result contains the source line and a link to the table on SiStat. If you calculate new figures from the data, you must say so, for example: `Source: SURS / Calculated by <you>`.

## Licence

The code is under the MIT licence. The data belongs to SURS.
