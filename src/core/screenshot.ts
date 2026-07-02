/**
 * Default screenshot capturer — only loaded (dynamically) when the user ticks the
 * "attach screenshot" box, so html2canvas never enters the bundle otherwise. The host
 * app may inject its own capturer via `captureScreenshot`.
 */
export async function defaultCaptureScreenshot(el: Element): Promise<string | undefined> {
  if (!(el instanceof HTMLElement)) return undefined;
  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(el, {
      logging: false,
      backgroundColor: null,
      scale: globalThis.devicePixelRatio,
    });
    return canvas.toDataURL('image/png');
  } catch {
    // Capture is best-effort: a failure (tainted canvas, cross-origin image) must never
    // block adding the comment — we just send the batch without a screenshot.
    return undefined;
  }
}
