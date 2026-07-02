import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Specs exercise src directly; the `visual-feedback` self-import (react adapter,
    // Nuxt runtime plugin) maps to the core source instead of the built dist.
    alias: {
      'visual-feedback': path.resolve(import.meta.dirname, 'src/core/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
