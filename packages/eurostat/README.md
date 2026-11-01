# statsmcp-eurostat

An MCP server for the [Eurostat database](https://ec.europa.eu/eurostat/data/database): harmonised statistics for the EU, EFTA and candidate countries, in English, German and French. Use it to compare countries.

> This project is not affiliated with or endorsed by Eurostat or the European Commission.

## Use the server

### Hosted

Add `https://statsmcp.dev/eu/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/eurostat](https://statsmcp.dev/eurostat/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "eurostat": { "command": "npx", "args": ["-y", "statsmcp-eurostat"] }
  }
}
```

For Claude Code:

```sh
claude mcp add eurostat -- npx -y statsmcp-eurostat
```

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in their titles. Returns table IDs, titles and publication dates.       |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only. Each tool accepts `lang` (`en`, `de` or `fr`). Countries are values of the `geo` variable. The server loads the Eurostat table of contents and searches the titles itself. Discontinued datasets are marked "archived".

## Use it in your own server

```sh
npm install statsmcp-eurostat
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createEurostatServer } from 'statsmcp-eurostat';

const server = createEurostatServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createEurostatServer` returns an `McpServer`. It also accepts a `cache`. To make one, install `pxweb-mcp` and use `createMemoryCache`, or implement the `Cache` interface.

## Data licence and attribution

Eurostat allows reuse of its data for commercial and non-commercial purposes if you acknowledge the source. Refer to the [Eurostat copyright notice](https://ec.europa.eu/eurostat/help/copyright-notice).

Data for countries outside the EU, EFTA and candidate countries (for example the USA, Japan or China) may only be reused for non-commercial purposes. Some trade data has the same limit.

Each result contains the source line and a link to the dataset in the Eurostat data browser. If you change the data or calculate new figures, say so and say that Eurostat is not responsible for the change.

## Licence

The code is under the MIT licence. The data belongs to Eurostat and the national statistics offices that supply it.
