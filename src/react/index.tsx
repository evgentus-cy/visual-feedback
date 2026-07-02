/**
 * visual-feedback/react — dev-only React adapter.
 *
 * Render `<VisualFeedback />` once near your app root (in dev). It mounts the framework-agnostic
 * overlay and POSTs feedback batches to the local MCP channel server. Pair with
 * `visual-feedback/vite` so the overlay can map a clicked element back to source
 * (it injects `data-vf-source`, which the core resolver reads).
 *
 * Mounting is fail-closed: the overlay activates only when the bundler statically marks the
 * build as development (`import.meta.env.DEV === true` — Vite dev, vitest) or when the `enabled`
 * prop is passed explicitly. Gating the element behind `import.meta.env.DEV` at the call site is
 * still cleaner — it lets the bundler drop the import (and the overlay code) entirely.
 */
import { useEffect } from 'react';
import { createVisualFeedback, type VisualFeedbackOptions } from 'visual-feedback';

export interface VisualFeedbackProps {
  /** MCP channel server port. Default 3199. Ignored when `endpoint` is set. */
  port?: number;
  /** Full endpoint URL (defaults to `http://127.0.0.1:<port>`). */
  endpoint?: string;
  /**
   * Force the overlay on/off. Default: `import.meta.env.DEV === true` — only a build the
   * bundler statically marks as dev mounts; unknown environments (no `import.meta.env`,
   * e.g. a non-Vite production bundle) stay OFF.
   */
  enabled?: boolean;
  /** Pass-through core options (resolveSource, captureScreenshot, hotkey, storageKey, …). */
  options?: Omit<VisualFeedbackOptions, 'transport'>;
}

// `import.meta.env` must stay a direct member expression — bundlers replace it statically,
// and aliasing `import.meta` into a variable defeats the replacement (the overlay would then
// decide at runtime, where a bare ESM `import.meta` has no `env` at all).
function isBundlerDev(): boolean {
  try {
    return (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  } catch {
    return false;
  }
}

export function VisualFeedback({
  port = 3199,
  endpoint,
  enabled,
  options,
}: VisualFeedbackProps): null {
  const active = enabled ?? isBundlerDev();
  useEffect(() => {
    if (!active) return;
    const url = endpoint ?? `http://127.0.0.1:${String(port)}`;
    const handle = createVisualFeedback({
      healthCheck: async () => {
        try {
          const response = await fetch(`${url}/health`);
          return response.ok;
        } catch {
          return false;
        }
      },
      ...options,
      transport: {
        async send(batch) {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batch),
          });
          if (!response.ok) {
            throw new Error(`visual-feedback endpoint responded ${String(response.status)}`);
          }
        },
      },
    });
    return () => {
      handle.destroy();
    };
  }, [active, port, endpoint, options]);

  return null;
}
