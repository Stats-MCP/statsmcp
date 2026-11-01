# statsmcp-statcan

An MCP server for the [data tables of Statistics Canada](https://www150.statcan.gc.ca/n1/en/type/data). It gives AI assistants access to more than 8,000 tables in English and French.

> This project is not affiliated with or endorsed by Statistics Canada.

## Use the server

### Hosted

Add `https://statsmcp.dev/ca/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/canada](https://statsmcp.dev/canada/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "statcan": { "command": "npx", "args": ["-y", "statsmcp-statcan"] }
  }
}
```

For Claude Code:

```sh
claude mcp add statcan -- npx -y statsmcp-statcan
```

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in their titles. Returns table IDs, titles and publication dates.       |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only. Each tool accepts `lang` (`en` or `fr`). Variables are numbered by position, and the server adds a `time` variable. Not every combination of members exists. Archived tables are marked "archived".

## Use it in your own server

```sh
npm install statsmcp-statcan
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createStatcanServer } from 'statsmcp-statcan';

const server = createStatcanServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createStatcanServer` returns an `McpServer`. It also accepts a `cache`. To make one, install `pxweb-mcp` and use `createMemoryCache`, or implement the `Cache` interface.

## Data licence and attribution

Statistics Canada publishes its data under the [Statistics Canada Open Licence](https://www.statcan.gc.ca/en/reference/licence). You can use, publish and sell it, also commercially, if you credit Statistics Canada.

Each result contains the source line and a link to the table. If you change the data or make a new product from it, write "Adapted from Statistics Canada". Do not suggest that Statistics Canada endorses your product.

## Licence

The code is under the MIT licence. The data belongs to Statistics Canada.
