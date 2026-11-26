# @statsmcp/ine-pt

An MCP server for the [database of Statistics Portugal](https://www.ine.pt/xportal/xmain?xpid=INE&xpgid=ine_base_dados&xlang=en) (Instituto Nacional de Estatística, INE). It gives AI assistants access to more than 13,000 indicators in Portuguese and English.

> This project is not affiliated with or endorsed by Statistics Portugal.

## Use the server

### Hosted

Add `https://statsmcp.dev/pt/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/portugal](https://statsmcp.dev/portugal/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "ine-pt": { "command": "npx", "args": ["-y", "@statsmcp/ine-pt"] }
  }
}
```

For Claude Code:

```sh
claude mcp add ine-pt -- npx -y @statsmcp/ine-pt
```

The API of Statistics Portugal has no search. The server searches a copy of the indicator list from https://statsmcp.dev, or the copy in the package. To stop all requests to statsmcp.dev, set the environment variable `STATSMCP_INDEX=off`.

## Tools

| Tool                 | What it does                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `search_tables`      | Finds indicators by keywords in Portuguese or English.                                         |
| `get_table_metadata` | Lists the dimensions of an indicator and their value codes. Use `valueFilter` to find a value. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                     |

All tools are read-only.

## Use it in your own server

```sh
npm install @statsmcp/ine-pt
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';
import { createInePtServer } from '@statsmcp/ine-pt';

const server = createInePtServer({
  userAgent: 'my-app/1.0',
  tableSnapshots: nodeTableSnapshots(new URL('./snapshots/', import.meta.url))
});
await server.connect(new StdioServerTransport());
```

`createInePtServer` returns an `McpServer`. Search needs `tableSnapshots`. It also accepts a `cache`.

## Data licence and attribution

Statistics Portugal publishes its statistical data under [CC BY 4.0](https://www.ine.pt/xportal/xmain?xpid=INE&xpgid=ine_cont_inst&INST=3585857&xlang=en). You can use it for personal or commercial purposes. Cite it as `Source: Instituto Nacional de Estatística – Portugal (Statistics Portugal)` with the information and its reference period, and say explicitly when you changed the data.

Each result contains the source line, the indicator and its periods, and a link to the indicator.

## Licence

The code is under the MIT licence. The data belongs to Statistics Portugal.
