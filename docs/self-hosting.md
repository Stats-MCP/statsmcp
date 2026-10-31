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

3. Connect a client to `https://<your-worker>/mcp`.

### What the Worker does

- `/mcp` is the MCP endpoint. It needs no authentication.
- `/` shows a short text about the server.
- Each IP address can send 60 POST requests per minute. The [`wrangler.jsonc`](../apps/worker/wrangler.jsonc) file sets this limit. If the rate limiter fails, the Worker lets the request through.
- CORS allows all origins, so browser-based clients can connect.

### Cache

The Worker caches responses from the statistics API in two places:

1. In memory, for each Worker instance.
2. In the Cloudflare Cache API, for each data centre.

The Cache API keeps data only on a custom domain. On `workers.dev`, the Worker uses only the memory cache.

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

The endpoint is `http://127.0.0.1:8787/mcp`.
