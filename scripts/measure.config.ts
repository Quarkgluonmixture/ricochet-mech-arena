// Dedicated vitest config for the AI-vs-AI measurement. `vite.config.ts` only includes
// tests/**/*.test.ts, so `npm test` never sees scripts/measure.test.ts; this config is the
// only way `npm run measure` discovers it. No new dependency: vitest ships from the lockfile.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/measure.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
