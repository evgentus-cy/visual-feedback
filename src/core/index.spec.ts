import { describe, expect, it } from 'vitest';
import { defaultRoute } from './index.ts';

describe('defaultRoute', () => {
  it('includes pathname, query and hash (the params/anchor identify the view)', () => {
    expect(defaultRoute({ pathname: '/ru/pricing', search: '?tab=pro', hash: '#faq' })).toBe(
      '/ru/pricing?tab=pro#faq',
    );
  });

  it('is just the pathname when there is no query or hash', () => {
    expect(defaultRoute({ pathname: '/pricing', search: '', hash: '' })).toBe('/pricing');
  });
});
