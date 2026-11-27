# @statsmcp/czso

An MCP server for [DataStat](https://data.csu.gov.cz/), the database of the Czech Statistical Office (CZSO). It gives AI assistants access to more than 1,000 datasets in Czech and English.

> This project is not affiliated with or endorsed by the Czech Statistical Office.

## Use the server

### Hosted

Add `https://statsmcp.dev/cz/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/czechia](https://statsmcp.dev/czechia/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "czso": { "command": "npx", "args": ["-y", "@statsmcp/czso"] }
  }
}
```

For Claude Code:

```sh
claude mcp add czso -- npx -y @statsmcp/czso
```

The server reads the dataset list from the DataStat API and searches it locally.

## Tools

| Tool                 | What it does                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `search_tables`      | Finds tables by keywords in Czech or English.                                            |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.               |

All tools are read-only.

## Use it in your own server

```sh
npm install @statsmcp/czso
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createCzsoServer } from '@statsmcp/czso';

const server = createCzsoServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createCzsoServer` returns an `McpServer`. It also accepts a `cache`.

## Data licence and attribution

The Czech Statistical Office publishes its statistical information under the [Creative Commons Attribution 4.0 licence (CC BY 4.0)](https://csu.gov.cz/conditions_for_use_and_further_dissemination). You must mention the terms, preferably with a link to that page, and label adjusted or derived data as such.

Each result contains the source line and a link to the dataset.

## Licence

The code is under the MIT licence. The data belongs to the Czech Statistical Office.
