/**
 * Capture page-level state the user saw, once per batch. This is a browser-only read (the
 * overlay is client-only), guarded so SSR / non-DOM hosts get `undefined` instead of a throw.
 * The locale comes from `<html lang>`, which an i18n framework (e.g. Nuxt i18n) keeps current —
 * so we read the real active locale without coupling the core to any framework.
 */
import type { PageContext } from './types.ts';

/** Effective color scheme: an app theme class/attr on <html> wins over the OS preference. */
function detectColorScheme(root: HTMLElement): string | undefined {
  if (root.classList.contains('dark')) return 'dark';
  if (root.classList.contains('light')) return 'light';
  const attr = root.dataset['theme'];
  if (attr === 'dark' || attr === 'light') return attr;
  // matchMedia is in lib.dom but absent in some non-browser DOMs — treat as optional.
  const mq = globalThis.matchMedia as ((query: string) => { matches: boolean }) | undefined;
  if (typeof mq === 'function')
    return mq('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return undefined;
}

/** Default {@link PageContext} resolver: viewport, DPR, `<html lang>`, color scheme. */
export function defaultPageContext(): PageContext | undefined {
  try {
    const root = globalThis.document.documentElement;
    const ctx: PageContext = {
      viewport: `${String(globalThis.innerWidth)}×${String(globalThis.innerHeight)}`,
      dpr: Math.round(globalThis.devicePixelRatio * 100) / 100,
    };
    const lang = root.getAttribute('lang')?.trim();
    if (lang) ctx.lang = lang;
    const scheme = detectColorScheme(root);
    if (scheme) ctx.colorScheme = scheme;
    return ctx;
  } catch {
    // SSR / no DOM — omit the context line rather than break the batch.
    return undefined;
  }
}
