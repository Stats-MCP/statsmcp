# Development

You need Node.js 24 and pnpm 12. The published packages work on Node.js 20 or later.

## Repository layout

| Path                | Package              | Description                                                                                                                                       |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`     | `@statsmcp/core`     | PxWeb v1 and v2, StatBank Denmark, CBS OData, Eurostat, Statistics Canada and SingStat clients, query planner and MCP tools. Has no country data. |
| `packages/sistat`   | `@statsmcp/sistat`   | SiStat preset and the stdio server.                                                                                                               |
| `packages/ssb`      | `@statsmcp/ssb`      | Statbank Norway preset and the stdio server.                                                                                                      |
| `packages/stat-ee`  | `@statsmcp/stat-ee`  | Statistics Estonia preset and the stdio server.                                                                                                   |
| `packages/hagstova` | `@statsmcp/hagstova` | Statistics Faroe Islands preset and the stdio server.                                                                                             |
| `packages/statfin`  | `@statsmcp/statfin`  | Statistics Finland preset and the stdio server.                                                                                                   |
| `packages/scb`      | `@statsmcp/scb`      | Statistics Sweden preset (PxWeb API v2) and the stdio server.                                                                                     |
| `packages/dst`      | `@statsmcp/dst`      | Statistics Denmark preset (StatBank API) and the stdio server.                                                                                    |
| `packages/cbs`      | `@statsmcp/cbs`      | Statistics Netherlands preset (CBS OData) and the stdio server.                                                                                   |
| `packages/eurostat` | `@statsmcp/eurostat` | Eurostat preset and the stdio server.                                                                                                             |
| `packages/statcan`  | `@statsmcp/statcan`  | Statistics Canada preset (WDS) and the stdio server.                                                                                              |
| `packages/singstat` | `@statsmcp/singstat` | Singapore preset (SingStat Table Builder) and the stdio server.                                                                                   |
| `apps/worker`       | private              | Cloudflare Worker for the hosted endpoint.                                                                                                        |
| `tests/consumer`    | none                 | Typecheck of the published types with TypeScript 5. CI runs it.                                                                                   |
| `docs`              |                      | Documentation.                                                                                                                                    |

## Commands

```sh
pnpm install
pnpm build        # build all packages
pnpm test         # unit tests
pnpm typecheck
pnpm lint         # oxlint
pnpm format       # oxfmt check (pnpm format:fix to correct)
```

## Test with an MCP client

1. Build the packages:

   ```sh
   pnpm install && pnpm build
   ```

2. Connect a client. Use one of these two options.

   Stdio server from source:

   ```sh
   claude mcp add sistat-local -- node "$PWD/packages/sistat/dist/bin.mjs"
   ```

   Worker on your computer:

   ```sh
   pnpm dev:worker
   claude mcp add --transport http sistat-worker http://127.0.0.1:8787/si/mcp
   ```

3. Ask a question from [examples.md](examples.md), for example "What is the latest inflation rate in Slovenia?".

To call the tools without an assistant, use the MCP Inspector:

```sh
npx @modelcontextprotocol/inspector node packages/sistat/dist/bin.mjs
```

## Add a statistics office

To make a server for a different PxWeb instance, refer to the [`@statsmcp/core` README](../packages/core/README.md). Read [data-licence.md](data-licence.md) first.

## Contribute

Refer to [CONTRIBUTING.md](../CONTRIBUTING.md).
