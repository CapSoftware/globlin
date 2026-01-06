import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/vendor/**', '**/fixtures/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['js/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/vendor/**',
        '**/fixtures/**',
        '**/*.test.ts',
        '**/*.d.ts',
        'js/stream.ts', // Placeholder code, not in use
        'js/types.ts', // Type definitions only
      ],
      // Coverage thresholds
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 90,
        lines: 85,
      },
    },
  },
})
