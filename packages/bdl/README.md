# @statsmcp/bdl

An MCP server for the [Local Data Bank (BDL)](https://bdl.stat.gov.pl/) of Statistics Poland (GUS). It gives AI assistants access to more than 2,000 subjects of Polish official statistics, in Polish and English, for Poland and its 16 voivodeships.

> This project is not affiliated with or endorsed by Statistics Poland.

## Use the server

### Hosted

Add `https://statsmcp.dev/pl/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/poland](https://statsmcp.dev/poland/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "bdl": { "command": "npx", "args": ["-y", "@statsmcp/bdl"] }
  }
}
```

For Claude Code:

```sh
claude mcp add bdl -- npx -y @statsmcp/bdl
```

The package contains the subject list, so search needs no request to the office.

Statistics Poland limits anonymous use to 100 requests per 15 minutes per IP address. For higher limits, register for a free API key at [api.stat.gov.pl](https://api.stat.gov.pl/Home/BdlApi?lang=en) and set it in the environment variable `BDL_CLIENT_ID`.

## Tools

| Tool                 | What it does                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| `search_tables`      | Finds subjects by keywords in Polish or English.                                                                |
| `get_table_metadata` | Lists the variables, units (Poland and voivodeships) and years of a subject. Use `valueFilter` to find a value. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent years.                                        |

All tools are read-only.

## Use it in your own server

```sh
npm install @statsmcp/bdl
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createBdlServer } from '@statsmcp/bdl';

const server = createBdlServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createBdlServer` returns an `McpServer`. It also accepts a `cache` and a `clientId` (the BDL API key).

## Data licence and attribution

Statistics Poland publishes the BDL data under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Each result contains the source line and a link to the BDL subject page.

## Licence

The code is under the MIT licence. The data belongs to Statistics Poland.
