/**
 * The framework-agnostic overlay UI, rendered into a shadow DOM:
 *   - select mode (hotkey or FAB) → hover-highlight any element
 *   - click an element → popover to write a comment (+ optional annotated screenshot)
 *   - a batch panel listing queued comments with a Send button
 *   - a connection indicator that pings the agent endpoint (via the injected healthCheck)
 *
 * It knows nothing about how the batch reaches an agent — that's the injected `transport`.
 */
import { buildMarkdown, FeedbackQueue } from './queue.ts';
import { serializeElement } from './serialize.ts';
import { STYLES } from './styles.ts';
import type { ElementContext, OverlayHandle, ResolvedOptions } from './types.ts';

interface Hotkey {
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  code: string;
}

const HEALTH_POLL_MS = 4000;

function parseHotkey(spec: string): Hotkey {
  const parts = spec.split('+').map((p) => p.trim());
  const mods = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()));
  return {
    alt: mods.has('alt'),
    ctrl: mods.has('ctrl') || mods.has('control'),
    shift: mods.has('shift'),
    meta: mods.has('meta') || mods.has('cmd'),
    code: parts.at(-1) ?? 'KeyC',
  };
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const px = (n: number): string => `${String(Math.round(n))}px`;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(n, hi));

/** Largest scale ≤ 1 that fits a `w×h` image inside `maxW×maxH`, preserving aspect ratio. */
export function fitScale(w: number, h: number, maxW: number, maxH: number): number {
  return Math.min(1, maxW / (w || 1), maxH / (h || 1));
}

/** Max on-screen size of the annotator canvas (keeps the popover + its action buttons reachable). */
const CANVAS_MAX_W = 276;
const CANVAS_MAX_H = 220;

/** A compact one-line locator for the panel/popover. */
function locSummary(ctx: ElementContext): string {
  const head = ctx.breadcrumb[0];
  if (head) return head.line === undefined ? head.file : `${head.file}:${String(head.line)}`;
  if (ctx.feedbackId) return `[data-feedback=${ctx.feedbackId}]`;
  return ctx.selector;
}

