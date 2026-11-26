# @statsmcp/ine-es

An MCP server for [INEbase](https://www.ine.es/) through the Tempus3 API of the National Statistics Institute of Spain (INE). It gives AI assistants access to almost 7,000 tables in Spanish and English.

> This project is not affiliated with or endorsed by INE.

## Use the server

### Hosted

Add `https://statsmcp.dev/es/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/spain](https://statsmcp.dev/spain/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "ine-es": { "command": "npx", "args": ["-y", "@statsmcp/ine-es"] }
  }
}
```

For Claude Code:

```sh
claude mcp add ine-es -- npx -y @statsmcp/ine-es
```

The Tempus3 API has no search. The server searches a copy of the table list from https://statsmcp.dev, or the copy in the package. To stop all requests to statsmcp.dev, set the environment variable `STATSMCP_INDEX=off`.

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in Spanish or English, with the date of the last update.                |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only.

## Use it in your own server

```sh
npm install @statsmcp/ine-es
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';
import { createIneEsServer } from '@statsmcp/ine-es';

const server = createIneEsServer({
  userAgent: 'my-app/1.0',
  tableSnapshots: nodeTableSnapshots(new URL('./snapshots/', import.meta.url))
});
await server.connect(new StdioServerTransport());
```

`createIneEsServer` returns an `McpServer`. Search needs `tableSnapshots`. It also accepts a `cache`.

## Data licence and attribution

INE allows reuse of its statistics under [CC BY 4.0](https://www.ine.es/dyngs/AYU/index.htm?cid=125), also commercially. Cite the source as `Fuente: Sitio web del INE: www.ine.es`, or `Elaboración propia con datos extraídos del sitio web del INE: www.ine.es` when you change the data, and give the date of the last update. Do not suggest that INE supports your use.

Each result contains the source line and a link to the table. `search_tables` shows the date of the last update.

## Licence

The code is under the MIT licence. The data belongs to the National Statistics Institute of Spain.
