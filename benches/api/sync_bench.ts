/**
 * Phase 7.1: Comprehensive Sync API (`globSync`) Benchmarking
 *
 * This benchmark performs a deep dive analysis of the sync API:
 * - Simple patterns across all fixture sizes (small/medium/large)
 * - Recursive patterns across all fixture sizes
 * - Complex patterns (brace, extglob, character classes)
 * - Various option combinations (nodir, dot, mark, absolute)
 * - Memory usage profiling per pattern type
 * - Cold vs warm cache comparison
 *
 * Compare: globlin sync vs glob sync vs fast-glob sync
 * Measure: Execution time (median, p95, p99), memory allocation, GC pressure, result count
 */

import { globSync as ogGlobSync } from 'glob'
import { globSync } from '../../js/index.js'
import * as fg from 'fast-glob'

// Simple options interface for this benchmark
interface BenchOptions {
  cwd?: string
  nodir?: boolean
  dot?: boolean
  mark?: boolean
  absolute?: boolean
}

const SMALL_CWD = './benches/fixtures/small'
const MEDIUM_CWD = './benches/fixtures/medium'
const LARGE_CWD = './benches/fixtures/large'

interface BenchmarkResult {
  pattern: string
  options: string
  fixture: string
  runs: number
  glob: {
    median: number
    p95: number
    p99: number
    min: number
    max: number
    resultCount: number
  }
  globlin: {
    median: number
    p95: number
    p99: number
    min: number
    max: number
    resultCount: number
  }
  fastGlob: {
    median: number
    p95: number
    p99: number
    min: number
    max: number
    resultCount: number
  }
  speedupVsGlob: number
  speedupVsFg: number
  resultMatch: boolean
}

