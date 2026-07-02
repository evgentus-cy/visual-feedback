import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildBreadcrumb,
  componentNameFromFile,
  defaultResolveSource,
  parseInspector,
  pickComponentName,
  serializeElement,
  shortSelector,
  visibleText,
} from './serialize.ts';

describe('parseInspector', () => {
  it('parses file:line:column', () => {
    expect(parseInspector('components/Foo.vue:29:3')).toEqual({
      file: 'components/Foo.vue',
      line: 29,
      column: 3,
      raw: 'components/Foo.vue:29:3',
    });
  });

  it('parses an absolute path with file:line:column', () => {
    expect(parseInspector('/abs/app/pages/index.vue:1:1')).toMatchObject({
      file: '/abs/app/pages/index.vue',
      line: 1,
      column: 1,
    });
  });

  it('parses file:line without a column', () => {
    expect(parseInspector('a/b.vue:7')).toMatchObject({ file: 'a/b.vue', line: 7 });
  });

  it('falls back to a bare path', () => {
    expect(parseInspector('a/b.vue')).toEqual({ file: 'a/b.vue', raw: 'a/b.vue' });
  });

  it('returns null for empty / nullish', () => {
    expect(parseInspector(null)).toBeNull();
    expect(parseInspector(undefined)).toBeNull();
    expect(parseInspector('   ')).toBeNull();
  });
});

describe('componentNameFromFile', () => {
  it('strips path and extension', () => {
    expect(componentNameFromFile('app/components/AppButton.vue')).toBe('AppButton');
    expect(componentNameFromFile('a/b/Card.tsx')).toBe('Card');
    expect(componentNameFromFile('Widget.jsx')).toBe('Widget');
  });
});

describe('pickComponentName', () => {
  it('prefers a component-like crumb over a page/layout leaf', () => {
    expect(
      pickComponentName([
        { file: 'app/pages/index.vue', line: 12, raw: 'app/pages/index.vue:12' },
        {
          file: 'packages/ui/src/components/AppButton/AppButton.vue',
          line: 8,
          raw: 'packages/ui/src/components/AppButton/AppButton.vue:8',
        },
      ]),
    ).toBe('AppButton');
  });

  it('picks a PascalCase basename even without a components/ path', () => {
    expect(pickComponentName([{ file: 'app/layouts/MarketingShell.vue', line: 3, raw: '' }])).toBe(
      'MarketingShell',
    );
  });

  it('falls back to the leaf basename when nothing is component-like', () => {
    expect(pickComponentName([{ file: 'app/pages/index.vue', line: 1, raw: '' }])).toBe('index');
  });

  it('returns undefined for an empty breadcrumb', () => {
    expect(pickComponentName([])).toBeUndefined();
  });
});

describe('visibleText', () => {
  it('collapses whitespace and trims', () => {
    const el = document.createElement('div');
    el.textContent = '  hello   world\n ';
    expect(visibleText(el)).toBe('hello world');
  });

  it('truncates long text with an ellipsis', () => {
    const el = document.createElement('div');
    el.textContent = 'x'.repeat(200);
    const out = visibleText(el, 10);
    expect(out).toHaveLength(10);
    expect(out?.endsWith('…')).toBe(true);
  });

  it('returns undefined for empty', () => {
    expect(visibleText(document.createElement('div'))).toBeUndefined();
  });
});

