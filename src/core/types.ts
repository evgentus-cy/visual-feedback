/**
 * Shared types for the framework-agnostic visual-feedback core.
 *
 * The core knows nothing about Vue/Nuxt or how feedback reaches an agent — a host
 * app injects a {@link Transport} and (optionally) a source resolver / screenshot
 * capturer. The default source resolver reads Nuxt DevTools' `data-v-inspector`.
 */

/**
 * Page-level state captured once per batch — the view the user actually saw. Resolves the
 * "can't reproduce" classes: responsive (viewport), retina color (dpr), which-language (lang),
 * and dark-mode-only (colorScheme) bugs. All fields optional; only present ones are rendered.
 */
export interface PageContext {
  /** Viewport size in CSS px, e.g. `1440×900`. */
  viewport?: string | undefined;
  /** `devicePixelRatio` (retina = 2). */
  dpr?: number | undefined;
  /** Document language (`<html lang>`), e.g. `en` / `ru` — the locale the user observed. */
  lang?: string | undefined;
  /** Effective color scheme: `dark` | `light`. */
  colorScheme?: string | undefined;
}

/** A parsed `file:line:column` source location (from a `data-v-inspector` attribute). */
export interface SourceLocation {
  file: string;
  line?: number | undefined;
  column?: number | undefined;
  /** The raw attribute value it was parsed from. */
  raw: string;
}

/** Everything we know about a clicked element, for Claude to locate and fix it. */
export interface ElementContext {
  /** Source-location breadcrumb, leaf-first: clicked element → … → page. */
  breadcrumb: SourceLocation[];
  /** Stable author-provided handle (`data-feedback="…"`), if any. */
  feedbackId?: string | undefined;
  /** Short, reasonably stable CSS selector. */
  selector: string;
  /** Lower-cased tag name. */
  tag: string;
  /** Trimmed, truncated visible text. */
  text?: string | undefined;
  /** Best-guess component name (basename of the breadcrumb leaf file). */
  component?: string | undefined;
}

/** One queued comment tied to one element. */
export interface FeedbackItem {
  id: string;
  comment: string;
  context: ElementContext;
  route: string;
  /** Optional screenshot as a data URL (PNG). The transport/server persists it to disk. */
  screenshot?: string | undefined;
  createdAt: number;
}

/** A batch flushed to the transport on "Send". */
export interface FeedbackBatch {
  route: string;
  /** Ready-to-act markdown checklist (becomes the channel `content`). */
  markdown: string;
  /** Raw items (carry screenshot data URLs so the server can persist them). */
  items: FeedbackItem[];
  /** Page-level context captured once for the batch (viewport/DPR/lang/scheme). */
  page?: PageContext | undefined;
}

/** Where a flushed batch goes. Injected by the host app. */
export interface Transport {
  send(batch: FeedbackBatch): Promise<void>;
}

/** Public options for {@link createVisualFeedback}. */
export interface VisualFeedbackOptions {
  transport: Transport;
  /** Resolve one element's source location. Defaults to reading `data-vf-source`/`data-v-inspector`/`data-inspector-*`. */
  resolveSource?: ((el: Element) => SourceLocation | null) | undefined;
  /** Capture a screenshot of an element as a PNG data URL. Defaults to html2canvas. */
  captureScreenshot?: ((el: Element) => Promise<string | undefined>) | undefined;
  /** Current route string. Defaults to `location.pathname + search + hash` (query/hash decide the view). */
  getRoute?: (() => string) | undefined;
  /** Capture page-level context once per batch. Defaults to reading the window; return undefined to omit. */
  getPageContext?: (() => PageContext | undefined) | undefined;
  /** Toggle hotkey as a `KeyboardEvent.code` with optional `Alt+`/`Ctrl+`/`Shift+`/`Meta+`. Default `Alt+KeyC`. */
  hotkey?: string | undefined;
  /** localStorage key for the persisted queue. Default `visual-feedback:queue`. */
  storageKey?: string | undefined;
  /** Probe whether the agent endpoint is reachable; drives the connection indicator. Omit to hide it. */
  healthCheck?: (() => Promise<boolean>) | undefined;
  /** Generate item ids. Defaults to `crypto.randomUUID` with a `Math.random` fallback. */
  idGenerator?: (() => string) | undefined;
}

/** Options with all defaults applied (internal). */
export interface ResolvedOptions {
  transport: Transport;
  resolveSource: (el: Element) => SourceLocation | null;
  captureScreenshot: (el: Element) => Promise<string | undefined>;
  getRoute: () => string;
  getPageContext: () => PageContext | undefined;
  hotkey: string;
  storageKey: string;
  healthCheck: (() => Promise<boolean>) | undefined;
  idGenerator: () => string;
}

/** Handle returned to the host app. */
export interface OverlayHandle {
  /** Toggle select-mode on/off. */
  toggle(): void;
  /** Tear down the overlay and listeners. */
  destroy(): void;
}
