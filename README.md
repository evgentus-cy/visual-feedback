# visual-feedback

> **Mark an element → write a comment → press Send → Claude fixes it.**

Comment on UI **directly in your running dev app** and push those comments — with exact
`file:line:col` source context and optional annotated screenshots — straight into your **live
[Claude Code](https://code.claude.com) session**, so Claude starts fixing without you typing in
the terminal.

[![CI](https://github.com/evgentus-cy/visual-feedback/actions/workflows/ci.yml/badge.svg)](https://github.com/evgentus-cy/visual-feedback/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40evgentus%2Fvisual-feedback)](https://www.npmjs.com/package/@evgentus/visual-feedback)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![Demo: toggle the overlay, comment on elements, press Send — the batch lands in a live Claude Code session and Claude starts fixing](https://raw.githubusercontent.com/evgentus-cy/visual-feedback/main/docs/demo.gif)

**Dev-only by design, stripped from production builds.** Push-only by design —
[Claude Code Channels](https://code.claude.com/docs/en/channels) is a hard requirement (research
preview; see [prerequisites](#prerequisites)).

## How it works

```
[browser overlay in your dev app]  ──Send──►  POST http://127.0.0.1:3199   (batch JSON + screenshots)
                                                  │  (visual-feedback-mcp, spawned by Claude Code over stdio)
                                                  ├─ writes screenshot PNGs (so Claude can read them)
                                                  └─ emits notifications/claude/channel
                                                       └─ <channel source="feedback" route=… count=…>
                                                             └─ lands in the live session → Claude reads & fixes
```

The browser and the MCP server both run on the **host**, so the POST is host-local
(`127.0.0.1`) — a dev app served from a Docker container doesn't change the delivery path and
needs no extra port mapping for `3199`.

One npm package, five entry points:

| Entry                             | What it is                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@evgentus/visual-feedback`       | framework-agnostic overlay (shadow DOM, comment queue, source resolver, connection indicator, screenshots) |
| `@evgentus/visual-feedback/nuxt`  | Nuxt 4 module — one `modules` line, self-disables in production                                            |
| `@evgentus/visual-feedback/react` | `<VisualFeedback />` adapter                                                                               |
| `@evgentus/visual-feedback/vite`  | Vite plugin that tags JSX with `data-vf-source="file:line:col"` (the React source-mapping path)            |
| `@evgentus/visual-feedback/mcp`   | programmatic API of the channel server; the `visual-feedback-mcp` **bin** is the bridge into Claude Code   |

## Prerequisites

- **Claude Code ≥ 2.1.80** (Channels research preview).
- **Anthropic auth** via claude.ai or a Console API key. Not available on Bedrock / Vertex / Foundry.
- **Org gating:** Pro/Max accounts have Channels on. Team/Enterprise admins must enable
  `channelsEnabled` (claude.ai → Admin settings → Claude Code → Channels). A
  `blocked by org policy` startup notice means it is off.
- For fully hands-off fixing, run the session so edits don't pause for approval (accept-edits
  mode or a permission allowlist for `Edit`/`Write`).

## Quickstart

### 1. Install

```sh
npm i -D @evgentus/visual-feedback
```

### 2. Wire the overlay

**Nuxt** (source mapping is free — the overlay reads Nuxt DevTools' `data-v-inspector`):

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@evgentus/visual-feedback/nuxt'],
  // optional: visualFeedback: { port: 3199 },
});
```

**React + Vite** (React 19 removed the fiber `_debugSource`, so the Vite plugin injects
`data-vf-source` at serve time):

```ts
// vite.config.ts
import react from '@vitejs/plugin-react';
import { visualFeedbackSource } from '@evgentus/visual-feedback/vite';

export default defineConfig({
  plugins: [visualFeedbackSource(), react()], // before the React plugin
});
```

```tsx
// App root — render only in dev
import { VisualFeedback } from '@evgentus/visual-feedback/react';

{
  import.meta.env.DEV && <VisualFeedback />;
}
```

**Anything else (vanilla):** call `createVisualFeedback({ transport, healthCheck })` from
`@evgentus/visual-feedback` — see [Core options](#core-options). The core resolver also reads
`data-v-inspector` (Nuxt DevTools / `vite-plugin-vue-inspector`) and `data-inspector-*`
(`react-dev-inspector` / Locator), so an existing inspector works without the Vite plugin.

### 3. Register the MCP channel server

In your repo's `.mcp.json`:

```json
{
  "mcpServers": {
    "visual-feedback": {
      "command": "npx",
      "args": ["visual-feedback-mcp"]
    }
  }
}
```

> **Monorepo note:** `npx` finds the bin when the package is installed at the workspace root.
> In a pnpm monorepo where the dependency lives in a sub-app, point at the file instead —
> `"command": "node", "args": ["apps/web/node_modules/@evgentus/visual-feedback/dist/mcp/server.js"]`
> — and keep the dependency **inside the sub-app**: its optional `nuxt` peer makes pnpm resolve a
> second `nuxt` instance when it is also a root-level dependency, which breaks the Nuxt dev server
> in confusing ways.

### 4. Start the receiving session

```sh
VISUAL_FEEDBACK_CHANNEL=1 claude --dangerously-load-development-channels server:visual-feedback
```

- On first run, approve the consent prompt: _"New MCP server found in this project:
  visual-feedback"_ → **Use this MCP server**.
- Look for the dim notice: _"Channels (experimental) messages from server:visual-feedback inject
  directly in this session"_.
- `VISUAL_FEEDBACK_CHANNEL=1` makes **this** session own the localhost HTTP endpoint the browser
  POSTs to — you do not run the server yourself. Every other Claude instance in the repo (other
  terminals, the desktop app, health-check spawns) loads the same `.mcp.json` server but stays
  quiet, so it can't silently intercept your feedback.
- Tip: `alias claude-fb='VISUAL_FEEDBACK_CHANNEL=1 claude --dangerously-load-development-channels server:visual-feedback'`.

### 5. Use it

1. Toggle the overlay with **`Alt+C`** (`⌥C` on macOS) in the dev app.
2. Hover any element to highlight it, then click it — a comment popover opens. Write your note
   (`Ctrl`/`⌘+Enter` to add).
3. Repeat to **batch** several comments across the page.
4. Optionally tick **attach screenshot** and drag a highlight box on it.
5. Press **Send** → the batch lands in your Claude Code session and Claude starts working.
6. **No session / no connection?** The connection dot turns red (tooltip: _No Claude session_) and the batch is kept in
   `localStorage` — start a session and press Send again; nothing is lost.

### Marking components (optional)

Every element is addressable automatically via the injected source attributes. For a block that
needs a **refactor-proof handle**, add a stable attribute the overlay prefers over line numbers:

```html
<section data-feedback="home-hero">…</section>
```

## Verify the transport (go/no-go)

The whole tool depends on Channels working for your account/org. With a session started as
above, in a second terminal:

```sh
curl -X POST -H 'Content-Type: application/json' \
  -d '{"markdown":"# Test\n- [ ] Confirm you received this batch","route":"/pricing","items":[{}]}' \
  http://127.0.0.1:3199
```

Expected: `{"ok":true,…}` from curl, and — without typing anything — the session shows
`<channel source="feedback" route="/pricing" count="1">…</channel>` and Claude reacts. If your
org blocks Channels, the tool cannot deliver (there is no fallback).

## Configuration

### MCP server (env)

| Var                               | Default            | Notes                                                     |
| --------------------------------- | ------------------ | --------------------------------------------------------- |
| `VISUAL_FEEDBACK_CHANNEL`         | —                  | must be `1` for this session to bind the HTTP port        |
| `VISUAL_FEEDBACK_PORT`            | `3199`             | must match the overlay's port                             |
| `VISUAL_FEEDBACK_DIR`             | `.claude/feedback` | where screenshots + audit logs are written                |
| `VISUAL_FEEDBACK_PERSIST_SHOTS`   | `1`                | `0` to disable screenshot files                           |
| `VISUAL_FEEDBACK_PERSIST_AUDIT`   | `1`                | `0` to disable audit logs                                 |
| `VISUAL_FEEDBACK_CONTENT_LIMIT`   | `12000`            | above this, push a summary + a file pointer               |
| `VISUAL_FEEDBACK_ALLOWED_ORIGINS` | —                  | comma-separated extra origins; loopback is always allowed |

### Nuxt module

```ts
export default defineNuxtConfig({
  modules: ['@evgentus/visual-feedback/nuxt'],
  visualFeedback: { port: 3199 }, // default
});
```

The port is exposed via `runtimeConfig.public.visualFeedbackPort`; override at runtime with
`NUXT_PUBLIC_VISUAL_FEEDBACK_PORT` (no rebuild). It must match the server's
`VISUAL_FEEDBACK_PORT`.

### React props

| Prop       | Default                   | Notes                                                                         |
| ---------- | ------------------------- | ----------------------------------------------------------------------------- |
| `port`     | `3199`                    | MCP server port; must match its `VISUAL_FEEDBACK_PORT`                        |
| `endpoint` | `http://127.0.0.1:<port>` | full endpoint URL override                                                    |
| `enabled`  | `import.meta.env.DEV`     | force on/off; unknown environments (no `import.meta.env`) stay **off**        |
| `options`  | —                         | pass-through core options (`resolveSource`, `captureScreenshot`, `hotkey`, …) |

### Vite plugin options

| Option       | Default            | Notes                   |
| ------------ | ------------------ | ----------------------- |
| `attribute`  | `data-vf-source`   | the attribute to inject |
| `extensions` | `['.jsx', '.tsx']` | files to instrument     |

### Core options

| Option              | Default                        | Notes                                                                                          |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `transport`         | — (required)                   | `{ send(batch) }` — where a flushed batch goes                                                 |
| `resolveSource`     | reads the attributes above     | `(el) => SourceLocation \| null`                                                               |
| `captureScreenshot` | `html2canvas` (dynamic import) | `(el) => Promise<dataURL \| undefined>`                                                        |
| `getRoute`          | full client path               | route string attached to each item                                                             |
| `getPageContext`    | reads the window               | viewport / DPR / lang / color-scheme for the batch `Context:` line; return `undefined` to omit |
| `hotkey`            | `Alt+KeyC`                     | `KeyboardEvent.code` + optional `Alt+`/`Ctrl+`/`Shift+`/`Meta+`                                |
| `storageKey`        | `visual-feedback:queue`        | localStorage key (queue survives reloads)                                                      |
| `healthCheck`       | —                              | `() => Promise<boolean>`; omit to hide the connection indicator                                |
| `idGenerator`       | `crypto.randomUUID` + fallback | item id factory                                                                                |

## Production safety (nothing ships)

Defense-in-depth:

1. The Nuxt module self-disables in prod (`if (!nuxt.options.dev) return`) — the overlay and its
   core import never enter the production bundle.
2. The Vite plugin is `apply: 'serve'` — it never runs in `vite build`.
3. The React adapter is fail-closed: it mounts only when the bundler statically marks the build
   as dev (`import.meta.env.DEV === true`) or when `enabled` is passed explicitly. Gating it
   behind `import.meta.env.DEV` at the call site is still better — the bundler then drops the
   import (and all overlay code) from production bundles entirely.

Suggested CI invariant: build your app for production and grep the output for
`visual-feedback` / `data-vf-source` — zero matches.

## Security

- The HTTP endpoint binds **`127.0.0.1` only** (not reachable off-machine).
- An **Origin gate** rejects cross-site POSTs: a browser reliably sets `Origin` and JS can't
  forge it, so a malicious website can't push into your session. Loopback origins are allowed by
  default; extend with `VISUAL_FEEDBACK_ALLOWED_ORIGINS`. Requests with no `Origin` (curl /
  local tooling) are allowed.
- Channel content goes straight into Claude's context — by design only your local dev tooling
  posts to it.

## Troubleshooting

| Symptom                                                          | Cause / fix                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Browser Send returns `{"ok":true,…}` but Claude never reacts** | A Claude instance that ISN'T your channel session owns the port (often the desktop app), receives the POST, and drops the notification. Launch the receiving session with `VISUAL_FEEDBACK_CHANNEL=1`; find strays with `lsof -nP -i :3199` and kill them. |
| `blocked by org policy` on startup                               | `channelsEnabled` is off — an org admin must enable it.                                                                                                                                                                                                    |
| curl / Send `connection refused`                                 | No session owns the port. Launch with `VISUAL_FEEDBACK_CHANNEL=1 claude --dangerously-load-development-channels server:visual-feedback`; check `VISUAL_FEEDBACK_PORT`.                                                                                     |
| `[visual-feedback] HTTP listener not started` in logs            | Another `VISUAL_FEEDBACK_CHANNEL=1` session already holds the port. Only run one.                                                                                                                                                                          |
| `[visual-feedback] HTTP endpoint OFF` in logs                    | This session wasn't marked with `VISUAL_FEEDBACK_CHANNEL=1` — expected for every session except your one channel session.                                                                                                                                  |
| curl returns `403 forbidden origin`                              | Non-loopback dev origin — add it to `VISUAL_FEEDBACK_ALLOWED_ORIGINS`.                                                                                                                                                                                     |
| Delivered, but Claude pauses on every edit                       | Not hands-off — run the session in accept-edits mode / with a permission allowlist.                                                                                                                                                                        |
| Connection dot stays red (no session)                            | `GET /health` failed: port mismatch (overlay port ↔ server `VISUAL_FEEDBACK_PORT`) or no `VISUAL_FEEDBACK_CHANNEL=1` session running.                                                                                                                      |

## Playground

A runnable React + Vite example lives in [`playground/`](playground/):

```sh
pnpm install && pnpm build && pnpm playground   # vite dev server on :4173
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs welcome.

## License

[MIT](LICENSE)
