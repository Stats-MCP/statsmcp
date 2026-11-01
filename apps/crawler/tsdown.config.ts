import { defineConfig } from 'tsdown';

export const config = defineConfig({
  entry: ['src/cli.ts'],
  format: 'esm',
  platform: 'node',
  fixedExtension: false,
  clean: true
});

export default config;
