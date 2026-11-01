# @statsmcp/statfin

An MCP server for [StatFin](https://pxdata.stat.fi/PxWeb/pxweb/en/StatFin/), the database of Statistics Finland (Tilastokeskus). It gives AI assistants access to its tables in Finnish, Swedish and English.

> This project is not affiliated with or endorsed by Statistics Finland.

## Use the server

### Hosted

Add `https://statsmcp.dev/fi/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/finland](https://statsmcp.dev/finland/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "statfin": { "command": "npx", "args": ["-y", "@statsmcp/statfin"] }
  }
}
```

For Claude Code:

```sh
claude mcp add statfin -- npx -y @statsmcp/statfin
```

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in their titles. Returns table IDs, titles and publication dates.       |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only. Each tool accepts `lang` (`fi`, `sv` or `en`). Statistics Finland allows about 40 API calls per minute. The server keeps results in a cache to use fewer calls.

## Use it in your own server

```sh
npm install @statsmcp/statfin
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createStatfinServer } from '@statsmcp/statfin';

const server = createStatfinServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createStatfinServer` returns an `McpServer`. It also accepts a `cache`. To make one, install `@statsmcp/core` and use `createMemoryCache`, or implement the `Cache` interface.

## Data licence and attribution

Statistics Finland publishes its data under the [Creative Commons Attribution 4.0 licence (CC BY 4.0)](https://stat.fi/en/about-us/get-to-know-statistics-finland/legislation/terms-of-use). You can use it for any purpose, including commercial use, if you name Statistics Finland as the source.

Each result contains the source line with the licence link, and a link to the table on StatFin. If you change the data or calculate new figures, say so, for example: `Source: Statistics Finland / Calculated by <you>`.

## Licence

The code is under the MIT licence. The data belongs to Statistics Finland.
