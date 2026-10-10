import { defineConfig } from 'vitest/config';

// One test run for the whole workspace; each package keeps its tests in `test/`.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
});
