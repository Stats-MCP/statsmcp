# @statsmcp/singstat

An MCP server for [SingStat Table Builder](https://tablebuilder.singstat.gov.sg/), the database of the Singapore Department of Statistics. It gives AI assistants access to its time series in English.

> This project is not affiliated with or endorsed by the Singapore Department of Statistics. The Department of Statistics also runs its own SingStat MCP server.

## Use the server

### Hosted

There is no hosted endpoint for Singapore. Run the server on your computer, so that you accept the Singapore Open Data Licence yourself.

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "singstat": { "command": "npx", "args": ["-y", "@statsmcp/singstat"] }
  }
}
```

For Claude Code:

```sh
claude mcp add singstat -- npx -y @statsmcp/singstat
```

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in their titles. Returns table IDs, titles and publication dates.       |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only. Each tool accepts `lang` (`en`). Each table has two variables: `series` (the rows) and `time` (the periods).

## Use it in your own server

```sh
npm install @statsmcp/singstat
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createSingstatServer } from '@statsmcp/singstat';

const server = createSingstatServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createSingstatServer` returns an `McpServer`. It also accepts a `cache`. To make one, install `@statsmcp/core` and use `createMemoryCache`, or implement the `Cache` interface.

## Data licence and attribution

SingStat datasets are made available under the [Singapore Open Data Licence](https://data.gov.sg/open-data-licence). You can use them for any purpose, including commercial use. Credit the dataset and the date you accessed it, and link the licence. Do not suggest that the data has official status through your product.

The licence also says that users must indemnify the agency against claims that come from their use of the data. Read the licence before you use the data in a product.

Each result contains the source line and a link to the table in Table Builder.

## Licence

The code is under the MIT licence. The data belongs to the Singapore Department of Statistics and the agencies that supply it.
