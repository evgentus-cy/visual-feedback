/**
 * Dev-only client plugin: mounts the framework-agnostic overlay and wires its transport
 * to the local MCP channel server. Registered by the module only when `nuxt.options.dev`
 * is true (see module.ts), so it never enters a production build.
 */
import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { createVisualFeedback } from '@evgentus/visual-feedback';

export default defineNuxtPlugin(() => {
  // Bracket access: this runtime file is built in isolation (the PublicRuntimeConfig
  // augmentation lives in types.ts), so the key reads through the index signature here.
  const port = Number(useRuntimeConfig().public['visualFeedbackPort']) || 3199;
  const base = `http://127.0.0.1:${String(port)}`;
  createVisualFeedback({
    transport: {
      async send(batch) {
        const response = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
        });
        if (!response.ok) {
          throw new Error(`visual-feedback endpoint responded ${String(response.status)}`);
        }
      },
    },
    healthCheck: async () => {
      try {
        const response = await fetch(`${base}/health`);
        return response.ok;
      } catch {
        return false;
      }
    },
  });
});
