/**
 * The batch queue: in-memory list of feedback items mirrored to localStorage so an
 * HMR/reload — or a "no Claude session yet" Send failure — never loses what you typed.
 * After a successful Send the queue is cleared.
 */
import type { FeedbackItem, PageContext } from './types.ts';

const DEFAULT_KEY = 'visual-feedback:queue';
const SCHEMA_VERSION = 1;

interface PersistedQueue {
  version: number;
  items: FeedbackItem[];
}

/** Read persisted state across versions: v0 was a bare array; v1 is `{ version, items }`. */
function migrate(parsed: unknown): FeedbackItem[] {
  const stored: unknown = Array.isArray(parsed)
    ? parsed
    : (parsed as { items?: unknown } | null)?.items;
  // Persisted queue items are untyped JSON — trust the stored shape (best-effort load).
  return Array.isArray(stored) ? (stored as FeedbackItem[]) : [];
}

export class FeedbackQueue {
  private items: FeedbackItem[] = [];
  private readonly storageKey: string;
  private readonly listeners = new Set<() => void>();

  constructor(storageKey: string = DEFAULT_KEY) {
    this.storageKey = storageKey;
    this.load();
  }

  private load(): void {
    try {
      // localStorage is typed as always-present (lib DOM); the try/catch covers SSR /
      // private-mode where it actually throws.
      const raw = globalThis.localStorage.getItem(this.storageKey);
      this.items = migrate(raw ? (JSON.parse(raw) as unknown) : null);
    } catch {
      this.items = [];
    }
  }

  private persist(): void {
    try {
      const payload: PersistedQueue = { version: SCHEMA_VERSION, items: this.items };
      globalThis.localStorage.setItem(this.storageKey, JSON.stringify(payload));
    } catch {
      // Storage may be unavailable (private mode / quota) — keep working in-memory.
    }
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** Subscribe to queue changes (for UI re-render). Returns an unsubscribe fn. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  list(): FeedbackItem[] {
    return [...this.items];
  }

  get count(): number {
    return this.items.length;
  }

  add(item: FeedbackItem): void {
    this.items.push(item);
    this.persist();
  }

  update(id: string, patch: Partial<Omit<FeedbackItem, 'id'>>): void {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      Object.assign(item, patch);
      this.persist();
    }
  }

  remove(id: string): void {
    this.items = this.items.filter((i) => i.id !== id);
    this.persist();
  }

  clear(): void {
    this.items = [];
    this.persist();
  }
}

/** One-line summary of the captured {@link PageContext}, or undefined if nothing was captured. */
function contextLine(page: PageContext | undefined): string | undefined {
  if (!page) return undefined;
  const bits: string[] = [];
  if (page.viewport) bits.push(`viewport ${page.viewport}`);
  if (page.dpr) bits.push(`dpr ${String(page.dpr)}`);
  if (page.lang) bits.push(`lang ${page.lang}`);
  if (page.colorScheme) bits.push(`scheme ${page.colorScheme}`);
  return bits.length > 0 ? `Context: ${bits.join(' · ')}` : undefined;
}

/** Render a batch of items into an actionable markdown checklist (the channel `content`). */
export function buildMarkdown(items: FeedbackItem[], route: string, page?: PageContext): string {
  const lines: string[] = [
    `# UI feedback batch (${String(items.length)}) — route: ${route || '/'}`,
    '',
    'Each item below is a UI fix request. Locators are best-effort — confirm the target by',
    'component name + visible text before editing (line numbers may have shifted). Prefer a',
    '`data-feedback` anchor over line numbers. For shared UI-kit components, fix at the **usage site**',
    '(props), not the shared component. Comments may be written in any language — act on them directly, do not',
    'translate-and-ask. If an item is ambiguous, ask one question instead of guessing. If a',
    'screenshot is attached, read it for visual context. Work through the items and report changes.',
    '',
  ];

  const context = contextLine(page);
  if (context) lines.push(context, '');

  for (const [index, item] of items.entries()) {
    const ctx = item.context;
    lines.push(`## ${String(index + 1)}. ${item.comment || '(no comment)'}`);
    if (ctx.breadcrumb.length > 0) {
      const trail = ctx.breadcrumb
        .map((b) => (b.line ? `${b.file}:${String(b.line)}` : b.file))
        .join('  ◂  ');
      lines.push(`- source: ${trail}`);
    }
    if (ctx.component) lines.push(`- component: ${ctx.component}`);
    if (ctx.feedbackId) lines.push(`- data-feedback: ${ctx.feedbackId}`);
    lines.push(`- selector: \`${ctx.selector}\``);
    if (ctx.text) lines.push(`- text: "${ctx.text}"`);
    lines.push(`- route: ${item.route || route || '/'}`);
    // Filename token (server writes `<id>.png`); the MCP server rewrites it to the absolute path
    // so each item points at its own screenshot inline.
    if (item.screenshot) lines.push(`- screenshot: ${item.id}.png`);
    lines.push('');
  }

  return lines.join('\n');
}

/** Default id generator: `crypto.randomUUID` when available (secure contexts), else a random fallback. */
export function newId(): string {
  const cryptoObj = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof cryptoObj?.randomUUID === 'function') return cryptoObj.randomUUID();
  return `vf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
