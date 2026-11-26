# @statsmcp/kas

An MCP server for [ASKdata](https://askdata.rks-gov.net/pxweb/en/ASKdata/), the database of the Kosovo Agency of Statistics (KAS). It gives AI assistants access to its tables in Albanian and English.

> This project is not affiliated with or endorsed by the Kosovo Agency of Statistics.

## Use the server

### Hosted

Add `https://statsmcp.dev/xk/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/kosovo](https://statsmcp.dev/kosovo/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "kas": { "command": "npx", "args": ["-y", "@statsmcp/kas"] }
  }
}
```

For Claude Code:

```sh
claude mcp add kas -- npx -y @statsmcp/kas
```

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in English or Albanian.                                                 |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only.

## Data licence and attribution

The Kosovo Agency of Statistics has no separate terms page for ASKdata or its API. Its publications, for example the 2024 population estimate, state: "Reuse is authorised provided the source is acknowledged." This project applies that notice to the published tables. Each result contains the source line and a link to the table.

## Licence

The code is under the MIT licence. The data belongs to the Kosovo Agency of Statistics.
