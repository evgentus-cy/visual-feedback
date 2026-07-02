/**
 * Module type augmentation: gives consumers autocomplete on the `visualFeedback` config key.
 * (The internal `runtimeConfig.public.visualFeedbackPort` is read via the index signature, so it
 * is intentionally not augmented here — that keeps tsup's per-file dts build and eslint in agreement.)
 */
import type { ModuleOptions } from './module';

declare module '@nuxt/schema' {
  interface NuxtConfig {
    visualFeedback?: Partial<ModuleOptions>;
  }
  interface NuxtOptions {
    visualFeedback?: ModuleOptions;
  }
}
