# @statsmcp/statbel

An MCP server for [Be.STAT](https://bestat.statbel.fgov.be/bestat/), the database of Statbel, the national statistics office of Belgium. It gives AI assistants access to more than 1,300 tables (views) in Dutch, French and English.

> This project is not affiliated with or endorsed by Statbel.

## Use the server

### Hosted

Add `https://statsmcp.dev/be/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/belgium](https://statsmcp.dev/belgium/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "statbel": { "command": "npx", "args": ["-y", "@statsmcp/statbel"] }
  }
}
```

For Claude Code:

```sh
claude mcp add statbel -- npx -y @statsmcp/statbel
```

The server reads the list of views from the Be.STAT API and searches it locally.

## Tools

| Tool                 | What it does                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `search_tables`      | Finds tables by keywords in Dutch, French or English.                                    |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.               |

All tools are read-only.

## Use it in your own server

```sh
npm install @statsmcp/statbel
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createStatbelServer } from '@statsmcp/statbel';

const server = createStatbelServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createStatbelServer` returns an `McpServer`. It also accepts a `cache`.

## Data licence and attribution

Statbel publishes its data under the [Creative Commons Attribution 4.0 licence (CC BY 4.0)](https://statbel.fgov.be/en/cc-40). You can reuse it freely, also commercially, if you credit `Source: Statbel`, link the licence, say when you changed the data, and do not suggest that Statbel supports your use.

Each result contains the source line and a link to the view.

## Licence

The code is under the MIT licence. The data belongs to Statbel.
