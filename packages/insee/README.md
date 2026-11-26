# @statsmcp/insee

An MCP server for [Melodi](https://catalogue-donnees.insee.fr/), the data catalogue of INSEE, the national statistics office of France. It gives AI assistants access to its datasets in French and English.

> This project is not affiliated with or endorsed by INSEE.

## Use the server

### Hosted

Add `https://statsmcp.dev/fr/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/france](https://statsmcp.dev/france/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "insee": { "command": "npx", "args": ["-y", "@statsmcp/insee"] }
  }
}
```

For Claude Code:

```sh
claude mcp add insee -- npx -y @statsmcp/insee
```

The Melodi API has no search. The server searches a copy of the dataset list from https://statsmcp.dev, or the copy in the package. To stop all requests to statsmcp.dev, set the environment variable `STATSMCP_INDEX=off`.

## Tools

| Tool                 | What it does                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `search_tables`      | Finds datasets by keywords in French or English.                                            |
| `get_table_metadata` | Lists the dimensions of a dataset and their value codes. Use `valueFilter` to find a value. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                  |

All tools are read-only.

## Use it in your own server

```sh
npm install @statsmcp/insee
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from '@statsmcp/core/node';
import { createInseeServer } from '@statsmcp/insee';

const server = createInseeServer({
  userAgent: 'my-app/1.0',
  tableSnapshots: nodeTableSnapshots(new URL('./snapshots/', import.meta.url))
});
await server.connect(new StdioServerTransport());
```

`createInseeServer` returns an `McpServer`. Search needs `tableSnapshots`. It also accepts a `cache`.

## Data licence and attribution

INSEE publishes its data under the [Licence Ouverte / Open Licence 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence) ([terms](https://www.insee.fr/fr/information/2008466)). You can reuse it freely, also commercially, if you cite `Source : Insee`, give the date of the last update when it is known, and do not change the meaning of the data.

Each result contains the source line and a link to the dataset. The title of each dataset shows the date of the last update.

## Licence

The code is under the MIT licence. The data belongs to INSEE.
