# Contributing

Thank you for your help. This document tells you how to set up the project and send a change.

## Set up

You need Node.js 24.21 or later (see `.nvmrc`). Enable pnpm with `corepack enable`.

```sh
pnpm install
pnpm build
```

## Before you send a change

Run all checks. CI runs these checks and a smoke test of the packed packages.

```sh
pnpm format       # oxfmt check (pnpm format:fix to correct)
pnpm lint         # oxlint
pnpm typecheck
pnpm test
```

## Code rules

The linter or the compiler enforces these rules:

- Use TypeScript in strict mode. Do not use `any`.
- Use `import type` for imports that are only types.
- Use named exports. Only the tsdown and vitest config files and the Worker entry use a default export.
- Use the `@/` alias for imports in a package. Do not use relative imports.
- Do not use nested ternary operators.
- Do not use `console`, except `console.error`. The stdio server uses standard output for the MCP protocol.

These rules are conventions:

- Add a comment only when the reason for the code is not clear.
- Use kebab-case for file names.

## Tests

- Test behaviour through the public interface of a package.
- Mock only the network and other external systems.
- Use `it.each` for variations of the same test.
- A new test must fail if the code that it tests is broken.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/), for example `fix(core): handle empty search results`.
- Keep one topic in each pull request.
- If you change a published package, run `pnpm changeset` and add the changeset file to the pull request.
- If you change what a tool returns, update `docs/examples.md`.

## Add a statistics office

First read the terms of use of the office. If the terms do not allow commercial use, tell us in the pull request. We do not put these offices on the hosted endpoint.

Then do these steps. Use `packages/cso` as a model.

1. Make `packages/<office>/`. Copy `package.json`, `src/preset.ts`, `src/preset.test.ts`, `src/bin.ts`, `src/index.ts`, `README.md` and `LICENSE` from `packages/cso`.
2. Add the package to the `fixed` list in `.changeset/config.json`.
3. Add the directory name to the list in `scripts/sync-versions.mjs`.
4. Add the office to `COUNTRIES` in `apps/worker/src/index.ts`. Add the package to `dependencies` in `apps/worker/package.json`.
5. Add a route to `apps/worker/wrangler.jsonc`.
6. Add the office to the "Databases" table and to the table of endpoint codes in `README.md`.
7. Add the package to the layout table in `docs/development.md`.
8. Add a section to `docs/data-licence.md`.
9. If the office needs a crawled list of tables, add a source in `apps/crawler/src/sources.ts`.
10. Run `pnpm changeset` and add the changeset file.

## Releases

The maintainer releases the packages by hand at this time. The changesets in merged pull requests ship in the next release. Refer to [docs/releasing.md](docs/releasing.md).
