import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/vendor/**',
      '**/fixtures/**',
      'tests/benchmark.test.ts',
      'tests/performance-regression.test.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage/js',
      include: ['js/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/vendor/**',
        '**/fixtures/**',
        '**/*.test.ts',
        '**/*.d.ts',
      ],
    },
  },
})
