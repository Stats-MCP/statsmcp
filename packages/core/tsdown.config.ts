import { defineConfig } from 'tsdown';

export const config = defineConfig({
  entry: ['src/index.ts', 'src/node.ts'],
  format: 'esm',
  platform: 'neutral',
  deps: { neverBundle: [/^node:/] },
  dts: true,
  clean: true
});

export default config;
