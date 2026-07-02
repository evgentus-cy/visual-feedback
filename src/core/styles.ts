/**
 * Styles for the overlay, injected into the shadow root so they can't leak into — or be
 * clobbered by — the host app's Tailwind / UI kit. Plain hex is fine here: this is a
 * standalone dev tool in a shadow DOM, not app UI bound to the design-token system.
 */
export const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }

.vf-highlight {
  position: fixed; z-index: 2147483640; pointer-events: none; display: none;
  border: 2px solid #2dd4bf; background: rgba(45, 212, 191, 0.12); border-radius: 3px;
}

.vf-toolbar {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
  display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none;
}
.vf-toolbar > * { pointer-events: auto; }

.vf-fab {
  display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; border: 0;
  border-radius: 999px; background: #0f172a; color: #e2e8f0; font-size: 13px; font-weight: 600;
  cursor: pointer; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
}
.vf-fab[data-active="true"] { background: #0d9488; color: #fff; }
.vf-badge { background: #f43f5e; color: #fff; border-radius: 999px; padding: 1px 7px; font-size: 11px; }

.vf-panel {
  width: 320px; max-height: 50vh; overflow: auto; display: none; padding: 12px;
  background: #0f172a; color: #e2e8f0; border-radius: 12px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
}
.vf-panel[data-open="true"] { display: block; }
.vf-title { margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em; }
.vf-row { display: flex; gap: 8px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #1e293b; }
.vf-row p { flex: 1; margin: 0; font-size: 13px; }
.vf-row small { display: block; margin-top: 2px; font-size: 11px; color: #5eead4; word-break: break-all; }
.vf-del { border: 0; background: transparent; color: #94a3b8; cursor: pointer; font-size: 14px; }
.vf-del:hover { color: #f43f5e; }
.vf-actions { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
.vf-send { flex: 1; padding: 8px; border: 0; border-radius: 8px; background: #0d9488; color: #fff; font-weight: 600; cursor: pointer; }
.vf-send:disabled { opacity: 0.5; cursor: default; }
.vf-status { font-size: 12px; color: #94a3b8; }
.vf-status[data-kind="failed"] { color: #fca5a5; }
.vf-status[data-kind="sent"] { color: #5eead4; }

.vf-popover {
  position: fixed; z-index: 2147483647; width: 300px; max-height: 88vh; overflow-y: auto;
  display: none; padding: 12px; pointer-events: auto;
  background: #0f172a; color: #e2e8f0; border-radius: 12px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}
.vf-popover[data-open="true"] { display: block; }
/* The popover title doubles as a drag handle (scoped so the panel title is unaffected). */
.vf-popover .vf-title { cursor: move; user-select: none; touch-action: none; }
.vf-popover .vf-title::before { content: "⠿  "; color: #475569; }
.vf-loc { margin: 6px 0; font-size: 11px; color: #5eead4; word-break: break-all; }
.vf-popover textarea {
  width: 100%; min-height: 70px; resize: vertical; padding: 8px; font-size: 13px;
  border: 1px solid #334155; border-radius: 8px; background: #020617; color: #e2e8f0;
}
.vf-check { display: flex; align-items: center; gap: 6px; margin: 8px 0; font-size: 12px; color: #cbd5e1; }
.vf-pop-actions { display: flex; gap: 8px; }
.vf-add { flex: 1; padding: 7px; border: 0; border-radius: 8px; background: #0d9488; color: #fff; font-weight: 600; cursor: pointer; }
.vf-cancel { padding: 7px 10px; border: 1px solid #334155; border-radius: 8px; background: transparent; color: #cbd5e1; cursor: pointer; }
.vf-form { display: contents; }

.vf-dot { width: 8px; height: 8px; border-radius: 999px; background: #64748b; flex: none; }
.vf-dot[data-state="on"] { background: #22c55e; }
.vf-dot[data-state="off"] { background: #ef4444; }

.vf-canvas {
  display: none; max-width: 100%; margin: 8px 0; cursor: crosshair; touch-action: none;
  border: 1px solid #334155; border-radius: 6px;
}
.vf-canvas[data-ready="true"] { display: block; }
`;
