# Development

You need Node.js 24 and pnpm 12. The published packages work on Node.js 20 or later.

## Repository layout

| Path              | Package      | Description                                                        |
| ----------------- | ------------ | ------------------------------------------------------------------ |
| `packages/core`   | `pxweb-mcp`  | PxWeb v1 client, query planner and MCP tools. Has no country data. |
| `packages/sistat` | `sistat-mcp` | SiStat preset and the stdio server.                                |
| `packages/ssb`    | `ssb-mcp`    | Statbank Norway preset and the stdio server.                       |
| `apps/worker`     | private      | Cloudflare Worker for the hosted endpoint.                         |
| `tests/consumer`  | none         | Typecheck of the published types with TypeScript 5. CI runs it.    |
| `docs`            |              | Documentation.                                                     |

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

To make a server for a different PxWeb instance, refer to the [`pxweb-mcp` README](../packages/core/README.md). Read [data-licence.md](data-licence.md) first.

## Contribute

Refer to [CONTRIBUTING.md](../CONTRIBUTING.md).
