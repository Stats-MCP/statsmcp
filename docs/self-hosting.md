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

The [`wrangler.jsonc`](../apps/worker/wrangler.jsonc) file sends `statsmcp.dev/si/mcp*`, `statsmcp.dev/no/mcp*`, `statsmcp.dev/ee/mcp*`, `statsmcp.dev/fo/mcp*`, `statsmcp.dev/fi/mcp*`, `statsmcp.dev/se/mcp*`, `statsmcp.dev/dk/mcp*`, `statsmcp.dev/nl/mcp*`, `statsmcp.dev/eu/mcp*` and `statsmcp.dev/ca/mcp*` to the Worker with a Workers route. The website on `statsmcp.dev` is a separate project. To use your own domain, change the route, or remove it and use the `workers.dev` URL.

### What the Worker does

- Each server has its own path. `/si/mcp` is the SiStat endpoint, `/no/mcp` is the Statbank Norway endpoint, `/ee/mcp` is the Statistics Estonia endpoint, `/fo/mcp` is the Statistics Faroe Islands endpoint, `/fi/mcp` is the Statistics Finland endpoint, `/se/mcp` is the Statistics Sweden endpoint, `/dk/mcp` is the Statistics Denmark endpoint, `/nl/mcp` is the Statistics Netherlands endpoint, `/eu/mcp` is the Eurostat endpoint and `/ca/mcp` is the Statistics Canada endpoint. They need no authentication.
- Each new country adds one route line, `statsmcp.dev/<id>/mcp*`, next to its entry in `SERVERS`.
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

The SiStat endpoint is `http://127.0.0.1:8787/si/mcp`, the Statbank Norway endpoint is `http://127.0.0.1:8787/no/mcp`, the Statistics Estonia endpoint is `http://127.0.0.1:8787/ee/mcp`, the Statistics Faroe Islands endpoint is `http://127.0.0.1:8787/fo/mcp`, the Statistics Finland endpoint is `http://127.0.0.1:8787/fi/mcp`, the Statistics Sweden endpoint is `http://127.0.0.1:8787/se/mcp`, the Statistics Denmark endpoint is `http://127.0.0.1:8787/dk/mcp`, the Statistics Netherlands endpoint is `http://127.0.0.1:8787/nl/mcp`, the Eurostat endpoint is `http://127.0.0.1:8787/eu/mcp`, and the Statistics Canada endpoint is `http://127.0.0.1:8787/ca/mcp`.
