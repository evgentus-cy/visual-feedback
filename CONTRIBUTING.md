# Contributing

Thanks for your interest! This is a small, focused tool — bug reports, docs fixes, and adapter
improvements are all welcome.

## Dev setup

**Node ≥ 22.12 is required for development** (the `nuxt` devDependency and the
`--experimental-strip-types` dogfood config in `.mcp.json` demand it). The published package
itself runs on Node ≥ 20.19.

```sh
pnpm install
pnpm build          # tsup — builds all five entry points into dist/
pnpm test           # vitest
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm format         # prettier
```

## Playground

A runnable React + Vite example lives in [`playground/`](playground/):

```sh
pnpm build                       # the playground consumes dist/ via the package exports
pnpm playground                  # vite dev server on :4173
```

Press `Alt+C` in the playground, comment on an element, and Send. To receive the batch in a
live Claude Code session, start one from this repo with:

```sh
VISUAL_FEEDBACK_CHANNEL=1 claude --dangerously-load-development-channels server:visual-feedback
```

## Project layout

```
src/core    framework-agnostic overlay (the package root export)
src/vite    Vite plugin — injects data-vf-source on JSX
src/nuxt    Nuxt module + client runtime plugin
src/react   React adapter
src/mcp     MCP channel server (bin: visual-feedback-mcp) + its testable core (channel.ts)
```

All five are built by one `tsup.config.ts` into `dist/<area>/` and exposed as subpath exports
of the single `visual-feedback` package.

## Pull requests

- Keep the zero-production-footprint invariant: nothing from this package may end up in a
  consumer's production bundle. The Nuxt module self-disables (`!nuxt.options.dev`), the Vite
  plugin is `apply: 'serve'`, the React adapter no-ops on `import.meta.env.PROD`.
- Add or update tests for behavior changes (`*.spec.ts` colocated with the source).
- Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` before pushing — CI runs the same.

## Releasing (maintainers)

Describe your changes under `## [Unreleased]` in `CHANGELOG.md` as they land. Then one command:

```sh
pnpm release:patch   # or release:minor / release:major
```

It chains the standard npm `version` lifecycle:

1. `preversion` — refuses to run off `main`, then lint + typecheck + test + build.
2. `npm version <bump>` — bumps `package.json` (refuses on a dirty tree).
3. `version` — stamps the `[Unreleased]` notes as `[X.Y.Z] - date` in `CHANGELOG.md`
   (fails if Unreleased is empty — every release must say what changed).
4. npm commits `vX.Y.Z` and tags it; `postversion` pushes with `--follow-tags`.
5. The tag triggers the [Release workflow](.github/workflows/release.yml), which re-runs the
   checks and publishes to npm **with provenance** (requires the `NPM_TOKEN` repo secret; the
   workflow also refuses a tag that doesn't match `package.json`).

Nothing is ever published from a laptop — `npm publish` happens only in CI.
