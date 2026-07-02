/**
 * visual-feedback — framework-agnostic dev-only visual-feedback overlay.
 *
 * A host app calls {@link createVisualFeedback} with a {@link Transport} (where batches go)
 * and, optionally, a source resolver / screenshot capturer. The Nuxt adapter
 * (`@evgentus/visual-feedback/nuxt`) wires the default `data-v-inspector` resolver and a transport
 * that POSTs to the MCP channel server — but the core has no Vue/Nuxt dependency.
 */
import { mountOverlay } from './overlay.ts';
import { defaultPageContext } from './page.ts';
import { newId } from './queue.ts';
import { defaultCaptureScreenshot } from './screenshot.ts';
import { defaultResolveSource } from './serialize.ts';
import type { OverlayHandle, ResolvedOptions, VisualFeedbackOptions } from './types.ts';

/** Default route: full client path (query and hash decide the view the user actually saw). */
export const defaultRoute = (
  loc: Pick<Location, 'pathname' | 'search' | 'hash'> = globalThis.location,
): string => `${loc.pathname}${loc.search}${loc.hash}`;

export function createVisualFeedback(options: VisualFeedbackOptions): OverlayHandle {
  const resolved: ResolvedOptions = {
    transport: options.transport,
    resolveSource: options.resolveSource ?? defaultResolveSource,
    captureScreenshot: options.captureScreenshot ?? defaultCaptureScreenshot,
    getRoute: options.getRoute ?? defaultRoute,
    getPageContext: options.getPageContext ?? defaultPageContext,
    hotkey: options.hotkey ?? 'Alt+KeyC',
    storageKey: options.storageKey ?? 'visual-feedback:queue',
    healthCheck: options.healthCheck,
    idGenerator: options.idGenerator ?? newId,
  };
  return mountOverlay(resolved);
}

export { buildMarkdown } from './queue.ts';
export {
  buildBreadcrumb,
  componentNameFromFile,
  defaultResolveSource,
  parseInspector,
  pickComponentName,
  serializeElement,
} from './serialize.ts';
export { defaultCaptureScreenshot } from './screenshot.ts';
export { defaultPageContext } from './page.ts';
export type {
  ElementContext,
  FeedbackBatch,
  FeedbackItem,
  OverlayHandle,
  PageContext,
  SourceLocation,
  Transport,
  VisualFeedbackOptions,
} from './types.ts';
