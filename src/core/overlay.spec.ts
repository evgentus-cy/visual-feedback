import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVisualFeedback } from './index.ts';
import { fitScale } from './overlay.ts';
import type { ElementContext, FeedbackBatch, Transport } from './types.ts';

function overlayHost(): Element | undefined {
  return [...document.body.children].find((child) => child.shadowRoot != null);
}
function query<T extends HTMLElement>(selector: string): T | null | undefined {
  return overlayHost()?.shadowRoot?.querySelector<T>(selector);
}

function recordingTransport(): Transport & { sent: FeedbackBatch[] } {
  const sent: FeedbackBatch[] = [];
  return {
    sent,
    send: (batch) => {
      sent.push(batch);
      return Promise.resolve();
    },
  };
}

const CONTEXT: ElementContext = { breadcrumb: [], selector: 'div', tag: 'div' };

function seedQueue(storageKey: string, comment: string): void {
  const item = { id: 'a', comment, route: '/', createdAt: 0, context: CONTEXT };
  // storageKey is the full localStorage key (default 'visual-feedback:queue').
  globalThis.localStorage.setItem(storageKey, JSON.stringify({ version: 1, items: [item] }));
}

describe('fitScale', () => {
  it('never upscales when the image already fits', () => {
    expect(fitScale(100, 100, 276, 220)).toBe(1);
  });

  it('bounds a tall capture by its height (keeps the action buttons reachable)', () => {
    // 300×1200 → height is the binding constraint: 220/1200, so the canvas stays ≤ 220px tall.
    const scale = fitScale(300, 1200, 276, 220);
    expect(scale).toBeCloseTo(220 / 1200, 5);
    expect(1200 * scale).toBeLessThanOrEqual(220);
    expect(300 * scale).toBeLessThanOrEqual(276);
  });

  it('bounds a wide capture by its width', () => {
    const scale = fitScale(800, 200, 276, 220);
    expect(scale).toBeCloseTo(276 / 800, 5);
    expect(800 * scale).toBeLessThanOrEqual(276);
  });
});

describe('createVisualFeedback overlay', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    document.body.replaceChildren();
  });
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('mounts a shadow-DOM FAB and destroys cleanly', () => {
    const handle = createVisualFeedback({ transport: recordingTransport() });
    expect(query('.vf-fab')).toBeTruthy();
    handle.destroy();
    expect(overlayHost()).toBeUndefined();
  });

  it('toggle() flips select mode', () => {
    const handle = createVisualFeedback({ transport: recordingTransport() });
    handle.toggle();
    expect(query('.vf-fab')?.dataset['active']).toBe('true');
    handle.toggle();
    expect(query('.vf-fab')?.dataset['active']).toBe('false');
    handle.destroy();
  });

  it('reflects the connection indicator from healthCheck', async () => {
    const handle = createVisualFeedback({
      transport: recordingTransport(),
      healthCheck: () => Promise.resolve(true),
    });
    await vi.waitFor(() => {
      expect(query('.vf-dot')?.dataset['state']).toBe('on');
    });
    handle.destroy();
  });

  it('Send flushes the persisted queue through the transport and clears it', async () => {
    seedQueue('vf-send', 'fix the CTA');
    const transport = recordingTransport();
    const handle = createVisualFeedback({ transport, storageKey: 'vf-send' });
    query('.vf-send')?.click();
    await vi.waitFor(() => {
      expect(transport.sent).toHaveLength(1);
    });
    expect(transport.sent[0]?.items[0]?.comment).toBe('fix the CTA');
    handle.destroy();
  });

  it('surfaces the transport error message on failure (queue kept)', async () => {
    seedQueue('vf-fail', 'fix');
    const handle = createVisualFeedback({
      transport: { send: () => Promise.reject(new Error('endpoint 503')) },
      storageKey: 'vf-fail',
    });
    query('.vf-send')?.click();
    await vi.waitFor(() => {
      expect(query('.vf-status')?.textContent).toContain('endpoint 503');
    });
    handle.destroy();
  });
});
