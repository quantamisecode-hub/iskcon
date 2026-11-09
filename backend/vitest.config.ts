import { defineConfig } from 'vitest/config';

/**
 * Backend test configuration (vitest).
 * Tests run against the DEDICATED test database (food_inventory_test),
 * configured via FIS_TEST_DATABASE_URL in backend/.env.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: './tests/global-setup.ts',
    setupFiles: ['./tests/setup-env.ts'],
    // Avoid running prod server tsx watch hot reloads during tests.
    testTimeout: 30_000,
  },
});
