/**
 * Turn a clicked DOM element into the richest, most self-healing locator we can,
 * so Claude can find the right source even if line numbers have since shifted.
 *
 * The hard part (DOM element → file:line:column) is free on Nuxt: Nuxt DevTools
 * injects `data-v-inspector="components/Foo.vue:29:3"` on elements in dev. We walk the
 * ancestor chain to build a breadcrumb (leaf element → component usage → page), which
 * is what lets Claude fix the *usage site* of a shared UI-kit component rather than the
 * shared component itself.
 */
import type { ElementContext, SourceLocation } from './types.ts';

/** Parse `path:line:column` (or `path:line`, or bare `path`) into a {@link SourceLocation}. */
export function parseInspector(raw: string | null | undefined): SourceLocation | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  const withColRow = /^(.*?):(\d+):(\d+)$/.exec(value);
  if (withColRow) {
    const [, file, line, column] = withColRow;
    return {
      file: file ?? value,
      line: Number(line ?? '0'),
      column: Number(column ?? '0'),
      raw: value,
    };
  }
  const withRow = /^(.*?):(\d+)$/.exec(value);
  if (withRow) {
    const [, file, line] = withRow;
    return { file: file ?? value, line: Number(line ?? '0'), raw: value };
  }
  return { file: value, raw: value };
}

// getAttribute (not el.dataset) so the resolver works on any Element, including SVG. The
// dynamic attribute name means the unicorn dataset rule doesn't apply here.
const readAttr = (el: Element, name: string): string | null => el.getAttribute(name);

/**
 * Default resolver — interoperates with the common dev source-attribute conventions, in
 * precedence so it works out of the box AND picks up an inspector the host app already uses:
 *   1. `data-vf-source`   — our visual-feedback/vite plugin ("file:line:col")
 *   2. `data-v-inspector` — Nuxt DevTools / vite-plugin-vue-inspector ("file:line:col")
 *   3. `data-inspector-relative-path` (+ `-line`/`-column`) — react-dev-inspector / Locator
 * Returns null if none are present (e.g. a production build with no inspector).
 */
export function defaultResolveSource(el: Element): SourceLocation | null {
  const single = readAttr(el, 'data-vf-source') ?? readAttr(el, 'data-v-inspector');
  if (single) return parseInspector(single);

  const path = readAttr(el, 'data-inspector-relative-path');
  if (path) {
    const lineRaw = readAttr(el, 'data-inspector-line');
    const columnRaw = readAttr(el, 'data-inspector-column');
    return {
      file: path,
      line: lineRaw ? Number(lineRaw) : undefined,
      column: columnRaw ? Number(columnRaw) : undefined,
      raw: `${path}:${lineRaw ?? ''}:${columnRaw ?? ''}`,
    };
  }
  return null;
}

/** Basename without a component-ish extension, e.g. `a/b/AppButton.vue` → `AppButton`. */
export function componentNameFromFile(file: string): string | undefined {
  const base = file.split(/[\\/]/).pop();
  if (!base) return undefined;
  const name = base.replace(/\.(vue|tsx?|jsx?)$/i, '');
  return name || undefined;
}

/** A file that looks like a reusable component (PascalCase basename, or under `components/` / a UI-kit pkg). */
function isComponentish(file: string): boolean {
  const name = (file.split(/[\\/]/).pop() ?? '').replace(/\.(vue|tsx?|jsx?)$/i, '');
  return (
    /^[A-Z]/.test(name) || /[\\/]components[\\/]/.test(file) || /packages[\\/]ui[\\/]/.test(file)
  );
}

/**
 * Name the most component-like crumb so we surface `AppButton`, not a page/layout basename
 * (`index`/`default`). Falls back to the leaf crumb — so this only ever improves the guess.
 */
export function pickComponentName(breadcrumb: SourceLocation[]): string | undefined {
  const chosen = breadcrumb.find((b) => isComponentish(b.file)) ?? breadcrumb[0];
  return chosen ? componentNameFromFile(chosen.file) : undefined;
}

/**
 * Walk `el` and its ancestors, collecting source locations leaf-first. Consecutive
 * duplicates (same file:line) are collapsed so a deeply-nested element doesn't repeat
 * the same component. Capped at `max` to keep the payload light.
 */
export function buildBreadcrumb(
  el: Element,
  resolve: (el: Element) => SourceLocation | null,
  max = 6,
): SourceLocation[] {
  const out: SourceLocation[] = [];
  let cur: Element | null = el;
  let lastKey = '';
  while (cur && out.length < max) {
    const loc = resolve(cur);
    if (loc) {
      const key = `${loc.file}:${loc.line === undefined ? '' : String(loc.line)}`;
      if (key !== lastKey) {
        out.push(loc);
        lastKey = key;
      }
    }
    cur = cur.parentElement;
  }
  return out;
}

/** Trimmed, whitespace-collapsed, truncated visible text. */
export function visibleText(el: Element, max = 120): string | undefined {
  const text = (el.textContent || '').replaceAll(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeClass(value: string): string {
  // Escape characters not valid in a CSS identifier (e.g. Tailwind's `:` and `/`).
  return value.replaceAll(/[^\w-]/g, String.raw`\$&`);
}

/** A short, reasonably stable CSS selector (id wins; else tag.class:nth-of-type, ≤4 levels). */
export function shortSelector(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 4) {
    const node: Element = cur;
    let sel = node.tagName.toLowerCase();
    if (node.id) {
      sel += `#${escapeClass(node.id)}`;
      parts.unshift(sel);
      break;
    }
    const firstClass = (node.getAttribute('class') ?? '').trim().split(/\s+/).find(Boolean);
    if (firstClass) sel += `.${escapeClass(firstClass)}`;
    const parent: Element | null = node.parentElement;
    if (parent) {
      const sameTag = [...parent.children].filter((c) => c.tagName === node.tagName);
      if (sameTag.length > 1) sel += `:nth-of-type(${String(sameTag.indexOf(node) + 1)})`;
    }
    parts.unshift(sel);
    cur = parent;
    depth += 1;
  }
  return parts.join(' > ');
}

/** Build the full {@link ElementContext} for a clicked element. */
export function serializeElement(
  el: Element,
  resolve: (el: Element) => SourceLocation | null = defaultResolveSource,
): ElementContext {
  const breadcrumb = buildBreadcrumb(el, resolve);
  const feedbackEl = el.closest('[data-feedback]');
  // getAttribute (not dataset) — closest() returns Element, which has no dataset.
  // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- Element has no dataset; SVG-safe.
  const feedbackId = feedbackEl?.getAttribute('data-feedback') ?? undefined;
  const component = pickComponentName(breadcrumb);
  return {
    breadcrumb,
    feedbackId,
    selector: shortSelector(el),
    tag: el.tagName.toLowerCase(),
    text: visibleText(el),
    component,
  };
}
