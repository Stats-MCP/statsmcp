# StatsMCP

[![CI](https://github.com/Stats-MCP/statsmcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Stats-MCP/statsmcp/actions/workflows/ci.yml)
[![npm: @statsmcp/sistat](https://img.shields.io/npm/v/@statsmcp/sistat?label=@statsmcp/sistat)](https://www.npmjs.com/package/@statsmcp/sistat)
[![npm: @statsmcp/core](https://img.shields.io/npm/v/@statsmcp/core?label=@statsmcp/core)](https://www.npmjs.com/package/@statsmcp/core)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

Website: [statsmcp.dev](https://statsmcp.dev)

Official national statistics for every AI assistant. StatsMCP is a set of MCP servers for the databases of national statistics offices.

There are servers for Slovenia, Norway, Estonia, the Faroe Islands, Finland, Sweden, Denmark, the Netherlands, Iceland, Croatia, Ireland, Canada, Australia and Singapore, plus Eurostat for harmonised data on all EU and EFTA countries. The [Databases](#databases) table lists each database and its package. The servers support PxWeb API v1 and v2, the StatBank API of Statistics Denmark, the OData services of Statistics Netherlands, PxStat (Ireland), SDMX (Australia), the Eurostat API, the Web Data Service of Statistics Canada and SingStat Table Builder.

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

**Hosted (no install)**

Add `https://statsmcp.dev/si/mcp` as a remote MCP server. It uses Streamable HTTP and needs no authentication.

```sh
claude mcp add --transport http statsmcp-si https://statsmcp.dev/si/mcp
```

For Norway:

```sh
claude mcp add --transport http statsmcp-no https://statsmcp.dev/no/mcp
```

For Estonia:

```sh
claude mcp add --transport http statsmcp-ee https://statsmcp.dev/ee/mcp
```

For the Faroe Islands:

```sh
claude mcp add --transport http statsmcp-fo https://statsmcp.dev/fo/mcp
```

For Finland:

```sh
claude mcp add --transport http statsmcp-fi https://statsmcp.dev/fi/mcp
```

For Sweden:

```sh
claude mcp add --transport http statsmcp-se https://statsmcp.dev/se/mcp
```

For Denmark:

```sh
claude mcp add --transport http statsmcp-dk https://statsmcp.dev/dk/mcp
```

For the Netherlands:

```sh
claude mcp add --transport http statsmcp-nl https://statsmcp.dev/nl/mcp
```

For Eurostat (all EU and EFTA countries):

```sh
claude mcp add --transport http statsmcp-eu https://statsmcp.dev/eu/mcp
```

For Canada:

```sh
claude mcp add --transport http statsmcp-ca https://statsmcp.dev/ca/mcp
```

For Claude, ChatGPT, Cursor and VS Code, the steps are on [statsmcp.dev](https://statsmcp.dev).

**Local (stdio)**

You need Node.js 20 or later.

**Claude Code**

```sh
claude mcp add sistat -- npx -y @statsmcp/sistat
```

**Claude Desktop, Cursor and other MCP clients**

Add this to the MCP configuration of the client:

```json
{
  "mcpServers": {
    "sistat": { "command": "npx", "args": ["-y", "@statsmcp/sistat"] }
  }
}
```

Then ask a question, for example "What is the average net salary in Slovenia?". For more questions and real results, refer to [docs/examples.md](docs/examples.md).

## Databases

| Database                                                                                                               | Country       | Package                                   | Status               |
| ---------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------- | -------------------- |
| [SiStat](https://pxweb.stat.si/SiStat/en)                                                                              | Slovenia      | [`@statsmcp/sistat`](packages/sistat)     | Hosted and npm       |
| [Statbank Norway](https://www.ssb.no/en/statbank)                                                                      | Norway        | [`@statsmcp/ssb`](packages/ssb)           | Hosted and npm       |
| [Statistics Estonia](https://andmed.stat.ee/en/stat)                                                                   | Estonia       | [`@statsmcp/stat-ee`](packages/stat-ee)   | Hosted and npm       |
| [Statistics Faroe Islands](https://statbank.hagstova.fo/pxweb/en/H2/)                                                  | Faroe Islands | [`@statsmcp/hagstova`](packages/hagstova) | Hosted and npm       |
| [StatFin](https://pxdata.stat.fi/PxWeb/pxweb/en/StatFin/)                                                              | Finland       | [`@statsmcp/statfin`](packages/statfin)   | Hosted and npm       |
| [Statistical Database](https://www.statistikdatabasen.scb.se/pxweb/en/ssd/) (SCB)                                      | Sweden        | [`@statsmcp/scb`](packages/scb)           | Hosted and npm       |
| [StatBank Denmark](https://www.statbank.dk/)                                                                           | Denmark       | [`@statsmcp/dst`](packages/dst)           | Hosted and npm       |
| [StatLine](https://opendata.cbs.nl/) (CBS)                                                                             | Netherlands   | [`@statsmcp/cbs`](packages/cbs)           | Hosted and npm       |
| [PX-Web of Statistics Iceland](https://px.hagstofa.is/pxen/pxweb/en/)                                                  | Iceland       | [`@statsmcp/statice`](packages/statice)   | Hosted and npm       |
| [PC-Axis database of DZS](https://web.dzs.hr/PXWeb/)                                                                   | Croatia       | [`@statsmcp/dzs`](packages/dzs)           | Hosted and npm       |
| [PxStat](https://data.cso.ie/) (CSO)                                                                                   | Ireland       | [`@statsmcp/cso`](packages/cso)           | Hosted and npm       |
| [Eurostat](https://ec.europa.eu/eurostat/data/database)                                                                | EU and EFTA   | [`@statsmcp/eurostat`](packages/eurostat) | Hosted and npm       |
| [Statistics Canada](https://www150.statcan.gc.ca/n1/en/type/data)                                                      | Canada        | [`@statsmcp/statcan`](packages/statcan)   | Hosted and npm       |
| [ABS Data API](https://www.abs.gov.au/about/data-services/application-programming-interfaces-apis/data-api-user-guide) | Australia     | [`@statsmcp/abs`](packages/abs)           | Hosted and npm       |
| [SingStat Table Builder](https://tablebuilder.singstat.gov.sg/)                                                        | Singapore     | [`@statsmcp/singstat`](packages/singstat) | npm only; not hosted |

To add a database, use the [`@statsmcp/core`](packages/core) toolkit.

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

## Old package names

The packages moved to the `@statsmcp` scope. The old names are no longer maintained. To change, replace the package name in your `npx` or `npm install` command. The command names do not change.

| Old name            | New name             |
| ------------------- | -------------------- |
| `pxweb-mcp`         | `@statsmcp/core`     |
| `sistat-mcp`        | `@statsmcp/sistat`   |
| `ssb-mcp`           | `@statsmcp/ssb`      |
| `stat-ee-mcp`       | `@statsmcp/stat-ee`  |
| `hagstova-mcp`      | `@statsmcp/hagstova` |
| `statfin-mcp`       | `@statsmcp/statfin`  |
| `scb-mcp`           | `@statsmcp/scb`      |
| `dst-mcp`           | `@statsmcp/dst`      |
| `cbs-mcp`           | `@statsmcp/cbs`      |
| `statsmcp-eurostat` | `@statsmcp/eurostat` |
| `statsmcp-statcan`  | `@statsmcp/statcan`  |
| `statsmcp-singstat` | `@statsmcp/singstat` |
| `statice-mcp`       | `@statsmcp/statice`  |
| `dzs-mcp`           | `@statsmcp/dzs`      |
| `cso-mcp`           | `@statsmcp/cso`      |

## Licence

The code is under the [MIT licence](LICENSE). The data belongs to the statistics office that publishes it. Refer to [docs/data-licence.md](docs/data-licence.md).

This project is not affiliated with or endorsed by SURS or any other statistics office.
