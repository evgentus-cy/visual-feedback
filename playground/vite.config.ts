import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { visualFeedbackSource } from '@evgentus/visual-feedback/vite';

export default defineConfig({
  // visualFeedbackSource before the React plugin: it tags JSX with data-vf-source in dev.
  plugins: [visualFeedbackSource(), react()],
  server: { port: 4173 },
});
