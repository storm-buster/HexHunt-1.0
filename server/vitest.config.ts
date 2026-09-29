import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: { NODE_ENV: 'test' },
    globalSetup: ['./tests/global-setup.ts'],
    // Run test files sequentially in a single process — they share one
    // PostgreSQL test database and reset state between tests.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 30000,
  },
});
