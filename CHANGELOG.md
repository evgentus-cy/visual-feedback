# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-02

### Added

- Initial public release, extracted from the internal monorepo where the tool was built and
  dogfooded. One package, five entry points:
  - `visual-feedback` — framework-agnostic dev-only overlay (shadow DOM, comment queue with
    localStorage persistence, element→source resolver, connection indicator, screenshot
    annotation via html2canvas).
  - `visual-feedback/vite` — Vite plugin that tags JSX with `data-vf-source="file:line:col"`
    (the React path; `apply: 'serve'`, zero production footprint).
  - `visual-feedback/nuxt` — Nuxt 4 module; self-disables in production builds.
  - `visual-feedback/react` — `<VisualFeedback />` adapter.
  - `visual-feedback/mcp` — programmatic API of the channel server (`handleBatch`,
    `createRequestListener`), plus the `visual-feedback-mcp` CLI bin that bridges browser
    feedback into a live Claude Code session via `notifications/claude/channel`.

### Changed (vs the internal version)

- The MCP server's Origin gate is now configurable: any loopback origin
  (`http://localhost:*`, `http://127.0.0.1:*`, `[::1]`) is allowed by default, and
  `VISUAL_FEEDBACK_ALLOWED_ORIGINS` (comma-separated) extends the allowlist for
  non-loopback dev hosts. Previously the allowlist was hardcoded.
- Receiver-policy instructions genericized (no references to a specific repo's conventions).
