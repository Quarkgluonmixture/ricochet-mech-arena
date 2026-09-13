import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
});
