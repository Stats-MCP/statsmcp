# @statsmcp/makstat

An MCP server for [MakStat](https://makstat.stat.gov.mk/PXWeb/pxweb/en/MakStat/), the database of the State Statistical Office of the Republic of North Macedonia. It gives AI assistants access to its tables in Macedonian and English.

> This project is not affiliated with or endorsed by the State Statistical Office.

## Use the server

### Hosted

Add `https://statsmcp.dev/mk/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/north-macedonia](https://statsmcp.dev/north-macedonia/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "makstat": { "command": "npx", "args": ["-y", "@statsmcp/makstat"] }
  }
}
```

For Claude Code:

```sh
claude mcp add makstat -- npx -y @statsmcp/makstat
```

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords in English or Macedonian.                                               |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only.

## Data licence and attribution

The State Statistical Office makes [MakStat data free for all users](https://www.stat.mk/en/about-us/policies-and-strategies/open-data/). The only condition is to name the source: `Source: State Statistical Office`. Do not present your application as "official cooperation" or "partnership" with the State Statistical Office.

Each result contains the source line and a link to the table.

## Licence

The code is under the MIT licence. The data belongs to the State Statistical Office of the Republic of North Macedonia.
