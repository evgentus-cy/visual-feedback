#!/usr/bin/env node
/**
 * visual-feedback-mcp — dev-only MCP "channel" server (CLI entry).
 *
 *   browser ──POST batch JSON──► this server's 127.0.0.1 HTTP endpoint (channel.ts)
 *                                   └─ emits notifications/claude/channel
 *                                        └─ <channel source="feedback" …> lands in the session
 *                                             → Claude reads the batch and starts fixing, no keystroke
 *
 * Only the session launched with VISUAL_FEEDBACK_CHANNEL=1 binds the port (so the desktop app /
 * other sessions / health-check spawns can't intercept feedback). Channels are a Claude Code
 * research preview (>= 2.1.80); launch with `--dangerously-load-development-channels server:visual-feedback`.
 * See the repo README: https://github.com/evgentus-cy/visual-feedback
 *
 * Env config: VISUAL_FEEDBACK_PORT (3199), VISUAL_FEEDBACK_DIR (.claude/feedback),
 * VISUAL_FEEDBACK_PERSIST_SHOTS / _PERSIST_AUDIT ('0' to disable), VISUAL_FEEDBACK_CONTENT_LIMIT (12000),
 * VISUAL_FEEDBACK_ALLOWED_ORIGINS (comma-separated extra origins; loopback is always allowed).
 */
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRequestListener, type ChannelConfig } from './channel.ts';

const PORT = Number(process.env['VISUAL_FEEDBACK_PORT']) || 3199;

// A browser reliably sets `Origin` and JS can't forge it, so gating on it blocks a malicious
// website from POSTing into the session. Any loopback origin is trusted by default — it is the
// user's own local dev server. Non-loopback dev hosts (a LAN IP, a custom hostname) must be
// added explicitly via VISUAL_FEEDBACK_ALLOWED_ORIGINS (comma-separated full origins).
const LOOPBACK_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;
const EXTRA_ORIGINS = new Set(
  (process.env['VISUAL_FEEDBACK_ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const isOriginAllowed = (origin: string): boolean =>
  LOOPBACK_ORIGIN.test(origin) || EXTRA_ORIGINS.has(origin);

const config: ChannelConfig = {
  feedbackDir: path.resolve(
    process.cwd(),
    process.env['VISUAL_FEEDBACK_DIR'] ?? '.claude/feedback',
  ),
  persistShots: process.env['VISUAL_FEEDBACK_PERSIST_SHOTS'] !== '0',
  persistAuditLog: process.env['VISUAL_FEEDBACK_PERSIST_AUDIT'] !== '0',
  contentCharLimit: Number(process.env['VISUAL_FEEDBACK_CONTENT_LIMIT']) || 12_000,
};

// The low-level Server is the API the Channels research-preview docs use; McpServer's high-level
// API doesn't expose the experimental claude/channel capability or raw notifications cleanly.
// eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional, see note above
const mcp = new Server(
  { name: 'visual-feedback', version: '0.1.0' },
  {
    capabilities: { experimental: { 'claude/channel': {} } },
    // Canonical receiver policy — travels with the package so every consuming session gets it.
    instructions:
      'UI feedback batches arrive as <channel source="feedback" route="…" count="…" screenshot="…">: ' +
      'a markdown checklist of UI fix requests. Treat each "## N." block as one task; work through all ' +
      'of them and report what you changed per item.\n' +
      'Interpretation: the user comment is the source of truth. Comments may be written in any language — ' +
      'act on them directly, do NOT translate-and-ask (code and commits stay English; write your report in ' +
      'the language the project or user uses). If a comment is genuinely ambiguous, ask ONE clarifying ' +
      'question instead of guessing; for anything irreversible or outward-facing, verify first per the ' +
      "project's instructions (e.g. CLAUDE.md).\n" +
      'Locators are best-effort: a data-vf-source / data-v-inspector breadcrumb (file:line:col, leaf → page), ' +
      'an optional data-feedback id, a CSS selector, the component name, the element tag + visible text, and ' +
      'the route. Confirm the target by component name + visible text before editing (lines may have shifted) ' +
      'and restate the file:line you resolved each item to. If a data-feedback id is present, grep that exact ' +
      'attribute — it is stable across line shifts; trust it over line numbers.\n' +
      'Where to fix: for shared UI-kit / design-system components, fix at the USAGE SITE (props on the ' +
      'page/parent), not the shared component, unless the change is truly library-wide.\n' +
      'Context: the batch "Context:" line (viewport, DPR, lang, color-scheme) and each item route (full path + ' +
      'query + hash) define the exact view the user saw — reproduce that state, and the lang/locale tells you ' +
      'which language a copy fix targets (edit the i18n key in every locale, not the template). Any screenshot ' +
      'path is a readable file on disk — read it before judging a color/spacing/layout complaint.',
  },
);

await mcp.connect(new StdioServerTransport());

const httpServer = createServer(
  createRequestListener({
    notify: (event) => mcp.notification({ method: 'notifications/claude/channel', params: event }),
    config,
    isOriginAllowed,
  }),
);

if (process.env['VISUAL_FEEDBACK_CHANNEL'] === '1') {
  httpServer.on('error', (error: unknown) => {
    process.stderr.write(`[visual-feedback] HTTP listener not started: ${String(error)}\n`);
  });
  httpServer.listen(PORT, '127.0.0.1', () => {
    process.stderr.write(
      `[visual-feedback] channel HTTP endpoint on http://127.0.0.1:${String(PORT)} — this session receives browser feedback\n`,
    );
  });
} else {
  process.stderr.write(
    '[visual-feedback] HTTP endpoint OFF (set VISUAL_FEEDBACK_CHANNEL=1 on the session that should receive feedback)\n',
  );
}
