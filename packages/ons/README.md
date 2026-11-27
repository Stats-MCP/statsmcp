# @statsmcp/ons

An MCP server for the [time series](https://www.ons.gov.uk/timeseriestool) of the Office for National Statistics (ONS), the national statistics office of the United Kingdom. It gives AI assistants access to more than 13,000 time series in English.

> This project is not affiliated with or endorsed by the Office for National Statistics.

## Use the server

### Hosted

Add `https://statsmcp.dev/gb/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/united-kingdom](https://statsmcp.dev/united-kingdom/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "ons": { "command": "npx", "args": ["-y", "@statsmcp/ons"] }
  }
}
```

For Claude Code:

```sh
claude mcp add ons -- npx -y @statsmcp/ons
```

## Tools

| Tool                 | What it does                                                               |
| -------------------- | -------------------------------------------------------------------------- |
| `search_tables`      | Finds time series by keywords or by series code (CDID).                    |
| `get_table_metadata` | Lists the frequencies and periods of a series.                             |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods. |

All tools are read-only.

## Use it in your own server

```sh
npm install @statsmcp/ons
```

```ts
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createOnsServer } from '@statsmcp/ons';

const server = createOnsServer({ userAgent: 'my-app/1.0' });
await server.connect(new StdioServerTransport());
```

`createOnsServer` returns an `McpServer`. It also accepts a `cache`.

## Data licence and attribution

The ONS publishes its statistics under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). You can reuse them freely, also commercially, with this source statement: `Source: Office for National Statistics licensed under the Open Government Licence v.3.0`.

Each result contains the source line and a link to the series page.

## Licence

The code is under the MIT licence. The data belongs to the Office for National Statistics.
