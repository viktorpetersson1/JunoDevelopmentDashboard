import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // Playwright specs run via `pnpm test:e2e`; exclude from vitest sweep.
    exclude: ['node_modules', '.next', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/*.config.*', '**/.next/**', '**/node_modules/**', 'tests/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
