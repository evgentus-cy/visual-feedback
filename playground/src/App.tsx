import type { ReactElement } from 'react';
import { VisualFeedback } from 'visual-feedback/react';

export function App(): ReactElement {
  return (
    <main
      style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '0 auto', padding: 32 }}
    >
      {/* dev-only: mounts the overlay + pings the MCP channel server's /health */}
      {import.meta.env.DEV && <VisualFeedback />}

      <h1>Visual Feedback — React playground</h1>
      <p>
        Press <kbd>Alt</kbd>+<kbd>C</kbd>, click an element, write a comment (and optionally attach
        a screenshot), then <strong>Send</strong>. With a Claude Code channel session running, the
        batch lands there and Claude starts fixing.
      </p>

      <button type="button">A button to comment on</button>

      <section
        data-feedback="demo-hero"
        style={{ marginTop: 24, padding: 16, border: '1px solid #ccc', borderRadius: 8 }}
      >
        <h2>A marked block</h2>
        <p>
          This section carries <code>data-feedback="demo-hero"</code> — a refactor-proof handle the
          overlay prefers over the line-based source location.
        </p>
      </section>
    </main>
  );
}
