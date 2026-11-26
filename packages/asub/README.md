# @statsmcp/asub

An MCP server for the [PxWeb database](https://pxweb.asub.ax/PXWeb/pxweb/en/Statistik/) of Statistics and Research Åland (ÅSUB). It gives AI assistants access to the official statistics of the Åland Islands in Swedish and English.

> This project is not affiliated with or endorsed by ÅSUB.

## Use the server

### Hosted

Add `https://statsmcp.dev/ax/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication. For the steps for each client, refer to [statsmcp.dev/aland-islands](https://statsmcp.dev/aland-islands/).

### Local

You need Node.js 20 or later.

```json
{
  "mcpServers": {
    "asub": { "command": "npx", "args": ["-y", "@statsmcp/asub"] }
  }
}
```

For Claude Code:

```sh
claude mcp add asub -- npx -y @statsmcp/asub
```

## Tools

| Tool                 | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `search_tables`      | Finds tables by keywords. Swedish words find the most tables.                                    |
| `get_table_metadata` | Lists the variables of a table and their value codes. Use `valueFilter` to find a value by name. |
| `query_table`        | Returns data as CSV with readable labels. Use `latest` for recent periods.                       |

All tools are read-only.

## Data licence and attribution

ÅSUB publishes its material under the [Creative Commons Attribution 4.0 licence (CC BY 4.0)](https://www.asub.ax/sv/om-asub/om-asubax/anvandarvillkor). You can copy, change and share it, also commercially, if you name ÅSUB as the source and state your changes.

Each result contains the source line and a link to the table. If you change the data or calculate new figures, say so, for example: `ÅSUB and own calculations`.

## Licence

The code is under the MIT licence. The data belongs to Statistics and Research Åland.
