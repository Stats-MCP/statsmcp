# @statsmcp/osp

An MCP server for the [Official Statistics Portal](https://osp.stat.gov.lt/) of Lithuania, run by the State Data Agency (Statistics Lithuania). It gives AI assistants access to its tables in Lithuanian and English.

> This project is not affiliated with or endorsed by the State Data Agency.

## Use the server

### Hosted

Add `https://statsmcp.dev/lt/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/lithuania](https://statsmcp.dev/lithuania/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "osp": { "command": "npx", "args": ["-y", "@statsmcp/osp"] }
  }
}
```

For Claude Code:

```sh
claude mcp add osp -- npx -y @statsmcp/osp
```

The server reads the table list from the SDMX API of the portal and searches it locally.

## Tools

| Tool                 | What it does                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `search_tables`      | Finds tables by keywords in Lithuanian or English.                                        |
| `get_table_metadata` | Lists the dimensions of a table and their value codes. Use `valueFilter` to find a value. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                |

All tools are read-only.

## Use it in your own server

```sh
npm install @statsmcp/osp
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createOspServer } from '@statsmcp/osp';

const server = createOspServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createOspServer` returns an `McpServer`. It also accepts a `cache`.

## Data licence and attribution

The Law on the Right of Access to Information and the Re-use of Data ([VIII-1524](https://e-seimas.lrs.lt/rs/legalact/TAD/be093fa03dca11efb121d2fe3a0eff27/)) allows re-use of the data for commercial or non-commercial purposes without consent. You must name the source and the date of retrieval, must not distort the data, and must not suggest that the institution sponsors your service.

Each result contains the source line and a link to the indicator; each table title shows the retrieval date.

## Licence

The code is under the MIT licence. The data belongs to the State Data Agency.
