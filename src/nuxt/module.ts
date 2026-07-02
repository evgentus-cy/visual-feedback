/**
 * visual-feedback/nuxt — dev-only Nuxt module.
 *
 * App footprint = one line in `modules` + one devDependency. The module owns the dev/prod
 * gate: in a production build (`!nuxt.options.dev`) it registers nothing, so the overlay +
 * its `visual-feedback` import never enter the production bundle. In dev it adds a
 * client-only plugin (see runtime/plugin.client.ts) that POSTs feedback batches to the local
 * MCP channel server.
 */
import { addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import type { NuxtModule } from '@nuxt/schema';

export interface ModuleOptions {
  /** Port of the local visual-feedback MCP channel server (matches the server's VISUAL_FEEDBACK_PORT). */
  port: number;
}

const visualFeedbackModule: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'visual-feedback',
    configKey: 'visualFeedback',
    compatibility: { nuxt: '^4.0.0' },
  },
  defaults: {
    port: 3199,
  },
  setup(options, nuxt) {
    // Dev-only: register nothing in a production build.
    if (!nuxt.options.dev) return;
    // Expose the port to the client plugin; consumers can override at runtime via
    // NUXT_PUBLIC_VISUAL_FEEDBACK_PORT (it must match the MCP server's VISUAL_FEEDBACK_PORT).
    nuxt.options.runtimeConfig.public['visualFeedbackPort'] = options.port;
    const resolver = createResolver(import.meta.url);
    addPlugin({ src: resolver.resolve('./runtime/plugin.client'), mode: 'client' });
  },
});

export default visualFeedbackModule;
