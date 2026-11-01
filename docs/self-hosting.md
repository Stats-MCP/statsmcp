# Self-hosting

You can run the server in two ways:

- **Stdio:** the MCP client starts `sistat-mcp` on your computer. This is the simplest way. Refer to the [README](../README.md#quick-start).
- **HTTP on Cloudflare Workers:** the code in [`apps/worker`](../apps/worker) serves the MCP endpoint over Streamable HTTP. The hosted endpoint uses this code.

## Cloudflare Worker

You need a Cloudflare account and the packages built (`pnpm build`).

1. Log in to Cloudflare:

   ```sh
   pnpm --filter sistat-mcp-worker exec wrangler login
   ```

2. Deploy:

   ```sh
   pnpm deploy:worker
   ```

3. Connect a client to `https://<your-worker>/si/mcp`.

The [`wrangler.jsonc`](../apps/worker/wrangler.jsonc) file sends `statsmcp.dev/mcp`, `statsmcp.dev/<id>/mcp*` for each hosted office (`si`, `no`, `ee`, `fo`, `fi`, `se`, `dk`, `nl`, `is`, `hr`, `ie`, `ca`, `au` and `eu`) and `statsmcp.dev/index/*` to the Worker with a Workers route. The website on `statsmcp.dev` is a separate project. To use your own domain, change the route, or remove it and use the `workers.dev` URL.

### What the Worker does

- `/mcp` serves every office from one server; its data tools take a `country` argument. Each office also has its own path, `/<id>/mcp`, for example `/si/mcp` for SiStat and `/eu/mcp` for Eurostat. They need no authentication.
- Each new country adds one route line, `statsmcp.dev/<id>/mcp*`, next to its entry in `COUNTRIES` in `apps/worker/src/index.ts`.
- Each IP address can send 60 POST requests per minute. The [`wrangler.jsonc`](../apps/worker/wrangler.jsonc) file sets this limit. If the rate limiter fails, the Worker lets the request through.
- CORS allows all origins, so browser-based clients can connect.

### Privacy

The Worker does not store logs. Workers observability is off in [`wrangler.jsonc`](../apps/worker/wrangler.jsonc), so Cloudflare does not keep the Worker output, and the Worker code does not print request content. The rate limiter counts requests for each IP address for one minute and does not keep them after that.

### Cache

The Worker caches responses from the statistics API in two places:

1. In memory, for each Worker instance.
2. In the Cloudflare Cache API, for each data centre.

The Cache API keeps data only on your own domain (a custom domain or a route). On `workers.dev`, the Worker uses only the memory cache.

| Response       | Time in cache |
| -------------- | ------------- |
| Search results | 1 hour        |
| Table metadata | 24 hours      |
| Query results  | 1 hour        |

## Run the Worker on your computer

```sh
pnpm build
pnpm dev:worker
```

The all-countries endpoint is `http://127.0.0.1:8787/mcp`. One office is at `http://127.0.0.1:8787/<id>/mcp`, for example `http://127.0.0.1:8787/si/mcp`.
