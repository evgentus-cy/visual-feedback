/**
 * visual-feedback/vite — dev-only Vite plugin.
 *
 * Tags every JSX opening element with `data-vf-source="<relativeFile>:<line>:<col>"` during dev,
 * so visual-feedback can map a clicked DOM element back to its source. This is the
 * React/Vite path: React 19 removed the fiber `_debugSource`, so build-time attribute injection
 * is the only robust way to get element → source. `apply: 'serve'` keeps it out of `vite build`.
 */
import path from 'node:path';
import process from 'node:process';
import { transformSync, type NodePath, type PluginObj } from '@babel/core';
import * as t from '@babel/types';
import type { Plugin } from 'vite';

export interface VisualFeedbackSourceOptions {
  /** Attribute to inject. Default `data-vf-source`. */
  attribute?: string;
  /** File extensions to instrument. Default `['.jsx', '.tsx']`. */
  extensions?: string[];
}

const DEFAULT_ATTRIBUTE = 'data-vf-source';
const DEFAULT_EXTENSIONS = ['.jsx', '.tsx'];

function createInjector(relativePath: string, attribute: string): PluginObj {
  return {
    name: 'visual-feedback-inject-source',
    visitor: {
      JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
        const { node } = path;
        if (!node.loc) return;
        const present = node.attributes.some(
          (attr) =>
            attr.type === 'JSXAttribute' &&
            attr.name.type === 'JSXIdentifier' &&
            attr.name.name === attribute,
        );
        if (present) return;
        const location = `${relativePath}:${String(node.loc.start.line)}:${String(node.loc.start.column + 1)}`;
        node.attributes.push(t.jsxAttribute(t.jsxIdentifier(attribute), t.stringLiteral(location)));
      },
    },
  };
}

/** Pure transform — add the source attribute to every JSX opening element. Returns null on no-op. */
export function injectSourceAttributes(
  code: string,
  relativePath: string,
  attribute: string = DEFAULT_ATTRIBUTE,
): string | null {
  const result = transformSync(code, {
    filename: relativePath,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ['jsx', 'typescript'] },
    plugins: [createInjector(relativePath, attribute)],
  });
  return result?.code ?? null;
}

/**
 * Dev-only Vite plugin. Add to your Vite/React app's `plugins` (before the React plugin):
 * `plugins: [visualFeedbackSource(), react()]`.
 */
export function visualFeedbackSource(options: VisualFeedbackSourceOptions = {}): Plugin {
  const attribute = options.attribute ?? DEFAULT_ATTRIBUTE;
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  let root = process.cwd();

  return {
    name: 'visual-feedback-source',
    apply: 'serve',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
    },
    transform(code, id) {
      const file = id.split('?', 1)[0] ?? id;
      if (file.includes('/node_modules/') || !extensions.some((ext) => file.endsWith(ext))) {
        return null;
      }
      const transformed = injectSourceAttributes(code, path.relative(root, file), attribute);
      return transformed === null ? null : { code: transformed, map: null };
    },
  };
}
