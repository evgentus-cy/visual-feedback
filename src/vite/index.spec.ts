import { describe, expect, it } from 'vitest';
import { injectSourceAttributes } from './index.ts';

describe('injectSourceAttributes', () => {
  it('tags JSX opening elements with data-vf-source="file:line:col"', () => {
    const out = injectSourceAttributes(
      'const A = () => <div><span>hi</span></div>;',
      'src/App.tsx',
    );
    expect(out).toContain('data-vf-source');
    expect(out).toContain('src/App.tsx:1:');
    // both <div> and <span> get tagged
    expect((out?.match(/data-vf-source/g) ?? []).length).toBe(2);
  });

  it('leaves non-JSX code untagged', () => {
    const out = injectSourceAttributes('export const x = 1;', 'src/x.ts');
    expect(out).not.toContain('data-vf-source');
  });

  it('does not duplicate an existing attribute', () => {
    const out = injectSourceAttributes('const A = <div data-vf-source="x">y</div>;', 'src/A.tsx');
    expect((out?.match(/data-vf-source/g) ?? []).length).toBe(1);
  });
});
