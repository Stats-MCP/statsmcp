# Contributing

Thank you for your help. This document tells you how to set up the project and send a change.

## Set up

You need Node.js 24 and pnpm 12.

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

To add a PxWeb instance, first read the terms of use of that office. If the terms do not allow commercial use, tell us in the pull request. We do not put these instances on the hosted endpoint.

## Releases

The maintainer releases the packages. The Release workflow opens a version pull request from the changesets. When this pull request is merged, the workflow publishes the packages to npm with provenance.
