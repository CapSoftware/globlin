/**
 * Benchmark-driven test suite for globlin.
 *
 * These tests FAIL if performance targets are not met.
 * All tests use REAL filesystem operations - no mocks or simulations.
 *
 * Performance targets by phase:
 * - Phase 1 (PoC): 5x minimum speedup
 * - Phase 2 (Core): 10x minimum speedup
 * - Phase 5 (Optimized): 20x minimum speedup
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { globSync as globOriginal, glob as globOriginalAsync } from 'glob'
import * as path from 'path'
import * as fs from 'fs'

import { createLargeFixture, cleanupFixture } from './fixtures.js'
import {
  measureTime,
  measureTimeSync,
  loadGloblin,
  formatDuration,
  formatSpeedup,
} from './utils.js'

const fsp = fs.promises

// Detect CI environment (slower due to virtualization and shared resources)
const IS_CI = Boolean(process.env.CI)

// Performance targets (adjust as we progress through phases)
// CI environments have significantly slower disk I/O, so we use lower targets
const PHASE_TARGETS = {
  PHASE_1_POC: IS_CI ? 1 : 5, // 1x in CI (just don't be slower), 5x locally
  PHASE_2_CORE: IS_CI ? 2 : 10,
  PHASE_5_OPTIMIZED: IS_CI ? 5 : 20,
}

// Current phase target (update as we progress)
const CURRENT_TARGET = PHASE_TARGETS.PHASE_1_POC

// Simple patterns have less speedup due to fixed overhead
const SIMPLE_PATTERN_TARGET = IS_CI ? 0.8 : Math.max(3, CURRENT_TARGET * 0.6)

// Fixture sizes for different test categories
const FIXTURE_SIZES = {
  SMALL: 1000, // Quick smoke tests
  MEDIUM: 10000, // Standard benchmarks
  LARGE: 50000, // Stress tests (optional, slow)
}

describe('Performance Benchmarks (Tests)', () => {
  let smallFixture: string
  let mediumFixture: string
  let globlin: Awaited<ReturnType<typeof loadGloblin>>

  beforeAll(async () => {
    // Load globlin native module
    globlin = await loadGloblin()

    // Skip all tests if globlin is not built yet
    if (!globlin) {
      console.warn('Globlin not built yet - skipping benchmark tests')
      return
    }

    // Create REAL fixtures on disk
    console.log('Creating benchmark fixtures...')

    smallFixture = await createLargeFixture(FIXTURE_SIZES.SMALL, {
      name: 'bench-small',
      maxDepth: 4,
      extensions: ['js', 'ts', 'txt'],
    })
    console.log(`  Small fixture: ${smallFixture} (${FIXTURE_SIZES.SMALL} files)`)

    mediumFixture = await createLargeFixture(FIXTURE_SIZES.MEDIUM, {
      name: 'bench-medium',
      maxDepth: 6,
      extensions: ['js', 'ts', 'txt', 'json', 'md'],
    })
    console.log(`  Medium fixture: ${mediumFixture} (${FIXTURE_SIZES.MEDIUM} files)`)

    console.log('Fixtures created successfully')
  }, 120000) // 2 minute timeout for fixture creation

  afterAll(async () => {
    // Cleanup REAL fixtures
    if (smallFixture) {
      await cleanupFixture(smallFixture)
    }
    if (mediumFixture) {
      await cleanupFixture(mediumFixture)
    }
  })

  // Helper to skip tests if globlin not available
  function skipIfNoGloblin() {
    if (!globlin) {
      console.warn('Skipping: globlin not built')
      return true
    }
    return false
  }

  // Helper to run benchmark and assert speedup
  async function assertAsyncSpeedup(
    pattern: string,
    fixture: string,
    minSpeedup: number,
    options: Record<string, unknown> = {}
  ) {
    const fullOptions = { ...options, cwd: fixture }

    // Run glob
    const { result: globResults, time: globTime } = await measureTime(
      () => globOriginalAsync(pattern, fullOptions) as Promise<string[]>
    )

    // Run globlin
    const { result: globlinResults, time: globlinTime } = await measureTime(() =>
      globlin!.glob(pattern, fullOptions)
    )

    // Results must match
    const globSet = new Set(globResults)
    const globlinSet = new Set(globlinResults)

    expect(globlinSet.size).toBe(globSet.size)
    for (const result of globSet) {
      expect(globlinSet.has(result)).toBe(true)
    }

    // Calculate speedup
    const speedup = globTime / globlinTime

    // Log for CI tracking
    console.log(
      `  Pattern: ${pattern}\n` +
        `    glob:    ${formatDuration(globTime)} (${globResults.length} results)\n` +
        `    globlin: ${formatDuration(globlinTime)} (${globlinResults.length} results)\n` +
        `    Speedup: ${formatSpeedup(speedup)} (target: ${minSpeedup}x)`
    )

    // Performance assertion - FAIL if not fast enough
    expect(speedup).toBeGreaterThanOrEqual(minSpeedup)

    return { globTime, globlinTime, speedup, resultCount: globResults.length }
  }

  // Helper for sync benchmarks
  function assertSyncSpeedup(
    pattern: string,
    fixture: string,
    minSpeedup: number,
    options: Record<string, unknown> = {}
  ) {
    const fullOptions = { ...options, cwd: fixture }

    // Run glob
    const { result: globResults, time: globTime } = measureTimeSync(
      () => globOriginal(pattern, fullOptions) as string[]
    )

    // Run globlin
    const { result: globlinResults, time: globlinTime } = measureTimeSync(() =>
      globlin!.globSync(pattern, fullOptions)
    )

    // Results must match
    const globSet = new Set(globResults)
    const globlinSet = new Set(globlinResults)

    expect(globlinSet.size).toBe(globSet.size)
    for (const result of globSet) {
      expect(globlinSet.has(result)).toBe(true)
    }

    // Calculate speedup
    const speedup = globTime / globlinTime

    // Log for CI tracking
    console.log(
      `  Pattern: ${pattern} (sync)\n` +
        `    glob:    ${formatDuration(globTime)} (${globResults.length} results)\n` +
        `    globlin: ${formatDuration(globlinTime)} (${globlinResults.length} results)\n` +
        `    Speedup: ${formatSpeedup(speedup)} (target: ${minSpeedup}x)`
    )

    // Performance assertion - FAIL if not fast enough
    expect(speedup).toBeGreaterThanOrEqual(minSpeedup)

    return { globTime, globlinTime, speedup, resultCount: globResults.length }
  }

  describe('Simple Patterns (*.ext)', () => {
    it('should be fast on *.js pattern', async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('*.js', smallFixture, SIMPLE_PATTERN_TARGET)
    })

    it('should be fast on *.ts pattern', async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('*.ts', smallFixture, SIMPLE_PATTERN_TARGET)
    })

    it('should be fast on *.txt pattern', async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('*.txt', smallFixture, SIMPLE_PATTERN_TARGET)
    })
  })

  describe('Recursive Patterns (**/*.ext)', () => {
    it(`should be ${CURRENT_TARGET}x faster on **/*.js`, async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('**/*.js', mediumFixture, CURRENT_TARGET)
    })

    it(`should be ${CURRENT_TARGET}x faster on **/*.ts`, async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('**/*.ts', mediumFixture, CURRENT_TARGET)
    })

    it(`should be ${CURRENT_TARGET}x faster on **/*`, async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('**/*', mediumFixture, CURRENT_TARGET)
    })

    it(`should be ${CURRENT_TARGET}x faster on **/*.{js,ts}`, async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('**/*.{js,ts}', mediumFixture, CURRENT_TARGET)
    })
  })

  describe('Scoped Recursive Patterns', () => {
    it(`should be fast on level0/**/*.js`, async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('level0/**/*.js', mediumFixture, CURRENT_TARGET)
    })

    it(`should be fast on **/level1/**/*.ts`, async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('**/level1/**/*.ts', mediumFixture, CURRENT_TARGET)
    })
  })

  describe('Sync API Performance', () => {
    it(`should be ${CURRENT_TARGET}x faster on **/*.js (sync)`, () => {
      if (skipIfNoGloblin()) return

      assertSyncSpeedup('**/*.js', mediumFixture, CURRENT_TARGET)
    })

    it(`should be ${CURRENT_TARGET}x faster on **/* (sync)`, () => {
      if (skipIfNoGloblin()) return

      assertSyncSpeedup('**/*', mediumFixture, CURRENT_TARGET)
    })
  })

  describe('Character Class Patterns', () => {
    it('should be fast on **/*[0-9].js', async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('**/*[0-9].js', mediumFixture, CURRENT_TARGET)
    })

    it('should be fast on **/file[0-9][0-9].ts', async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('**/file[0-9][0-9].ts', mediumFixture, CURRENT_TARGET)
    })
  })

  describe('Question Mark Patterns', () => {
    it('should be fast on **/file?.js', async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('**/file?.js', mediumFixture, CURRENT_TARGET)
    })

    it('should be fast on **/level?/**/*.ts', async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('**/level?/**/*.ts', mediumFixture, CURRENT_TARGET)
    })
  })

  describe('Complex Patterns', () => {
    it('should be fast on nested patterns', async () => {
      if (skipIfNoGloblin()) return

      // Complex nested patterns have more overhead, use lower target in CI
      const target = IS_CI ? 0.5 : CURRENT_TARGET * 0.8
      await assertAsyncSpeedup('./**/level0/**/level1/**/*.js', mediumFixture, target)
    })

    it('should be fast on brace expansion with globstar', async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('level{0,1}/**/*.js', mediumFixture, CURRENT_TARGET)
    })
  })

  describe('Options Impact', () => {
    it('should maintain speedup with dot: true', async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('**/*.js', mediumFixture, CURRENT_TARGET, { dot: true })
    })

    it('should maintain speedup with nocase: true', async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('**/*.JS', mediumFixture, CURRENT_TARGET * 0.8, { nocase: true })
    })

    it('should maintain speedup with nodir: true', async () => {
      if (skipIfNoGloblin()) return

      await assertAsyncSpeedup('**/*', mediumFixture, CURRENT_TARGET, { nodir: true })
    })
  })

  describe('Benchmark Summary', () => {
    it('should produce consistent results across runs', async () => {
      if (skipIfNoGloblin()) return

      const pattern = '**/*.js'
      const runs = 3
      const speedups: number[] = []

      for (let i = 0; i < runs; i++) {
        const result = await assertAsyncSpeedup(pattern, mediumFixture, CURRENT_TARGET * 0.5)
        speedups.push(result.speedup)
      }

      // Calculate variance
      const mean = speedups.reduce((a, b) => a + b, 0) / runs
      const variance = speedups.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / runs
      const stdDev = Math.sqrt(variance)
      const coeffOfVar = stdDev / mean

      console.log(`\n  Consistency check (${runs} runs):`)
      console.log(`    Mean speedup: ${formatSpeedup(mean)}`)
      console.log(`    Std deviation: ${stdDev.toFixed(2)}`)
      console.log(`    Coefficient of variation: ${(coeffOfVar * 100).toFixed(1)}%`)

      // Variance should be reasonable (< 30% locally, < 50% in CI due to shared resources)
      const maxCoeffOfVar = IS_CI ? 0.5 : 0.3
      expect(coeffOfVar).toBeLessThan(maxCoeffOfVar)
    })
  })
})

