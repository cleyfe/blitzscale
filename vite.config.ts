import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pkg = (name: string) => fileURLToPath(new URL(`./packages/${name}/src`, import.meta.url));

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@marketfront/engine-api': pkg('engine-api'),
      '@marketfront/engine-lib': pkg('engine-lib'),
      '@marketfront/engine': pkg('engine'),
    },
  },
});
