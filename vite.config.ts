import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// A relative base lets the built site work from any folder, including
// https://<user>.github.io/trammel/ on GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
