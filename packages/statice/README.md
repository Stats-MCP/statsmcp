# statice-mcp

An MCP server for the [PX-Web database of Statistics Iceland](https://px.hagstofa.is/pxen/pxweb/en/) (Hagstofa Íslands). It gives AI assistants access to its tables.

> This project is not affiliated with or endorsed by Statistics Iceland.

## Use the server

### Hosted

Add `https://statsmcp.dev/is/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/iceland](https://statsmcp.dev/iceland/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "statice": { "command": "npx", "args": ["-y", "statice-mcp"] }
  }
}
```

For Claude Code:

```sh
claude mcp add statice -- npx -y statice-mcp
```

The API of the office has no list of all tables. The server searches a copy of the table list from https://statsmcp.dev, or the copy in the package. To stop all requests to statsmcp.dev, set the environment variable `STATSMCP_INDEX=off`.

## Tools

| Tool                 | What it does                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `search_tables`      | Finds tables by keywords in their titles and folders. Returns table IDs, titles and update dates. |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name.  |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                        |

All tools are read-only. Each tool accepts `lang` (`en` or `is`). The English and Icelandic table lists are not the same. Use a table id in the language that search_tables returned it in.

## Use it in your own server

```sh
npm install statice-mcp
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { nodeTableSnapshots } from 'pxweb-mcp/node';
import { createStaticeServer } from 'statice-mcp';

const server = createStaticeServer({
  userAgent: 'my-app/1.0',
  tableSnapshots: nodeTableSnapshots(new URL('./snapshots/', import.meta.url))
});
await server.connect(new StdioServerTransport());
```

`createStaticeServer` returns an `McpServer`. Search needs `tableSnapshots`. It also accepts a `cache`.

## Data licence and attribution

Statistics Iceland publishes its data under the [Creative Commons Attribution 4.0 licence (CC BY 4.0)](https://statice.is/publications/open-data-access). You can use it for any purpose, including commercial use, if you name Statistics Iceland as the source.

Each result contains the source line and a link to the table. If you change the data or calculate new figures, say so, for example: `Statistics Iceland and own calculations`. Do not suggest that Statistics Iceland endorses your product.

## Licence

The code is under the MIT licence. The data belongs to Statistics Iceland.