interface MemoryProfile {
  pattern: string
  heapUsedBefore: number
  heapUsedAfter: number
  heapDelta: number
  externalBefore: number
  externalAfter: number
  externalDelta: number
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function median(arr: number[]): number {
  return percentile(arr, 50)
}

function forceGC() {
  if (global.gc) {
    global.gc()
  }
}

async function runBenchmark(
  pattern: string,
  cwd: string,
  options: BenchOptions = {},
  runs = 10,
  warmupRuns = 3
): Promise<BenchmarkResult> {
  const ogOptions = { ...options, cwd }
  const globlinOptions = { ...options, cwd }
  const fgOptions = { cwd, dot: options.dot, onlyDirectories: false }

  // Warmup
  for (let i = 0; i < warmupRuns; i++) {
    ogGlobSync(pattern, ogOptions)
    globSync(pattern, globlinOptions)
    fg.sync(pattern, fgOptions)
  }

  // Benchmark glob
  const globTimes: number[] = []
  let globResults: string[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    globResults = ogGlobSync(pattern, ogOptions)
    globTimes.push(performance.now() - start)
  }

  // Benchmark globlin
  const globlinTimes: number[] = []
  let globlinResults: string[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    globlinResults = globSync(pattern, globlinOptions)
    globlinTimes.push(performance.now() - start)
  }

  // Benchmark fast-glob
  const fgTimes: number[] = []
  let fgResults: string[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    fgResults = fg.sync(pattern, fgOptions)
    fgTimes.push(performance.now() - start)
  }

  const globMedian = median(globTimes)
  const globlinMedian = median(globlinTimes)
  const fgMedian = median(fgTimes)

  // Check result consistency (use sets for comparison)
  const globSet = new Set(globResults)
  const globlinSet = new Set(globlinResults)
  const resultMatch = globSet.size === globlinSet.size && [...globSet].every((r) => globlinSet.has(r))

  const fixtureLabel = cwd.includes('small')
    ? 'small'
    : cwd.includes('medium')
      ? 'medium'
      : cwd.includes('large')
        ? 'large'
        : 'unknown'

  return {
    pattern,
    options: JSON.stringify(options),
    fixture: fixtureLabel,
    runs,
    glob: {
      median: globMedian,
      p95: percentile(globTimes, 95),
      p99: percentile(globTimes, 99),
      min: Math.min(...globTimes),
      max: Math.max(...globTimes),
      resultCount: globResults.length,
    },
    globlin: {
      median: globlinMedian,
      p95: percentile(globlinTimes, 95),
      p99: percentile(globlinTimes, 99),
      min: Math.min(...globlinTimes),
      max: Math.max(...globlinTimes),
      resultCount: globlinResults.length,
    },
    fastGlob: {
      median: fgMedian,
      p95: percentile(fgTimes, 95),
      p99: percentile(fgTimes, 99),
      min: Math.min(...fgTimes),
      max: Math.max(...fgTimes),
      resultCount: fgResults.length,
    },
    speedupVsGlob: globMedian / globlinMedian,
    speedupVsFg: fgMedian / globlinMedian,
    resultMatch,
  }
}

function profileMemory(pattern: string, cwd: string, options: BenchOptions = {}): MemoryProfile {
  forceGC()
  const memBefore = process.memoryUsage()

  // Run glob multiple times to get measurable memory impact
  for (let i = 0; i < 5; i++) {
    globSync(pattern, { ...options, cwd })
  }

  const memAfter = process.memoryUsage()

  return {
    pattern,
    heapUsedBefore: memBefore.heapUsed,
    heapUsedAfter: memAfter.heapUsed,
    heapDelta: memAfter.heapUsed - memBefore.heapUsed,
    externalBefore: memBefore.external,
    externalAfter: memAfter.external,
    externalDelta: memAfter.external - memBefore.external,
  }
}

function formatBytes(bytes: number): string {
  if (Math.abs(bytes) < 1024) return `${bytes}B`
  if (Math.abs(bytes) < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`
}

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('PHASE 7.1: COMPREHENSIVE SYNC API BENCHMARKING')
  console.log('='.repeat(80))

  const allResults: BenchmarkResult[] = []
  const memoryProfiles: MemoryProfile[] = []

  // Define test patterns
  const simplePatterns = ['*.js', '*.ts', '*.txt', '*.json', '*.md']

  const recursivePatterns = ['**/*.js', '**/*.ts', '**/*', '**/file*.js', '**/*.{js,ts}']

  const scopedPatterns = ['level0/**/*.js', 'level0/**/*.ts', 'level0/level1/**/*.js']

  const complexPatterns = [
    '**/*.{js,ts,tsx,jsx}', // brace expansion
    '**/*[0-9].js', // character class
    '**/level*/**/*.ts', // wildcard in directory
    'level{0,1,2}/**/*.js', // brace in path
  ]

  const optionCombinations: Array<{ name: string; opts: BenchOptions }> = [
    { name: 'default', opts: {} },
    { name: 'nodir', opts: { nodir: true } },
    { name: 'dot', opts: { dot: true } },
    { name: 'mark', opts: { mark: true } },
    { name: 'absolute', opts: { absolute: true } },
    { name: 'nodir+dot', opts: { nodir: true, dot: true } },
    { name: 'nodir+mark', opts: { nodir: true, mark: true } },
    { name: 'nodir+absolute', opts: { nodir: true, absolute: true } },
  ]

  const fixtures = [
    { name: 'small', cwd: SMALL_CWD },
    { name: 'medium', cwd: MEDIUM_CWD },
    { name: 'large', cwd: LARGE_CWD },
  ]

  // === Section 1: Simple Patterns ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 1: SIMPLE PATTERNS')
  console.log('-'.repeat(80))

  for (const fixture of fixtures) {
    console.log(`\n>>> Fixture: ${fixture.name.toUpperCase()} <<<\n`)
    console.log(
      'Pattern'.padEnd(20) +
        'Glob (ms)'.padStart(12) +
        'Globlin (ms)'.padStart(14) +
        'FG (ms)'.padStart(12) +
        'vs Glob'.padStart(10) +
        'vs FG'.padStart(10) +
        'Count'.padStart(10) +
        'Match'.padStart(8)
    )
    console.log('-'.repeat(96))

    for (const pattern of simplePatterns) {
      const result = await runBenchmark(pattern, fixture.cwd)
      allResults.push(result)
      console.log(
        pattern.padEnd(20) +
          result.glob.median.toFixed(2).padStart(12) +
          result.globlin.median.toFixed(2).padStart(14) +
          result.fastGlob.median.toFixed(2).padStart(12) +
          `${result.speedupVsGlob.toFixed(2)}x`.padStart(10) +
          `${result.speedupVsFg.toFixed(2)}x`.padStart(10) +
          result.globlin.resultCount.toString().padStart(10) +
          (result.resultMatch ? 'YES' : 'NO').padStart(8)
      )
    }
  }

  // === Section 2: Recursive Patterns ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 2: RECURSIVE PATTERNS')
  console.log('-'.repeat(80))

  for (const fixture of fixtures) {
    console.log(`\n>>> Fixture: ${fixture.name.toUpperCase()} <<<\n`)
    console.log(
      'Pattern'.padEnd(20) +
        'Glob (ms)'.padStart(12) +
        'Globlin (ms)'.padStart(14) +
        'FG (ms)'.padStart(12) +
        'vs Glob'.padStart(10) +
        'vs FG'.padStart(10) +
        'Count'.padStart(10) +
        'Match'.padStart(8)
    )
    console.log('-'.repeat(96))

    for (const pattern of recursivePatterns) {
      const result = await runBenchmark(pattern, fixture.cwd)
      allResults.push(result)
      console.log(
        pattern.padEnd(20) +
          result.glob.median.toFixed(2).padStart(12) +
          result.globlin.median.toFixed(2).padStart(14) +
          result.fastGlob.median.toFixed(2).padStart(12) +
          `${result.speedupVsGlob.toFixed(2)}x`.padStart(10) +
          `${result.speedupVsFg.toFixed(2)}x`.padStart(10) +
          result.globlin.resultCount.toString().padStart(10) +
          (result.resultMatch ? 'YES' : 'NO').padStart(8)
      )
    }
  }

  // === Section 3: Scoped Patterns ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 3: SCOPED PATTERNS')
  console.log('-'.repeat(80))

  for (const fixture of fixtures) {
    console.log(`\n>>> Fixture: ${fixture.name.toUpperCase()} <<<\n`)
    console.log(
      'Pattern'.padEnd(30) +
        'Glob (ms)'.padStart(12) +
        'Globlin (ms)'.padStart(14) +
        'FG (ms)'.padStart(12) +
        'vs Glob'.padStart(10) +
        'vs FG'.padStart(10) +
        'Count'.padStart(8)
    )
    console.log('-'.repeat(96))

    for (const pattern of scopedPatterns) {
      const result = await runBenchmark(pattern, fixture.cwd)
      allResults.push(result)
      console.log(
        pattern.padEnd(30) +
          result.glob.median.toFixed(2).padStart(12) +
          result.globlin.median.toFixed(2).padStart(14) +
          result.fastGlob.median.toFixed(2).padStart(12) +
          `${result.speedupVsGlob.toFixed(2)}x`.padStart(10) +
          `${result.speedupVsFg.toFixed(2)}x`.padStart(10) +
          result.globlin.resultCount.toString().padStart(8)
      )
    }
  }

  // === Section 4: Complex Patterns ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 4: COMPLEX PATTERNS')
  console.log('-'.repeat(80))

  for (const fixture of fixtures) {
    console.log(`\n>>> Fixture: ${fixture.name.toUpperCase()} <<<\n`)
    console.log(
      'Pattern'.padEnd(30) +
        'Glob (ms)'.padStart(12) +
        'Globlin (ms)'.padStart(14) +
        'FG (ms)'.padStart(12) +
        'vs Glob'.padStart(10) +
        'vs FG'.padStart(10) +
        'Count'.padStart(8)
    )
    console.log('-'.repeat(96))

    for (const pattern of complexPatterns) {
      const result = await runBenchmark(pattern, fixture.cwd)
      allResults.push(result)
      console.log(
        pattern.padEnd(30) +
          result.glob.median.toFixed(2).padStart(12) +
          result.globlin.median.toFixed(2).padStart(14) +
          result.fastGlob.median.toFixed(2).padStart(12) +
          `${result.speedupVsGlob.toFixed(2)}x`.padStart(10) +
          `${result.speedupVsFg.toFixed(2)}x`.padStart(10) +
          result.globlin.resultCount.toString().padStart(8)
      )
    }
  }

  // === Section 5: Option Combinations ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 5: OPTION COMBINATIONS (with **/*.js pattern)')
  console.log('-'.repeat(80))

  for (const fixture of fixtures) {
    console.log(`\n>>> Fixture: ${fixture.name.toUpperCase()} <<<\n`)
    console.log(
      'Options'.padEnd(20) +
        'Glob (ms)'.padStart(12) +
        'Globlin (ms)'.padStart(14) +
        'FG (ms)'.padStart(12) +
        'vs Glob'.padStart(10) +
        'vs FG'.padStart(10) +
        'Count'.padStart(8)
    )
    console.log('-'.repeat(86))

    for (const { name, opts } of optionCombinations) {
      const result = await runBenchmark('**/*.js', fixture.cwd, opts)
      allResults.push(result)
      console.log(
        name.padEnd(20) +
          result.glob.median.toFixed(2).padStart(12) +
          result.globlin.median.toFixed(2).padStart(14) +
          result.fastGlob.median.toFixed(2).padStart(12) +
          `${result.speedupVsGlob.toFixed(2)}x`.padStart(10) +
          `${result.speedupVsFg.toFixed(2)}x`.padStart(10) +
          result.globlin.resultCount.toString().padStart(8)
      )
    }
  }

  // === Section 6: Memory Profiling ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 6: MEMORY PROFILING (Large fixture)')
  console.log('-'.repeat(80))

  if (global.gc) {
    console.log('\n[GC available - running memory profiles]\n')
    console.log('Pattern'.padEnd(25) + 'Heap Delta'.padStart(15) + 'External Delta'.padStart(18))
    console.log('-'.repeat(58))

    const memPatterns = ['**/*.js', '**/*', '*.js', 'level0/**/*.js']
    for (const pattern of memPatterns) {
      const profile = profileMemory(pattern, LARGE_CWD)
      memoryProfiles.push(profile)
      console.log(
        pattern.padEnd(25) +
          formatBytes(profile.heapDelta).padStart(15) +
          formatBytes(profile.externalDelta).padStart(18)
      )
    }
  } else {
    console.log('\n[Run with --expose-gc for memory profiling]')
  }

  // === Section 7: Cold vs Warm Cache ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 7: COLD VS WARM CACHE (Medium fixture)')
  console.log('-'.repeat(80))

  const cachePattern = '**/*.js'
  const cacheCwd = MEDIUM_CWD

  // Cold run (no warmup)
  const coldStart = performance.now()
  globSync(cachePattern, { cwd: cacheCwd })
  const coldTime = performance.now() - coldStart

  // Warm runs
  const warmTimes: number[] = []
  for (let i = 0; i < 5; i++) {
    const start = performance.now()
    globSync(cachePattern, { cwd: cacheCwd })
    warmTimes.push(performance.now() - start)
  }
  const warmMedian = median(warmTimes)

  console.log(`\nCold run:  ${coldTime.toFixed(2)}ms`)
  console.log(`Warm runs: ${warmMedian.toFixed(2)}ms (median of 5)`)
  console.log(`Speedup:   ${(coldTime / warmMedian).toFixed(2)}x`)

  // === Section 8: P95/P99 Analysis ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 8: LATENCY PERCENTILES (Large fixture, 20 runs)')
  console.log('-'.repeat(80))

  const percentilePatterns = ['**/*.js', '*.js', 'level0/**/*.js']
  console.log('\nPattern'.padEnd(25) + 'Median'.padStart(10) + 'P95'.padStart(10) + 'P99'.padStart(10) + 'Max'.padStart(10))
  console.log('-'.repeat(65))

  for (const pattern of percentilePatterns) {
    const result = await runBenchmark(pattern, LARGE_CWD, {}, 20)
    console.log(
      pattern.padEnd(25) +
        `${result.globlin.median.toFixed(2)}`.padStart(10) +
        `${result.globlin.p95.toFixed(2)}`.padStart(10) +
        `${result.globlin.p99.toFixed(2)}`.padStart(10) +
        `${result.globlin.max.toFixed(2)}`.padStart(10)
    )
  }

  // === Summary ===
  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))

  // Calculate aggregate stats
  const byFixture: Record<string, BenchmarkResult[]> = {}
  for (const r of allResults) {
    if (!byFixture[r.fixture]) byFixture[r.fixture] = []
    byFixture[r.fixture].push(r)
  }

  console.log('\nAggregate by fixture:')
  console.log('Fixture'.padEnd(10) + 'Avg vs Glob'.padStart(15) + 'Avg vs FG'.padStart(15) + 'Faster than Glob'.padStart(20))
  console.log('-'.repeat(60))

  for (const [fixture, results] of Object.entries(byFixture)) {
    const avgVsGlob = results.reduce((sum, r) => sum + r.speedupVsGlob, 0) / results.length
    const avgVsFg = results.reduce((sum, r) => sum + r.speedupVsFg, 0) / results.length
    const fasterCount = results.filter((r) => r.speedupVsGlob > 1).length
    console.log(
      fixture.padEnd(10) +
        `${avgVsGlob.toFixed(2)}x`.padStart(15) +
        `${avgVsFg.toFixed(2)}x`.padStart(15) +
        `${fasterCount}/${results.length}`.padStart(20)
    )
  }

  // Result accuracy
  const totalMatches = allResults.filter((r) => r.resultMatch).length
  console.log(`\nResult accuracy: ${totalMatches}/${allResults.length} patterns match glob results`)

  // Best and worst patterns
  const sortedBySpeedup = [...allResults].sort((a, b) => b.speedupVsGlob - a.speedupVsGlob)
  console.log('\nTop 5 patterns (vs glob):')
  for (let i = 0; i < Math.min(5, sortedBySpeedup.length); i++) {
    const r = sortedBySpeedup[i]
    console.log(`  ${r.speedupVsGlob.toFixed(2)}x - ${r.pattern} (${r.fixture})`)
  }

  console.log('\nBottom 5 patterns (vs glob):')
  for (let i = Math.max(0, sortedBySpeedup.length - 5); i < sortedBySpeedup.length; i++) {
    const r = sortedBySpeedup[i]
    console.log(`  ${r.speedupVsGlob.toFixed(2)}x - ${r.pattern} (${r.fixture})`)
  }

  console.log('\n' + '='.repeat(80))
  console.log('END OF SYNC API BENCHMARK')
  console.log('='.repeat(80) + '\n')
}

main().catch(console.error)