describe('buildBreadcrumb', () => {
  it('walks ancestors leaf-first and collapses consecutive duplicates', () => {
    document.body.innerHTML = `
      <main data-v-inspector="pages/index.vue:1:1">
        <section data-v-inspector="pages/index.vue:10:3">
          <span data-v-inspector="pages/index.vue:10:3">
            <button data-v-inspector="components/AppButton.vue:5:3">Go</button>
          </span>
        </section>
      </main>`;
    const button = document.querySelector('button')!;
    const trail = buildBreadcrumb(button, defaultResolveSource);
    expect(trail.map((b) => `${b.file}:${b.line}`)).toEqual([
      'components/AppButton.vue:5',
      'pages/index.vue:10', // span + section share 10:3 → collapsed once
      'pages/index.vue:1',
    ]);
  });

  it('respects the max cap', () => {
    document.body.innerHTML = `
      <div data-v-inspector="a.vue:1:1"><div data-v-inspector="b.vue:2:1">
      <div data-v-inspector="c.vue:3:1"><i data-v-inspector="d.vue:4:1"></i></div></div></div>`;
    const leaf = document.querySelector('i')!;
    expect(buildBreadcrumb(leaf, defaultResolveSource, 2)).toHaveLength(2);
  });
});

describe('shortSelector', () => {
  it('prefers an id and stops there', () => {
    document.body.innerHTML = `<div id="hero"><button class="cta">x</button></div>`;
    const btn = document.querySelector('button')!;
    expect(shortSelector(btn)).toContain('#hero');
    expect(shortSelector(btn).startsWith('div#hero')).toBe(true);
  });

  it('uses tag + first class + nth-of-type among same-tag siblings', () => {
    document.body.innerHTML = `<ul><li class="row">a</li><li class="row">b</li></ul>`;
    const second = document.querySelectorAll('li')[1]!;
    const sel = shortSelector(second);
    expect(sel).toContain('li.row:nth-of-type(2)');
  });
});

describe('serializeElement', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main data-v-inspector="app/pages/index.vue:1:1">
        <section data-feedback="home-hero" data-v-inspector="app/pages/index.vue:12:3">
          <button data-v-inspector="packages/ui/src/components/AppButton/AppButton.vue:8:3">Get started</button>
        </section>
      </main>`;
  });

  it('captures breadcrumb, feedbackId, component, selector, tag and text', () => {
    const button = document.querySelector('button')!;
    const ctx = serializeElement(button);
    expect(ctx.tag).toBe('button');
    expect(ctx.text).toBe('Get started');
    expect(ctx.feedbackId).toBe('home-hero');
    expect(ctx.component).toBe('AppButton');
    expect(ctx.breadcrumb[0]).toMatchObject({
      file: expect.stringContaining('AppButton.vue'),
      line: 8,
    });
    expect(ctx.selector).toContain('button');
  });

  it('omits feedbackId when no ancestor is marked', () => {
    document.body.innerHTML = `<div data-v-inspector="a.vue:1:1"><p>hi</p></div>`;
    const ctx = serializeElement(document.querySelector('p')!);
    expect(ctx.feedbackId).toBeUndefined();
  });
});

describe('defaultResolveSource interop', () => {
  it('prefers data-vf-source (our Vite plugin)', () => {
    const el = document.createElement('div');
    el.dataset['vfSource'] = 'src/App.tsx:10:4';
    el.dataset['vInspector'] = 'other.vue:1:1';
    expect(defaultResolveSource(el)).toMatchObject({ file: 'src/App.tsx', line: 10, column: 4 });
  });

  it('falls back to data-v-inspector (Nuxt DevTools)', () => {
    const el = document.createElement('div');
    el.dataset['vInspector'] = 'pages/index.vue:7:2';
    expect(defaultResolveSource(el)).toMatchObject({ file: 'pages/index.vue', line: 7 });
  });

  it('reads react-dev-inspector split attributes', () => {
    const el = document.createElement('div');
    el.dataset['inspectorRelativePath'] = 'src/Button.jsx';
    el.dataset['inspectorLine'] = '12';
    el.dataset['inspectorColumn'] = '3';
    expect(defaultResolveSource(el)).toMatchObject({ file: 'src/Button.jsx', line: 12, column: 3 });
  });

  it('returns null when no inspector attributes are present', () => {
    expect(defaultResolveSource(document.createElement('div'))).toBeNull();
  });
});
