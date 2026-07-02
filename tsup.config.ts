import { defineConfig } from 'tsup';

/**
 * One build per subpath export. Each build owns its outDir (so `clean` is safe) and mirrors
 * the runtime it targets: core/react are browser code, vite/nuxt/mcp run in Node during dev.
 * Package dependencies are auto-external in tsup; `visual-feedback` self-imports (react + the
 * Nuxt runtime plugin) stay external and resolve through the package's own `exports` at runtime.
 */
export default defineConfig([
  {
    entry: { index: 'src/core/index.ts' },
    outDir: 'dist/core',
    format: ['esm'],
    dts: true,
    clean: true,
    treeshake: true,
    sourcemap: true,
    target: 'es2023',
  },
  {
    entry: { index: 'src/vite/index.ts' },
    outDir: 'dist/vite',
    format: ['esm'],
    dts: true,
    clean: true,
    target: 'node20',
    external: ['vite'],
  },
  {
    entry: {
      module: 'src/nuxt/module.ts',
      types: 'src/nuxt/types.ts',
      'runtime/plugin.client': 'src/nuxt/runtime/plugin.client.ts',
    },
    outDir: 'dist/nuxt',
    format: ['esm'],
    dts: true,
    clean: true,
    target: 'node20',
    // Nuxt virtuals + framework deps stay external — the runtime plugin file is shipped
    // unbundled and resolved by the consumer's Nuxt/Vite at build time.
    external: ['nuxt/app', '#imports', '#app', '@nuxt/schema', 'visual-feedback'],
  },
  {
    entry: { index: 'src/react/index.tsx' },
    outDir: 'dist/react',
    format: ['esm'],
    dts: true,
    clean: true,
    external: ['visual-feedback'],
  },
  {
    entry: { server: 'src/mcp/server.ts', channel: 'src/mcp/channel.ts' },
    outDir: 'dist/mcp',
    format: ['esm'],
    dts: true,
    clean: true,
    target: 'node20',
    sourcemap: true,
  },
]);
