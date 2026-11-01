# dst-mcp

An MCP server for [StatBank Denmark](https://www.statbank.dk/), the database of Statistics Denmark (Danmarks Statistik). It gives AI assistants access to its tables in Danish and English.

> This project is not affiliated with or endorsed by Statistics Denmark.

## Use the server

### Hosted

Add `https://statsmcp.dev/dk/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/denmark](https://statsmcp.dev/denmark/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "dst": { "command": "npx", "args": ["-y", "dst-mcp"] }
  }
}
```

For Claude Code:

```sh
claude mcp add dst -- npx -y dst-mcp
```

The server searches the full table list of the office. If the office API cannot give this list, the server uses a copy of the list from https://statsmcp.dev, or the copy in the package. To stop all requests to statsmcp.dev, set the environment variable `STATSMCP_INDEX=off`.

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in their titles. Returns table IDs, titles and publication dates.       |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only. Each tool accepts `lang` (`da` or `en`). The StatBank API has no keyword search, so the server loads the list of tables and searches the titles itself. Tables that are no longer updated are marked "archived".

## Use it in your own server

```sh
npm install dst-mcp
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createDstServer } from 'dst-mcp';

const server = createDstServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createDstServer` returns an `McpServer`. It also accepts a `cache`. To make one, install `pxweb-mcp` and use `createMemoryCache`, or implement the `Cache` interface.

## Data licence and attribution

Statistics Denmark publishes its data under the [Creative Commons Attribution 4.0 licence (CC BY 4.0)](https://www.dst.dk/en/Statistik/brug-statistikken/kildeangivelse). You can use it for any purpose, including commercial use, if you name Statistics Denmark as the source.

Each result contains the source line and a link to the table on StatBank. If you change the data or calculate new figures, say so, for example: `Own calculations based on data from Statistics Denmark`.

## Licence

The code is under the MIT licence. The data belongs to Statistics Denmark.
