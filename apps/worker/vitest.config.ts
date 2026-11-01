import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const wrangler = readFileSync(
  new URL('./wrangler.jsonc', import.meta.url),
  'utf8'
);
const routePatterns = [...wrangler.matchAll(/"pattern": "([^"]+)"/g)].flatMap(
  (match) => (match[1] ? [match[1]] : [])
);

export const config = defineConfig({
  test: { provide: { routePatterns } },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  }
});

export default config;
