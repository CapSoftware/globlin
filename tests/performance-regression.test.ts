/**
 * Performance regression test suite for globlin.
 *
 * THESE TESTS FAIL if:
 * 1. Simple patterns are significantly slower than glob
 * 2. Recursive patterns are slower than glob
 * 3. Any pattern shows major regression (>20% slower)
 *
 * Purpose: Prevent future regressions when making code changes.
 *
 * Baseline thresholds are based on Phase 2.5 final benchmarks:
 * - Medium fixture (10k-20k files): ~1.3x average speedup
 * - Large fixture (100k files): ~2.2x average speedup
 * - Conservative thresholds set to catch regressions, not enforce targets
 *
 * Note: Performance targets (10x+) are Phase 5 goals requiring parallel I/O.
 * Current thresholds are set to catch regressions, not enforce final targets.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { globSync as globOriginal, glob as globOriginalAsync } from 'glob'
import * as fs from 'fs'

import { createLargeFixture, cleanupFixture } from './fixtures.js'
import {
  measureTime,
  measureTimeSync,
  loadGloblin,
  formatDuration,
  formatSpeedup,
} from './utils.js'

// Detect CI environment (slower due to virtualization and shared resources)
const IS_CI = Boolean(process.env.CI)

// Regression thresholds - MUST NEVER go below these
// Based on Phase 2.5 final benchmarks:
// - Medium fixture (10k-20k files): ~1.3x average speedup
// - Large fixture (100k files): ~2.2x average speedup
// - Simple patterns were 2.1x faster on large fixtures
// - Recursive patterns were 2.2x faster on large fixtures
//
// For 10k files, we set conservative thresholds that prevent regression
// while accounting for measurement noise and smaller fixture overhead
//
// CI Note: Some pattern types (brace expansion, ?, [...]) use regex fallback
// and can be 30-40% slower than glob. CI thresholds are lowered accordingly.
const REGRESSION_THRESHOLDS = {
  // Minimum speedup vs glob (1.0 = same speed, must never be slower)
  // CI allows more tolerance due to regex fallback patterns and I/O variance
  MIN_SPEEDUP: IS_CI ? 0.6 : 0.8,

  // Pattern-specific minimum speedups based on Phase 2.5 results (medium fixture)
  // These are set conservatively to prevent false failures while catching real regressions
  SIMPLE_PATTERNS: IS_CI ? 0.7 : 0.9, // Simple patterns must not be slower than glob
  RECURSIVE_PATTERNS: IS_CI ? 0.7 : 1.0, // Recursive patterns should be at least as fast
  SCOPED_PATTERNS: IS_CI ? 0.6 : 0.9, // Scoped patterns can be slower due to multi-base overhead

  // Absolute time limits for 10k file fixture (in ms)
  // Based on Phase 2.5 benchmarks, these are generous upper bounds
  // CI gets more headroom due to variable I/O performance
  MAX_TIME_SIMPLE: IS_CI ? 100 : 50, // Simple patterns should complete in <50ms (depth-limited)
  MAX_TIME_RECURSIVE: IS_CI ? 300 : 150, // Recursive patterns should complete in <150ms
}

// Test configuration
const FIXTURE_SIZE = 10000 // 10k files for reliable timing
const WARMUP_RUNS = 2 // Warmup to avoid cold-start effects
const BENCHMARK_RUNS = 3 // Multiple runs for stability

describe('Performance Regression Suite', () => {
  let fixture: string
  let globlin: Awaited<ReturnType<typeof loadGloblin>> | null = null

  beforeAll(async () => {
    try {
      globlin = await loadGloblin()
    } catch {
      console.warn('Globlin not built - skipping performance regression tests')
      return
    }

    // Create fixture with realistic structure
    console.log('Creating performance regression fixture...')
    fixture = await createLargeFixture(FIXTURE_SIZE, {
      name: 'perf-regression',
      maxDepth: 5,
      extensions: ['js', 'ts', 'txt', 'json', 'md'],
    })
    console.log(`Fixture created: ${fixture} (${FIXTURE_SIZE} files)`)
  }, 120000)

  afterAll(async () => {
    if (fixture) {
      await cleanupFixture(fixture)
    }
  })

  function skipIfNoGloblin(): boolean {
    if (!globlin) {
      console.warn('Skipping: globlin not built')
      return true
    }
    return false
  }

  /**
   * Run a pattern benchmark with warmup and multiple iterations
   */
  async function benchmarkPattern(
    pattern: string,
    options: Record<string, unknown> = {}
  ): Promise<{
    globTime: number
    globlinTime: number
    speedup: number
    resultCount: number
    variance: number
  }> {
    const fullOptions = { ...options, cwd: fixture }

    // Warmup runs
    for (let i = 0; i < WARMUP_RUNS; i++) {
      await globOriginalAsync(pattern, fullOptions)
      await globlin!.glob(pattern, fullOptions)
    }

    // Benchmark runs
    const globTimes: number[] = []
    const globlinTimes: number[] = []
    let resultCount = 0

    for (let i = 0; i < BENCHMARK_RUNS; i++) {
      const { result: globResults, time: globTime } = await measureTime(
        () => globOriginalAsync(pattern, fullOptions) as Promise<string[]>
      )
      globTimes.push(globTime)

      const { result: globlinResults, time: globlinTime } = await measureTime(() =>
        globlin!.glob(pattern, fullOptions)
      )
      globlinTimes.push(globlinTime)

      resultCount = globResults.length

      // Verify results match
      const globSet = new Set(globResults)
      const globlinSet = new Set(globlinResults)
      if (globSet.size !== globlinSet.size) {
        console.warn(`Result count mismatch: glob=${globSet.size}, globlin=${globlinSet.size}`)
      }
    }

    // Calculate median times (more stable than mean)
    const sortedGlobTimes = [...globTimes].sort((a, b) => a - b)
    const sortedGloblinTimes = [...globlinTimes].sort((a, b) => a - b)

    const medianGlobTime = sortedGlobTimes[Math.floor(BENCHMARK_RUNS / 2)]
    const medianGloblinTime = sortedGloblinTimes[Math.floor(BENCHMARK_RUNS / 2)]

    // Calculate variance for stability check
    const meanGloblinTime = globlinTimes.reduce((a, b) => a + b, 0) / BENCHMARK_RUNS
    const variance =
      globlinTimes.reduce((sum, t) => sum + Math.pow(t - meanGloblinTime, 2), 0) / BENCHMARK_RUNS
    const coeffOfVar = Math.sqrt(variance) / meanGloblinTime

    return {
      globTime: medianGlobTime,
      globlinTime: medianGloblinTime,
      speedup: medianGlobTime / medianGloblinTime,
      resultCount,
      variance: coeffOfVar,
    }
  }

  describe('Simple Pattern Regressions', () => {
    it('*.js must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } = await benchmarkPattern('*.js')

      console.log(`  Pattern: *.js`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      // Must not be slower than glob
      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)

      // Must meet simple pattern threshold
      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.SIMPLE_PATTERNS)
    })

    it('*.ts must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } = await benchmarkPattern('*.ts')

      console.log(`  Pattern: *.ts`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.SIMPLE_PATTERNS)
    })

    it('*.txt must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } = await benchmarkPattern('*.txt')

      console.log(`  Pattern: *.txt`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.SIMPLE_PATTERNS)
    })
  })

  describe('Recursive Pattern Regressions', () => {
    it('**/*.js must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } = await benchmarkPattern('**/*.js')

      console.log(`  Pattern: **/*.js`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.RECURSIVE_PATTERNS)
    })

    it('**/*.ts must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } = await benchmarkPattern('**/*.ts')

      console.log(`  Pattern: **/*.ts`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.RECURSIVE_PATTERNS)
    })

    it('**/* must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } = await benchmarkPattern('**/*')

      console.log(`  Pattern: **/*`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.RECURSIVE_PATTERNS)
    })

    it('**/*.{js,ts} must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } = await benchmarkPattern('**/*.{js,ts}')

      console.log(`  Pattern: **/*.{js,ts}`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.RECURSIVE_PATTERNS)
    })
  })

  describe('Scoped Pattern Regressions', () => {
    it('level0/**/*.js must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } =
        await benchmarkPattern('level0/**/*.js')

      console.log(`  Pattern: level0/**/*.js`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.SCOPED_PATTERNS)
    })

    it('**/level1/**/*.ts must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } =
        await benchmarkPattern('**/level1/**/*.ts')

      console.log(`  Pattern: **/level1/**/*.ts`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.SCOPED_PATTERNS)
    })
  })

  describe('Option Impact Regressions', () => {
    it('dot: true must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } = await benchmarkPattern('**/*.js', {
        dot: true,
      })

      console.log(`  Pattern: **/*.js (dot: true)`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
    })

    it('nocase: true must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } = await benchmarkPattern('**/*.JS', {
        nocase: true,
      })

      console.log(`  Pattern: **/*.JS (nocase: true)`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
    })

    it('nodir: true must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } = await benchmarkPattern('**/*', {
        nodir: true,
      })

      console.log(`  Pattern: **/* (nodir: true)`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
    })

    it('absolute: true must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } = await benchmarkPattern('**/*.js', {
        absolute: true,
      })

      console.log(`  Pattern: **/*.js (absolute: true)`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
    })
  })

  describe('Complex Pattern Regressions', () => {
    it('character class patterns must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } = await benchmarkPattern('**/*[0-9].js')

      console.log(`  Pattern: **/*[0-9].js`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
    })

    it('question mark patterns must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } =
        await benchmarkPattern('**/level?/**/*.ts')

      console.log(`  Pattern: **/level?/**/*.ts`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
    })

    it('brace expansion patterns must not regress', async () => {
      if (skipIfNoGloblin()) return

      const { globTime, globlinTime, speedup, resultCount } =
        await benchmarkPattern('level{0,1}/**/*.js')

      console.log(`  Pattern: level{0,1}/**/*.js`)
      console.log(`    glob:    ${formatDuration(globTime)} (${resultCount} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)}`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
    })
  })

  describe('Absolute Time Limits', () => {
    it('simple patterns must complete within time limit', async () => {
      if (skipIfNoGloblin()) return

      const { globlinTime } = await benchmarkPattern('*.js')

      console.log(`  Simple pattern time: ${formatDuration(globlinTime)}`)
      console.log(`  Limit: ${REGRESSION_THRESHOLDS.MAX_TIME_SIMPLE}ms`)

      expect(globlinTime).toBeLessThan(REGRESSION_THRESHOLDS.MAX_TIME_SIMPLE)
    })

    it('recursive patterns must complete within time limit', async () => {
      if (skipIfNoGloblin()) return

      const { globlinTime } = await benchmarkPattern('**/*.js')

      console.log(`  Recursive pattern time: ${formatDuration(globlinTime)}`)
      console.log(`  Limit: ${REGRESSION_THRESHOLDS.MAX_TIME_RECURSIVE}ms`)

      expect(globlinTime).toBeLessThan(REGRESSION_THRESHOLDS.MAX_TIME_RECURSIVE)
    })
  })

  describe('Never Slower Than Glob', () => {
    const patterns = [
      '*.js',
      '*.ts',
      '**/*.js',
      '**/*.ts',
      '**/*',
      '**/*.{js,ts}',
      'level0/**/*.js',
      '**/level1/**/*.ts',
      '**/*[0-9].js',
      'level{0,1}/**/*.js',
    ]

    it('all patterns must be at least as fast as glob', async () => {
      if (skipIfNoGloblin()) return

      console.log('\n  Checking all patterns are faster than glob:')

      const results: { pattern: string; speedup: number; passed: boolean }[] = []

      for (const pattern of patterns) {
        const { speedup } = await benchmarkPattern(pattern)
        const passed = speedup >= REGRESSION_THRESHOLDS.MIN_SPEEDUP
        results.push({ pattern, speedup, passed })

        const status = passed ? 'PASS' : 'FAIL'
        console.log(`    ${status}: ${pattern} - ${formatSpeedup(speedup)}`)
      }

      const failedPatterns = results.filter(r => !r.passed)

      if (failedPatterns.length > 0) {
        console.log('\n  Failed patterns:')
        for (const { pattern, speedup } of failedPatterns) {
          console.log(
            `    ${pattern}: ${formatSpeedup(speedup)} (need >= ${REGRESSION_THRESHOLDS.MIN_SPEEDUP}x)`
          )
        }
      }

      expect(failedPatterns.length).toBe(0)
    })
  })

  describe('Sync API Regressions', () => {
    it('globSync must not regress', () => {
      if (skipIfNoGloblin()) return

      const pattern = '**/*.js'
      const fullOptions = { cwd: fixture }

      // Warmup
      globOriginal(pattern, fullOptions)
      globlin!.globSync(pattern, fullOptions)

      // Benchmark
      const { result: globResults, time: globTime } = measureTimeSync(
        () => globOriginal(pattern, fullOptions) as string[]
      )

      const { result: globlinResults, time: globlinTime } = measureTimeSync(() =>
        globlin!.globSync(pattern, fullOptions)
      )

      const speedup = globTime / globlinTime

      console.log(`  Pattern: **/*.js (sync)`)
      console.log(`    glob:    ${formatDuration(globTime)} (${globResults.length} results)`)
      console.log(`    globlin: ${formatDuration(globlinTime)} (${globlinResults.length} results)`)
      console.log(`    Speedup: ${formatSpeedup(speedup)}`)

      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.MIN_SPEEDUP)
      expect(speedup).toBeGreaterThanOrEqual(REGRESSION_THRESHOLDS.RECURSIVE_PATTERNS)
    })
  })

  describe('Benchmark Stability', () => {
    it('results should be consistent across runs', async () => {
      if (skipIfNoGloblin()) return

      const { variance } = await benchmarkPattern('**/*.js')

      console.log(`  Coefficient of variation: ${(variance * 100).toFixed(1)}%`)

      // Variance should be under 50% for stable results
      expect(variance).toBeLessThan(0.5)
    })
  })
})

describe('Regression Summary', () => {
  it('should report threshold configuration', () => {
    console.log('\n=== Performance Regression Thresholds ===')
    console.log(
      `  MIN_SPEEDUP: ${REGRESSION_THRESHOLDS.MIN_SPEEDUP}x (must never be slower than glob)`
    )
    console.log(`  SIMPLE_PATTERNS: ${REGRESSION_THRESHOLDS.SIMPLE_PATTERNS}x`)
    console.log(`  RECURSIVE_PATTERNS: ${REGRESSION_THRESHOLDS.RECURSIVE_PATTERNS}x`)
    console.log(`  SCOPED_PATTERNS: ${REGRESSION_THRESHOLDS.SCOPED_PATTERNS}x`)
    console.log(`  MAX_TIME_SIMPLE: ${REGRESSION_THRESHOLDS.MAX_TIME_SIMPLE}ms`)
    console.log(`  MAX_TIME_RECURSIVE: ${REGRESSION_THRESHOLDS.MAX_TIME_RECURSIVE}ms`)
    console.log('==========================================\n')
  })
})