describe('Performance Regression Guards', () => {
  let fixture: string
  let globlin: Awaited<ReturnType<typeof loadGloblin>>

  beforeAll(async () => {
    globlin = await loadGloblin()
    if (!globlin) return

    fixture = await createLargeFixture(5000, {
      name: 'bench-regression',
      maxDepth: 5,
      extensions: ['js', 'ts'],
    })
  }, 60000)

  afterAll(async () => {
    if (fixture) {
      await cleanupFixture(fixture)
    }
  })

  it('should never be slower than glob', async () => {
    if (!globlin) {
      console.warn('Skipping: globlin not built')
      return
    }

    const patterns = ['**/*.js', '**/*.ts', '**/*', '*.js']

    for (const pattern of patterns) {
      const { time: globTime } = await measureTime(
        () => globOriginalAsync(pattern, { cwd: fixture }) as Promise<string[]>
      )

      const { time: globlinTime } = await measureTime(() =>
        globlin!.glob(pattern, { cwd: fixture })
      )

      const speedup = globTime / globlinTime

      // At minimum, globlin should not be slower than glob
      // (speedup >= 1.0 means globlin is at least as fast)
      expect(speedup).toBeGreaterThanOrEqual(0.9) // Allow 10% tolerance for noise

      if (speedup < 1.0) {
        console.warn(
          `  Warning: ${pattern} - globlin is ${(1 / speedup).toFixed(2)}x slower than glob`
        )
      }
    }
  })

  it('should meet minimum phase target', async () => {
    if (!globlin) {
      console.warn('Skipping: globlin not built')
      return
    }

    const { time: globTime } = await measureTime(
      () => globOriginalAsync('**/*.js', { cwd: fixture }) as Promise<string[]>
    )

    const { time: globlinTime } = await measureTime(() =>
      globlin!.glob('**/*.js', { cwd: fixture })
    )

    const speedup = globTime / globlinTime

    console.log(`\n  Phase ${getCurrentPhase()} minimum target: ${CURRENT_TARGET}x`)
    console.log(`  Actual speedup: ${formatSpeedup(speedup)}`)

    expect(speedup).toBeGreaterThanOrEqual(CURRENT_TARGET)
  })
})

// Helper to determine current phase (for logging)
function getCurrentPhase(): string {
  if (CURRENT_TARGET >= PHASE_TARGETS.PHASE_5_OPTIMIZED) return '5'
  if (CURRENT_TARGET >= PHASE_TARGETS.PHASE_2_CORE) return '2'
  return '1'
}
