# Releasing

This page is for the maintainer.

## How a release works

1. A pull request that changes a published package contains a changeset (`pnpm changeset`).
2. When the pull request is merged, the Release workflow opens or updates the pull request "chore: release packages". This pull request changes the versions and the changelogs.
3. When the release pull request is merged, the Release workflow publishes `pxweb-mcp`, `sistat-mcp`, `ssb-mcp`, `stat-ee-mcp`, `hagstova-mcp`, `statfin-mcp`, `scb-mcp`, `dst-mcp`, `cbs-mcp` and `statsmcp-eurostat` to npm with provenance and creates GitHub releases.

`pxweb-mcp`, `sistat-mcp`, `ssb-mcp`, `stat-ee-mcp`, `hagstova-mcp`, `statfin-mcp`, `scb-mcp`, `dst-mcp`, `cbs-mcp` and `statsmcp-eurostat` always have the same version.

Pull requests that the workflow opens do not start CI. To run CI on the release pull request, close it and open it again.

To run `pnpm version-packages` on your computer, set `GITHUB_TOKEN`. The changelog generator reads pull request data from GitHub.

## Manual release from your computer

Use this only when CI cannot run. Releases from your computer have no provenance.

```sh
npm login
pnpm build
pnpm -r --filter './packages/*' publish --no-git-checks
```

Use `pnpm publish`, not `npm publish`. pnpm replaces `workspace:*` and `catalog:` with real versions.

## First release

Do these steps in this order.

1. Make the repository public. npm provenance does not work from a private repository.
2. Enable Settings > Code security > Private vulnerability reporting. Open the [report link](https://github.com/Stats-MCP/statsmcp/security/advisories/new) from a different account to make sure that it works.
3. Make an npm automation token and add it as the `NPM_TOKEN` repository secret.
4. Check the MCP Registry name before the first npm release. Install `mcp-publisher`, log in with GitHub, and run its validate or dry-run command in `packages/sistat`. The published `mcpName` cannot change without a new release.
5. Set the repository variable `RELEASE_ENABLED` to `true` and push to `main`. The Release workflow opens the pull request "chore: release packages" with the pending changesets. Merge it. The workflow then publishes the new version, for example 0.1.1.
6. On npmjs.com, add a trusted publisher for each package: repository `Stats-MCP/statsmcp`, workflow `release.yml`.
7. Delete the `NPM_TOKEN` secret. Remove `NODE_AUTH_TOKEN` and `registry-url` from `release.yml`. An empty token can stop the trusted publishing exchange.

## Hosted endpoint

1. Add the domain to Cloudflare.
2. Add a route `statsmcp.dev/<id>/mcp*` with `zone_name` to [`apps/worker/wrangler.jsonc`](../apps/worker/wrangler.jsonc). The website project owns the custom domain.
3. Deploy with `pnpm deploy:worker`.
4. Add the endpoint URL to the README Quick start.

## MCP Registry metadata

`packages/sistat/server.json` describes `sistat-mcp` for the [MCP Registry](https://registry.modelcontextprotocol.io). Its `name` must be the same as `mcpName` in `packages/sistat/package.json`. `pnpm version-packages` copies the new version into `server.json` and into the `version` field of each preset (`packages/*/src/preset.ts`).

## Directories

Do these steps after the first npm release, when the repository is public.

- [ ] MCP Registry: run `mcp-publisher publish` in `packages/sistat`. The name is `io.github.Stats-MCP/sistat`. If the registry asks for a different casing, change it in `server.json` and in `package.json`. Then make a new release.
- [ ] Claude Connectors Directory: claude.ai/directory/manage, then Submit new, then MCP connector. Server URL `https://statsmcp.dev/si/mcp`, no authentication, read-only, documentation `https://statsmcp.dev/slovenia/`.
- [ ] ChatGPT apps directory: verify the domain `statsmcp.dev` first.
- [ ] Community lists: Smithery, Glama, mcp.so, PulseMCP, and a pull request to `modelcontextprotocol/servers`.
- [ ] Google Search Console: verify `statsmcp.dev` with a DNS TXT record in Cloudflare, then submit `https://statsmcp.dev/sitemap-index.xml`.
- [ ] Announce the project with the home Open Graph image.
