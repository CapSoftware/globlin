import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/vendor/**', '**/fixtures/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
