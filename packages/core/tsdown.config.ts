import { defineConfig } from 'tsdown';

export const config = defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'neutral',
  dts: true,
  clean: true
});

export default config;
