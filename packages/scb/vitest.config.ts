import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export const config = defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  }
});

export default config;
