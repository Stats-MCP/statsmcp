# @statsmcp/ibge

An MCP server for [SIDRA](https://sidra.ibge.gov.br/), the aggregate tables of IBGE, the national statistics office of Brazil. It gives AI assistants access to more than 9,000 tables in Portuguese.

> This project is not affiliated with or endorsed by IBGE.

## Use the server

### Hosted

Add `https://statsmcp.dev/br/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/brazil](https://statsmcp.dev/brazil/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "ibge": { "command": "npx", "args": ["-y", "@statsmcp/ibge"] }
  }
}
```

For Claude Code:

```sh
claude mcp add ibge -- npx -y @statsmcp/ibge
```

The server reads the table list from the IBGE API and searches it locally.

## Tools

| Tool                 | What it does                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `search_tables`      | Finds tables by keywords in Portuguese.                                                                     |
| `get_table_metadata` | Lists the variables, classifications, localities and periods of a table. Use `valueFilter` to find a value. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                                  |

All tools are read-only.

## Use it in your own server

```sh
npm install @statsmcp/ibge
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createIbgeServer } from '@statsmcp/ibge';

const server = createIbgeServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createIbgeServer` returns an `McpServer`. It also accepts a `cache`.

## Data licence and attribution

IBGE data is federal open data of Brazil. The open data policy ([Decreto 8.777/2016](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2016/decreto/d8777.htm)) makes it free to use, limited to crediting the source: `Fonte: IBGE`.

Each result contains the source line and a link to the SIDRA table.

## Licence

The code is under the MIT licence. The data belongs to IBGE.
