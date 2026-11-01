# @statsmcp/stat-ee

An MCP server for the [database of Statistics Estonia](https://andmed.stat.ee/en/stat) (Statistikaamet). It gives AI assistants access to its tables in Estonian and English.

> This project is not affiliated with or endorsed by Statistics Estonia.

## Use the server

### Hosted

Add `https://statsmcp.dev/ee/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/estonia](https://statsmcp.dev/estonia/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "stat-ee": { "command": "npx", "args": ["-y", "@statsmcp/stat-ee"] }
  }
}
```

For Claude Code:

```sh
claude mcp add stat-ee -- npx -y @statsmcp/stat-ee
```

## Tools

| Tool                 | What it does                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `search_tables`      | Finds tables by keywords in their titles. Returns table IDs, titles and publication dates. Archived tables are marked. |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name.                       |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                                             |

All tools are read-only. Each tool accepts `lang` (`et` or `en`).

## Use it in your own server

```sh
npm install @statsmcp/stat-ee
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createStatEeServer } from '@statsmcp/stat-ee';

const server = createStatEeServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createStatEeServer` returns an `McpServer`. It also accepts a `cache`. To make one, install `@statsmcp/core` and use `createMemoryCache`, or implement the `Cache` interface.

## Data licence and attribution

Statistics Estonia shares its open data under the [Creative Commons Attribution-ShareAlike 4.0 licence (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/). You can use it for any purpose, including commercial use, if you name Statistics Estonia as the source. If you change the data or make new data from it, you must share the result under the same licence.

Each result contains the source line with the licence link, and a link to the table on andmed.stat.ee. If you change the data or calculate new figures, say so, for example: `Source: Statistics Estonia / Calculated by <you>, CC BY-SA 4.0`.

## Licence

The code is under the MIT licence. The data belongs to Statistics Estonia.
