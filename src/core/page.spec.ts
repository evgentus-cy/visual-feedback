import { afterEach, describe, expect, it } from 'vitest';
import { defaultPageContext } from './page.ts';

describe('defaultPageContext', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('lang');
    delete document.documentElement.dataset['theme'];
    document.documentElement.classList.remove('dark', 'light');
  });

  it('captures viewport and a numeric dpr', () => {
    const ctx = defaultPageContext();
    expect(ctx?.viewport).toMatch(/^\d+×\d+$/);
    expect(typeof ctx?.dpr).toBe('number');
  });

  it('reads the document language from <html lang>', () => {
    document.documentElement.setAttribute('lang', 'ru');
    expect(defaultPageContext()?.lang).toBe('ru');
  });

  it('omits lang when <html lang> is absent (so the rendered line stays clean)', () => {
    document.documentElement.removeAttribute('lang');
    expect(defaultPageContext()).not.toHaveProperty('lang');
  });

  it('prefers an app theme class on <html> for the color scheme', () => {
    document.documentElement.classList.add('dark');
    expect(defaultPageContext()?.colorScheme).toBe('dark');
  });

  it('reads a data-theme attribute when no theme class is set', () => {
    document.documentElement.dataset['theme'] = 'light';
    expect(defaultPageContext()?.colorScheme).toBe('light');
  });
});
