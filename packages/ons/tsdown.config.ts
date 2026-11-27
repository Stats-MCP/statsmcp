import { defineConfig } from 'tsdown';

export const config = defineConfig({
  entry: ['src/index.ts', 'src/bin.ts'],
  format: 'esm',
  platform: 'node',
  dts: true,
  clean: true
});

export default config;
