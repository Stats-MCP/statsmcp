# hagstova-mcp

An MCP server for the [StatBank of Statistics Faroe Islands](https://statbank.hagstova.fo/pxweb/en/H2/) (Hagstova Føroya). It gives AI assistants access to its tables in Faroese and English.

> This project is not affiliated with or endorsed by Statistics Faroe Islands.

## Use the server

### Hosted

Add `https://statsmcp.dev/fo/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/faroe-islands](https://statsmcp.dev/faroe-islands/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "hagstova": { "command": "npx", "args": ["-y", "hagstova-mcp"] }
  }
}
```

For Claude Code:

```sh
claude mcp add hagstova -- npx -y hagstova-mcp
```

## Tools

| Tool                 | What it does                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `search_tables`      | Finds tables by keywords in their titles. Returns table IDs, titles and publication dates. Discontinued tables are marked "archived". |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name.                                      |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                                                            |

All tools are read-only. Each tool accepts `lang` (`fo` or `en`). English search is the most reliable. Faroese search matches whole words only.

## Use it in your own server

```sh
npm install hagstova-mcp
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createHagstovaServer } from 'hagstova-mcp';

const server = createHagstovaServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createHagstovaServer` returns an `McpServer`. It also accepts a `cache`. To make one, install `pxweb-mcp` and use `createMemoryCache`, or implement the `Cache` interface.

## Data licence and attribution

Statistics Faroe Islands publishes its data under the [Creative Commons Attribution 4.0 licence (CC BY 4.0)](https://hagstova.fo/en/terms-use). You can use it for any purpose, including commercial use, if you name Statistics Faroe Islands as the source.

Each result contains the source line and a link to the table on the StatBank. If you change the data or calculate new figures, say so, for example: `Statistics Faroe Islands and own calculations`. Do not suggest that Statistics Faroe Islands endorses your product.

## Licence

The code is under the MIT licence. The data belongs to Statistics Faroe Islands.
