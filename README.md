# StatsMCP

[![CI](https://github.com/TadejPolajnar/statsmcp/actions/workflows/ci.yml/badge.svg)](https://github.com/TadejPolajnar/statsmcp/actions/workflows/ci.yml)
[![npm: sistat-mcp](https://img.shields.io/npm/v/sistat-mcp?label=sistat-mcp)](https://www.npmjs.com/package/sistat-mcp)
[![npm: pxweb-mcp](https://img.shields.io/npm/v/pxweb-mcp?label=pxweb-mcp)](https://www.npmjs.com/package/pxweb-mcp)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

Official national statistics for every AI assistant. StatsMCP is a set of MCP servers for the databases of national statistics offices. The servers use the [PxWeb API](https://www.scb.se/en/services/open-data-api/api-for-the-statistical-database/), which many national statistics offices use.

The first server is **sistat-mcp** for [SiStat](https://pxweb.stat.si/SiStat/en), the database of the Statistical Office of the Republic of Slovenia (SURS). SiStat has more than 4,800 tables in Slovenian and English.

> **You:** What is the latest inflation rate in Slovenia?
>
> **Assistant:** In October 2026, prices were 3.3% higher than in October 2025.
> _Source: SURS (Statistical Office of the Republic of Slovenia), table H281S.px_

## Features

- **Search** more than 4,800 tables by keywords.
- **Read the variables** of a table, with a filter for long lists such as municipalities.
- **Get data** as CSV with readable labels. Use `latest` to get the most recent periods.
- **Source in every result**, with a link to the table, as the SURS terms require.
- **Safe queries:** the server refuses queries that are too large and tells the assistant how to make them smaller.
- **Caching** of searches, metadata and data.
- **Read-only.** The server needs no API key.

## Quick start

You need Node.js 20 or later.

**Claude Code**

```sh
claude mcp add sistat -- npx -y sistat-mcp
```

**Claude Desktop, Cursor and other MCP clients**

Add this to the MCP configuration of the client:

```json
{
  "mcpServers": {
    "sistat": { "command": "npx", "args": ["-y", "sistat-mcp"] }
  }
}
```

Then ask a question, for example "What is the average net salary in Slovenia?". For more questions and real results, refer to [docs/examples.md](docs/examples.md).

## Databases

| Database                                  | Country  | Package                         | Status    |
| ----------------------------------------- | -------- | ------------------------------- | --------- |
| [SiStat](https://pxweb.stat.si/SiStat/en) | Slovenia | [`sistat-mcp`](packages/sistat) | Available |
| Statistics Norway                         | Norway   |                                 | Planned   |
| Statistics Iceland                        | Iceland  |                                 | Planned   |

To add a database that uses PxWeb, use the [`pxweb-mcp`](packages/core) toolkit.

## Documentation

| Page                                 | Contents                                              |
| ------------------------------------ | ----------------------------------------------------- |
| [Tools](docs/tools.md)               | The three tools, their arguments and errors.          |
| [Examples](docs/examples.md)         | Real questions, tool calls and results.               |
| [Data licence](docs/data-licence.md) | Terms of use of the data and how the source is shown. |
| [Self-hosting](docs/self-hosting.md) | Run the server over HTTP on Cloudflare Workers.       |
| [Toolkit](packages/core/README.md)   | Make a server for a different PxWeb database.         |
| [Development](docs/development.md)   | Repository layout, commands and local tests.          |
| [Releasing](docs/releasing.md)       | Release steps for the maintainer.                     |

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before you open a pull request. This project follows the [Code of conduct](CODE_OF_CONDUCT.md). To report a security problem, refer to [SECURITY.md](SECURITY.md).

## Licence

The code is under the [MIT licence](LICENSE). The data belongs to the statistics office that publishes it. Refer to [docs/data-licence.md](docs/data-licence.md).

This project is not affiliated with or endorsed by SURS or any other statistics office.
