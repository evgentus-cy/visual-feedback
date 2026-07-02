/**
 * visual-feedback/react — dev-only React adapter.
 *
 * Render `<VisualFeedback />` once near your app root (in dev). It mounts the framework-agnostic
 * overlay and POSTs feedback batches to the local MCP channel server. Pair with
 * `visual-feedback/vite` so the overlay can map a clicked element back to source
 * (it injects `data-vf-source`, which the core resolver reads).
 *
 * It renders nothing and is a no-op in production builds (guarded on import.meta.env.PROD), so
 * it can be left in the tree — though gating it behind a dev check at the call site is cleaner.
 */
import { useEffect } from 'react';
import { createVisualFeedback, type VisualFeedbackOptions } from 'visual-feedback';

export interface VisualFeedbackProps {
  /** MCP channel server port. Default 3199. Ignored when `endpoint` is set. */
  port?: number;
  /** Full endpoint URL (defaults to `http://127.0.0.1:<port>`). */
  endpoint?: string;
  /** Pass-through core options (resolveSource, captureScreenshot, hotkey, storageKey, …). */
  options?: Omit<VisualFeedbackOptions, 'transport'>;
}

function isProduction(): boolean {
  const meta = import.meta as { env?: { PROD?: boolean } };
  return meta.env?.PROD === true;
}

export function VisualFeedback({ port = 3199, endpoint, options }: VisualFeedbackProps): null {
  useEffect(() => {
    if (isProduction()) return;
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
  }, [port, endpoint, options]);

  return null;
}
