import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMarkdown, FeedbackQueue, newId } from './queue.ts';
import type { FeedbackItem } from './types.ts';

function makeItem(over: Partial<FeedbackItem> = {}): FeedbackItem {
  return {
    id: over.id ?? newId(),
    comment: over.comment ?? 'make it bigger',
    route: over.route ?? '/pricing',
    createdAt: over.createdAt ?? 0,
    context: over.context ?? {
      breadcrumb: [
        {
          file: 'components/AppButton.vue',
          line: 8,
          column: 3,
          raw: 'components/AppButton.vue:8:3',
        },
      ],
      feedbackId: 'home-hero',
      selector: 'button.cta',
      tag: 'button',
      text: 'Get started',
      component: 'AppButton',
    },
    screenshot: over.screenshot,
  };
}

describe('FeedbackQueue', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
  });

  it('adds, lists, counts and removes', () => {
    const q = new FeedbackQueue('vf-test');
    const a = makeItem({ id: 'a' });
    const b = makeItem({ id: 'b' });
    q.add(a);
    q.add(b);
    expect(q.count).toBe(2);
    expect(q.list().map((i) => i.id)).toEqual(['a', 'b']);
    q.remove('a');
    expect(q.list().map((i) => i.id)).toEqual(['b']);
    q.clear();
    expect(q.count).toBe(0);
  });

  it('updates an item in place', () => {
    const q = new FeedbackQueue('vf-test');
    q.add(makeItem({ id: 'a', comment: 'old' }));
    q.update('a', { comment: 'new' });
    expect(q.list()[0]!.comment).toBe('new');
  });

  it('persists to localStorage and reloads in a fresh instance', () => {
    const q1 = new FeedbackQueue('vf-persist');
    q1.add(makeItem({ id: 'a' }));
    const q2 = new FeedbackQueue('vf-persist');
    expect(q2.count).toBe(1);
    expect(q2.list()[0]!.id).toBe('a');
  });

  it('notifies subscribers on change and unsubscribes', () => {
    const q = new FeedbackQueue('vf-test');
    const fn = vi.fn();
    const off = q.subscribe(fn);
    q.add(makeItem());
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    q.add(makeItem());
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('survives corrupt storage', () => {
    globalThis.localStorage?.setItem('vf-bad', '{not json');
    const q = new FeedbackQueue('vf-bad');
    expect(q.count).toBe(0);
  });
});

describe('buildMarkdown', () => {
  it('renders a header and a numbered item with locators', () => {
    const md = buildMarkdown(
      [makeItem({ id: 'a', comment: 'Increase the hero CTA size' })],
      '/pricing',
    );
    expect(md).toContain('# UI feedback batch (1) — route: /pricing');
    expect(md).toContain('## 1. Increase the hero CTA size');
    expect(md).toContain('components/AppButton.vue:8');
    expect(md).toContain('component: AppButton');
    expect(md).toContain('data-feedback: home-hero');
    expect(md).toContain('selector: `button.cta`');
    expect(md).toContain('text: "Get started"');
  });

  it('emits a per-item screenshot filename token (so the server can map it inline)', () => {
    const md = buildMarkdown(
      [makeItem({ id: 'shot-1', screenshot: 'data:image/png;base64,AAAA' })],
      '/',
    );
    expect(md).toContain('- screenshot: shot-1.png');
  });

  it('renders a page-context line when page state is provided', () => {
    const md = buildMarkdown([makeItem()], '/pricing', {
      viewport: '1440×900',
      dpr: 2,
      lang: 'ru',
      colorScheme: 'dark',
    });
    expect(md).toContain('Context: viewport 1440×900 · dpr 2 · lang ru · scheme dark');
  });

  it('omits the context line when no page state is captured', () => {
    expect(buildMarkdown([makeItem()], '/')).not.toContain('Context:');
    expect(buildMarkdown([makeItem()], '/', {})).not.toContain('Context:');
  });

  it('carries the standing-rule hints in the preamble (any language + data-feedback + usage site)', () => {
    const md = buildMarkdown([makeItem()], '/');
    expect(md).toContain('any language');
    expect(md).toContain('data-feedback');
    expect(md).toContain('usage site');
  });
});

describe('newId', () => {
  it('produces unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });
});
