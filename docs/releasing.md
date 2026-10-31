# Releasing

This page is for the maintainer.

## How a release works

1. A pull request that changes a published package contains a changeset (`pnpm changeset`).
2. When the pull request is merged, the Release workflow opens or updates the pull request "chore: release packages". This pull request changes the versions and the changelogs.
3. When the release pull request is merged, the Release workflow publishes `pxweb-mcp` and `sistat-mcp` to npm with provenance and creates GitHub releases.

`pxweb-mcp` and `sistat-mcp` always have the same version.

Pull requests that the workflow opens do not start CI. To run CI on the release pull request, close it and open it again.

To run `pnpm version-packages` on your computer, set `GITHUB_TOKEN`. The changelog generator reads pull request data from GitHub.

## First release

Do these steps in this order.

1. Make the repository public. npm provenance does not work from a private repository.
2. Enable Settings > Code security > Private vulnerability reporting. Open the [report link](https://github.com/Stats-MCP/statsmcp/security/advisories/new) from a different account to make sure that it works.
3. Make an npm automation token and add it as the `NPM_TOKEN` repository secret.
4. Set the repository variable `RELEASE_ENABLED` to `true`.
5. Push to `main`. The Release workflow publishes version 0.1.0, because it is not on npm yet.
6. On npmjs.com, add a trusted publisher for each package: repository `Stats-MCP/statsmcp`, workflow `release.yml`.
7. Delete the `NPM_TOKEN` secret. Remove `NODE_AUTH_TOKEN` and `registry-url` from `release.yml`. An empty token can stop the trusted publishing exchange.

## Hosted endpoint

1. Add the domain to Cloudflare.
2. Add a custom domain route to [`apps/worker/wrangler.jsonc`](../apps/worker/wrangler.jsonc).
3. Deploy with `pnpm deploy:worker`.
4. Add the endpoint URL to the README Quick start.
