import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export const config = defineConfig({
  resolve: {
    alias: {
      '@eval': fileURLToPath(new URL('./eval', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
});

export default config;
