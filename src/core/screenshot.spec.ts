import { describe, expect, it } from 'vitest';
import { defaultCaptureScreenshot } from './screenshot.ts';

describe('defaultCaptureScreenshot', () => {
  it('returns undefined for a non-HTMLElement (e.g. SVG)', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(await defaultCaptureScreenshot(svg)).toBeUndefined();
  });

  it('never throws for an HTMLElement — resolves to a data URL or undefined', async () => {
    const result = await defaultCaptureScreenshot(document.createElement('div'));
    expect(result === undefined || typeof result === 'string').toBe(true);
  });
});
