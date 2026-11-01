# cbs-mcp

An MCP server for [StatLine](https://opendata.cbs.nl/), the database of Statistics Netherlands (CBS). It gives AI assistants access to its tables in Dutch and English.

> This project is not affiliated with or endorsed by Statistics Netherlands (CBS).

## Use the server

### Hosted

Add `https://statsmcp.dev/nl/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/netherlands](https://statsmcp.dev/netherlands/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "cbs": { "command": "npx", "args": ["-y", "cbs-mcp"] }
  }
}
```

For Claude Code:

```sh
claude mcp add cbs -- npx -y cbs-mcp
```

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in their titles. Returns table IDs, titles and publication dates.       |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only. Each tool accepts `lang` (`nl` or `en`). Dutch and English tables have different IDs. The measures of a table are the values of its "Topics" variable. The server loads the table catalogue and searches the titles itself. Discontinued tables are marked "archived".

## Use it in your own server

```sh
npm install cbs-mcp
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createCbsServer } from 'cbs-mcp';

const server = createCbsServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createCbsServer` returns an `McpServer`. It also accepts a `cache`. To make one, install `pxweb-mcp` and use `createMemoryCache`, or implement the `Cache` interface.

## Data licence and attribution

CBS publishes its data under the [Creative Commons Attribution 4.0 licence (CC BY 4.0)](https://www.cbs.nl/en-gb/about-us/website/copyright). You can use it for any purpose, including commercial use, if you name Statistics Netherlands (CBS) as the source. Do not suggest that CBS endorses your product.

Each result contains the source line and a link to the table on cbs.nl. If you change the data or calculate new figures, say so, for example: `Source: CBS / Calculated by <you>`.

## Licence

The code is under the MIT licence. The data belongs to Statistics Netherlands (CBS).