export function mountOverlay(opts: ResolvedOptions): OverlayHandle {
  const queue = new FeedbackQueue(opts.storageKey);
  const hotkey = parseHotkey(opts.hotkey);
  const screenshotKey = `${opts.storageKey}:shot`;

  let active = false;
  let pendingTarget: Element | null = null;
  let screenshotEnabled = false;
  try {
    screenshotEnabled = globalThis.localStorage.getItem(screenshotKey) === '1';
  } catch {
    // localStorage may be unavailable — default to off.
  }

  // ── shadow host ───────────────────────────────────────────────────────────
  const host = make('div');
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '2147483640';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = make('style');
  style.textContent = STYLES;
  shadow.append(style);

  const highlight = make('div', 'vf-highlight');
  shadow.append(highlight);

  // ── toolbar (panel + FAB) ───────────────────────────────────────────────────
  const toolbar = make('div', 'vf-toolbar');
  const panel = make('div', 'vf-panel');
  const panelTitle = make('p', 'vf-title', 'Feedback batch');
  const list = make('div', 'vf-list');
  const actions = make('div', 'vf-actions');
  const sendBtn = make('button', 'vf-send', 'Send');
  sendBtn.type = 'button';
  sendBtn.setAttribute('aria-label', 'Send feedback batch to Claude');
  const statusEl = make('span', 'vf-status');
  statusEl.setAttribute('aria-live', 'polite');
  actions.append(sendBtn, statusEl);
  panel.append(panelTitle, list, actions);

  const fab = make('button', 'vf-fab');
  fab.type = 'button';
  fab.setAttribute('aria-label', `Toggle visual feedback select mode (${opts.hotkey})`);
  const dot = make('span', 'vf-dot');
  if (!opts.healthCheck) dot.style.display = 'none';
  const fabLabel = make('span', '', 'Feedback');
  const badge = make('span', 'vf-badge', '0');
  fab.append(dot, fabLabel, badge);
  toolbar.append(panel, fab);
  shadow.append(toolbar);

  // ── popover ─────────────────────────────────────────────────────────────────
  const popover = make('div', 'vf-popover');
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', 'Leave UI feedback');
  const popTitle = make('p', 'vf-title', 'Leave a comment');
  const popLoc = make('div', 'vf-loc');
  const form = make('form', 'vf-form');
  const textarea = make('textarea');
  textarea.placeholder = 'What should change here? (Ctrl/⌘+Enter to add)';
  textarea.setAttribute('aria-label', 'Feedback comment');
  const canvas = make('canvas', 'vf-canvas');
  const check = make('label', 'vf-check');
  const checkbox = make('input');
  checkbox.type = 'checkbox';
  checkbox.checked = screenshotEnabled;
  check.append(checkbox, ' Attach screenshot (drag on it to highlight)');
  const popActions = make('div', 'vf-pop-actions');
  const addBtn = make('button', 'vf-add', 'Add to batch');
  addBtn.type = 'submit';
  const cancelBtn = make('button', 'vf-cancel', 'Cancel');
  cancelBtn.type = 'button';
  popActions.append(addBtn, cancelBtn);
  form.append(textarea, canvas, check, popActions);
  popover.append(popTitle, popLoc, form);
  shadow.append(popover);

  // ── screenshot annotator (canvas + one drag-rectangle) ───────────────────────
  let pendingShot: string | undefined;
  let annotatorReady = false;
  let baseImage: HTMLImageElement | null = null;
  let drawing = false;
  let startX = 0;
  let startY = 0;

  function resetAnnotator(): void {
    annotatorReady = false;
    baseImage = null;
    drawing = false;
    pendingShot = undefined;
    canvas.dataset['ready'] = 'false';
  }

  function redraw(toX?: number, toY?: number): void {
    const ctx = canvas.getContext('2d');
    if (!ctx || !baseImage) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
    if (toX !== undefined && toY !== undefined) {
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 3;
      ctx.strokeRect(startX, startY, toX - startX, toY - startY);
    }
  }

  function loadScreenshot(dataUrl: string): void {
    pendingShot = dataUrl;
    const image = new Image();
    image.addEventListener('load', () => {
      // Bound BOTH dimensions: a tall capture (e.g. a full pricing card) must not push the
      // Add/Cancel buttons off-screen. Aspect ratio is preserved.
      const scale = fitScale(image.width || 1, image.height || 1, CANVAS_MAX_W, CANVAS_MAX_H);
      canvas.width = Math.max(1, Math.round((image.width || 1) * scale));
      canvas.height = Math.max(1, Math.round((image.height || 1) * scale));
      baseImage = image;
      annotatorReady = true;
      canvas.dataset['ready'] = 'true';
      redraw();
      clampIntoView();
    });
    image.src = dataUrl;
  }

  const canvasPoint = (e: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / (rect.width || 1);
    const sy = canvas.height / (rect.height || 1);
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (!annotatorReady) return;
    drawing = true;
    const point = canvasPoint(e);
    startX = point.x;
    startY = point.y;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const point = canvasPoint(e);
    redraw(point.x, point.y);
  });
  canvas.addEventListener('pointerup', () => {
    drawing = false;
  });

  function currentScreenshot(): string | undefined {
    if (annotatorReady) return canvas.toDataURL('image/png');
    return pendingShot;
  }

  // ── behaviour ─────────────────────────────────────────────────────────────────
  function hideHighlight(): void {
    highlight.style.display = 'none';
  }

  function showHighlight(el: Element): void {
    const r = el.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.left = px(r.left);
    highlight.style.top = px(r.top);
    highlight.style.width = px(r.width);
    highlight.style.height = px(r.height);
  }

  function closePopover(): void {
    popover.dataset['open'] = 'false';
    pendingTarget = null;
    resetAnnotator();
    fab.focus();
  }

  /** Nudge the popover so it stays fully on-screen — its action buttons must always be reachable. */
  function clampIntoView(): void {
    const maxLeft = Math.max(4, globalThis.innerWidth - popover.offsetWidth - 4);
    const maxTop = Math.max(4, globalThis.innerHeight - popover.offsetHeight - 4);
    popover.style.left = px(clamp(Number.parseFloat(popover.style.left) || 0, 4, maxLeft));
    popover.style.top = px(clamp(Number.parseFloat(popover.style.top) || 0, 4, maxTop));
  }

  function openPopover(target: Element, x: number, y: number): void {
    pendingTarget = target;
    resetAnnotator();
    popLoc.textContent = locSummary(serializeElement(target, opts.resolveSource));
    textarea.value = '';
    popover.dataset['open'] = 'true';
    popover.style.left = px(Math.max(12, Math.min(x, globalThis.innerWidth - 312)));
    popover.style.top = px(Math.max(12, y));
    clampIntoView();
    textarea.focus();
    if (screenshotEnabled) {
      void opts.captureScreenshot(target).then((dataUrl) => {
        if (dataUrl && pendingTarget === target) loadScreenshot(dataUrl);
      });
    }
  }

  function setActive(next: boolean): void {
    active = next;
    fab.dataset['active'] = String(active);
    fabLabel.textContent = active ? 'Selecting…' : 'Feedback';
    if (!active) {
      hideHighlight();
      closePopover();
    }
  }

  function setStatus(kind: string, text: string): void {
    statusEl.dataset['kind'] = kind;
    statusEl.textContent = text;
  }

  function addItem(): void {
    const target = pendingTarget;
    if (!target) return;
    const comment = textarea.value.trim();
    if (!comment) {
      textarea.focus();
      return;
    }
    queue.add({
      id: opts.idGenerator(),
      comment,
      context: serializeElement(target, opts.resolveSource),
      route: opts.getRoute(),
      screenshot: screenshotEnabled ? currentScreenshot() : undefined,
      createdAt: Date.now(),
    });
    closePopover();
  }

  async function send(): Promise<void> {
    const items = queue.list();
    if (items.length === 0) return;
    const route = opts.getRoute();
    const page = opts.getPageContext();
    setStatus('sending', 'Sending…');
    sendBtn.disabled = true;
    try {
      await opts.transport.send({
        route,
        markdown: buildMarkdown(items, route, page),
        items,
        page,
      });
      queue.clear();
      setStatus('sent', `Sent ${String(items.length)} ✓`);
      void pollHealth();
    } catch (error) {
      setStatus('failed', error instanceof Error ? error.message : 'Send failed');
    } finally {
      sendBtn.disabled = false;
    }
  }

  async function pollHealth(): Promise<void> {
    const check = opts.healthCheck;
    if (!check) return;
    let ok = false;
    try {
      ok = await check();
    } catch {
      // unreachable failures keep ok = false
    }
    dot.dataset['state'] = ok ? 'on' : 'off';
    dot.title = ok
      ? 'Claude session connected'
      : 'No Claude session — start it with VISUAL_FEEDBACK_CHANNEL=1';
  }

  function render(): void {
    const items = queue.list();
    const count = items.length;
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline-block' : 'none';
    sendBtn.textContent = count > 0 ? `Send ${String(count)}` : 'Send';
    sendBtn.disabled = count === 0;
    panel.dataset['open'] = count > 0 ? 'true' : 'false';
    list.replaceChildren();
    for (const item of items) {
      const row = make('div', 'vf-row');
      const body = make('p', '', item.comment);
      body.append(make('small', '', locSummary(item.context)));
      const del = make('button', 'vf-del', '✕');
      del.type = 'button';
      del.setAttribute('aria-label', 'Remove this comment');
      del.addEventListener('click', () => {
        queue.remove(item.id);
      });
      row.append(body, del);
      list.append(row);
    }
  }

  // ── document-level listeners ────────────────────────────────────────────────
  const onPointerMove = (e: PointerEvent): void => {
    if (!active) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host) {
      hideHighlight();
      return;
    }
    showHighlight(el);
  };

  const onClick = (e: MouseEvent): void => {
    if (!active) return;
    const target = e.target;
    // Clicks on our own shadow UI retarget to `host` — let those through to our controls.
    if (!(target instanceof Element) || target === host) return;
    e.preventDefault();
    e.stopPropagation();
    openPopover(target, e.clientX, e.clientY);
  };

  const onKeydown = (e: KeyboardEvent): void => {
    const isToggle =
      e.code === hotkey.code &&
      e.altKey === hotkey.alt &&
      e.ctrlKey === hotkey.ctrl &&
      e.shiftKey === hotkey.shift &&
      e.metaKey === hotkey.meta;
    if (isToggle) {
      e.preventDefault();
      setActive(!active);
    } else if (e.code === 'Escape') {
      if (popover.dataset['open'] === 'true') closePopover();
      else if (active) setActive(false);
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    addItem();
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      addItem();
    }
  });
  fab.addEventListener('click', () => {
    setActive(!active);
  });
  sendBtn.addEventListener('click', () => {
    void send();
  });
  cancelBtn.addEventListener('click', () => {
    closePopover();
  });

  // Drag the popover by its title bar, so it never has to sit on top of the element being commented on.
  popTitle.setAttribute('title', 'Drag to move');
  let dragging = false;
  let dragDX = 0;
  let dragDY = 0;
  popTitle.addEventListener('pointerdown', (e) => {
    dragging = true;
    const rect = popover.getBoundingClientRect();
    dragDX = e.clientX - rect.left;
    dragDY = e.clientY - rect.top;
    popTitle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  popTitle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const maxLeft = Math.max(4, globalThis.innerWidth - popover.offsetWidth - 4);
    const maxTop = Math.max(4, globalThis.innerHeight - popover.offsetHeight - 4);
    popover.style.left = px(clamp(e.clientX - dragDX, 4, maxLeft));
    popover.style.top = px(clamp(e.clientY - dragDY, 4, maxTop));
  });
  const endDrag = (e: PointerEvent): void => {
    dragging = false;
    if (popTitle.hasPointerCapture(e.pointerId)) popTitle.releasePointerCapture(e.pointerId);
  };
  popTitle.addEventListener('pointerup', endDrag);
  popTitle.addEventListener('pointercancel', endDrag);

  checkbox.addEventListener('change', () => {
    screenshotEnabled = checkbox.checked;
    try {
      globalThis.localStorage.setItem(screenshotKey, screenshotEnabled ? '1' : '0');
    } catch {
      // Persisting the toggle is best-effort.
    }
  });

  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeydown, true);
  const unsubscribe = queue.subscribe(render);
  document.body.append(host);
  render();

  const healthTimer = opts.healthCheck
    ? globalThis.setInterval(() => void pollHealth(), HEALTH_POLL_MS)
    : undefined;
  void pollHealth();

  return {
    toggle(): void {
      setActive(!active);
    },
    destroy(): void {
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeydown, true);
      if (healthTimer !== undefined) globalThis.clearInterval(healthTimer);
      unsubscribe();
      host.remove();
    },
  };
}
