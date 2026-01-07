/**
 * Phase 7.2: Comprehensive Async API (`glob`) Benchmarking
 *
 * This benchmark performs a deep dive analysis of the async API:
 * - All patterns with async API (simple, recursive, scoped, complex)
 * - Concurrent async operations (10, 50, 100 parallel)
 * - AbortSignal overhead measurement
 * - Promise resolution timing
 * - Event loop impact analysis
 *
 * Compare: globlin async vs glob async vs fast-glob async
 * Measure: Time to first result, time to completion, event loop latency,
 *          concurrent throughput, AbortSignal overhead
 */

import { glob as ogGlob } from 'glob'
import { glob } from '../../js/index.js'
import fg from 'fast-glob'

interface BenchOptions {
  cwd?: string
  nodir?: boolean
  dot?: boolean
  mark?: boolean
  absolute?: boolean
  signal?: AbortSignal
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

interface ConcurrencyResult {
  concurrency: number
  pattern: string
  fixture: string
  glob: {
    totalTime: number
    avgPerOp: number
    throughput: number
  }
  globlin: {
    totalTime: number
    avgPerOp: number
    throughput: number
  }
  fastGlob: {
    totalTime: number
    avgPerOp: number
    throughput: number
  }
  speedupVsGlob: number
  speedupVsFg: number
}

interface AbortSignalResult {
  scenario: string
  withSignal: number
  withoutSignal: number
  overhead: number
  overheadPercent: number
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

async function runAsyncBenchmark(
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
    await ogGlob(pattern, ogOptions)
    await glob(pattern, globlinOptions)
    await fg(pattern, fgOptions)
  }

  // Benchmark glob
  const globTimes: number[] = []
  let globResults: string[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    globResults = await ogGlob(pattern, ogOptions)
    globTimes.push(performance.now() - start)
  }

  // Benchmark globlin
  const globlinTimes: number[] = []
  let globlinResults: string[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    globlinResults = await glob(pattern, globlinOptions)
    globlinTimes.push(performance.now() - start)
  }

  // Benchmark fast-glob
  const fgTimes: number[] = []
  let fgResults: string[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    fgResults = await fg(pattern, fgOptions)
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

async function runConcurrencyBenchmark(
  pattern: string,
  cwd: string,
  concurrency: number
): Promise<ConcurrencyResult> {
  const ogOptions = { cwd }
  const globlinOptions = { cwd }
  const fgOptions = { cwd }

  // Warmup
  await Promise.all([ogGlob(pattern, ogOptions), glob(pattern, globlinOptions), fg(pattern, fgOptions)])

  // Benchmark glob - concurrent operations
  const globStart = performance.now()
  await Promise.all(Array(concurrency).fill(0).map(() => ogGlob(pattern, ogOptions)))
  const globTotal = performance.now() - globStart

  // Benchmark globlin - concurrent operations
  const globlinStart = performance.now()
  await Promise.all(Array(concurrency).fill(0).map(() => glob(pattern, globlinOptions)))
  const globlinTotal = performance.now() - globlinStart

  // Benchmark fast-glob - concurrent operations
  const fgStart = performance.now()
  await Promise.all(Array(concurrency).fill(0).map(() => fg(pattern, fgOptions)))
  const fgTotal = performance.now() - fgStart

  const fixtureLabel = cwd.includes('small')
    ? 'small'
    : cwd.includes('medium')
      ? 'medium'
      : cwd.includes('large')
        ? 'large'
        : 'unknown'

  return {
    concurrency,
    pattern,
    fixture: fixtureLabel,
    glob: {
      totalTime: globTotal,
      avgPerOp: globTotal / concurrency,
      throughput: (concurrency / globTotal) * 1000, // ops/sec
    },
    globlin: {
      totalTime: globlinTotal,
      avgPerOp: globlinTotal / concurrency,
      throughput: (concurrency / globlinTotal) * 1000,
    },
    fastGlob: {
      totalTime: fgTotal,
      avgPerOp: fgTotal / concurrency,
      throughput: (concurrency / fgTotal) * 1000,
    },
    speedupVsGlob: globTotal / globlinTotal,
    speedupVsFg: fgTotal / globlinTotal,
  }
}

async function measureAbortSignalOverhead(
  pattern: string,
  cwd: string,
  runs = 10
): Promise<AbortSignalResult> {
  const warmupRuns = 3

  // Warmup
  for (let i = 0; i < warmupRuns; i++) {
    await glob(pattern, { cwd })
    const controller = new AbortController()
    await glob(pattern, { cwd, signal: controller.signal })
  }

  // Without signal
  const withoutSignalTimes: number[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    await glob(pattern, { cwd })
    withoutSignalTimes.push(performance.now() - start)
  }

  // With signal (not aborted)
  const withSignalTimes: number[] = []
  for (let i = 0; i < runs; i++) {
    const controller = new AbortController()
    const start = performance.now()
    await glob(pattern, { cwd, signal: controller.signal })
    withSignalTimes.push(performance.now() - start)
  }

  const withoutMedian = median(withoutSignalTimes)
  const withMedian = median(withSignalTimes)
  const overhead = withMedian - withoutMedian
  const overheadPercent = (overhead / withoutMedian) * 100

  return {
    scenario: `${pattern} on ${cwd.includes('medium') ? 'medium' : 'large'}`,
    withSignal: withMedian,
    withoutSignal: withoutMedian,
    overhead,
    overheadPercent,
  }
}

async function measureEventLoopLatency(
  pattern: string,
  cwd: string,
  intervalMs = 10
): Promise<{ avgLatency: number; maxLatency: number; samples: number }> {
  const latencies: number[] = []
  let running = true

  // Start latency monitor
  const monitor = async () => {
    while (running) {
      const expected = intervalMs
      const start = performance.now()
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
      const actual = performance.now() - start
      latencies.push(actual - expected)
    }
  }

  const monitorPromise = monitor()

  // Run the glob operation
  await glob(pattern, { cwd })

  running = false
  await new Promise((resolve) => setTimeout(resolve, 20)) // Allow monitor to exit

  return {
    avgLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0,
    samples: latencies.length,
  }
}

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('PHASE 7.2: COMPREHENSIVE ASYNC API BENCHMARKING')
  console.log('='.repeat(80))

  const allResults: BenchmarkResult[] = []
  const concurrencyResults: ConcurrencyResult[] = []
  const abortResults: AbortSignalResult[] = []

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

  const fixtures = [
    { name: 'small', cwd: SMALL_CWD },
    { name: 'medium', cwd: MEDIUM_CWD },
    { name: 'large', cwd: LARGE_CWD },
  ]

  // === Section 1: Simple Patterns (Async) ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 1: SIMPLE PATTERNS (ASYNC)')
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
      const result = await runAsyncBenchmark(pattern, fixture.cwd)
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

  // === Section 2: Recursive Patterns (Async) ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 2: RECURSIVE PATTERNS (ASYNC)')
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
      const result = await runAsyncBenchmark(pattern, fixture.cwd)
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

  // === Section 3: Scoped Patterns (Async) ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 3: SCOPED PATTERNS (ASYNC)')
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
      const result = await runAsyncBenchmark(pattern, fixture.cwd)
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

  // === Section 4: Complex Patterns (Async) ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 4: COMPLEX PATTERNS (ASYNC)')
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
      const result = await runAsyncBenchmark(pattern, fixture.cwd)
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

  // === Section 5: Concurrent Operations ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 5: CONCURRENT ASYNC OPERATIONS')
  console.log('-'.repeat(80))

  const concurrencyLevels = [10, 25, 50, 100]
  const concurrencyPattern = '**/*.js'

  for (const fixture of [
    { name: 'small', cwd: SMALL_CWD },
    { name: 'medium', cwd: MEDIUM_CWD },
  ]) {
    console.log(`\n>>> Fixture: ${fixture.name.toUpperCase()} <<<\n`)
    console.log(
      'Concurrency'.padEnd(15) +
        'Glob Total'.padStart(12) +
        'Globlin Total'.padStart(15) +
        'FG Total'.padStart(12) +
        'vs Glob'.padStart(10) +
        'vs FG'.padStart(10) +
        'Throughput'.padStart(12)
    )
    console.log('-'.repeat(86))

    for (const concurrency of concurrencyLevels) {
      const result = await runConcurrencyBenchmark(concurrencyPattern, fixture.cwd, concurrency)
      concurrencyResults.push(result)
      console.log(
        `${concurrency}`.padEnd(15) +
          `${result.glob.totalTime.toFixed(0)}ms`.padStart(12) +
          `${result.globlin.totalTime.toFixed(0)}ms`.padStart(15) +
          `${result.fastGlob.totalTime.toFixed(0)}ms`.padStart(12) +
          `${result.speedupVsGlob.toFixed(2)}x`.padStart(10) +
          `${result.speedupVsFg.toFixed(2)}x`.padStart(10) +
          `${result.globlin.throughput.toFixed(0)}/s`.padStart(12)
      )
    }
  }

  // === Section 6: AbortSignal Overhead ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 6: ABORTSIGNAL OVERHEAD')
  console.log('-'.repeat(80))

  const abortPatterns = ['**/*.js', '*.js', 'level0/**/*.js']

  console.log(
    '\nScenario'.padEnd(40) +
      'Without Signal'.padStart(18) +
      'With Signal'.padStart(15) +
      'Overhead'.padStart(12) +
      'Overhead %'.padStart(12)
  )
  console.log('-'.repeat(97))

  for (const pattern of abortPatterns) {
    for (const cwd of [MEDIUM_CWD, LARGE_CWD]) {
      const result = await measureAbortSignalOverhead(pattern, cwd)
      abortResults.push(result)
      console.log(
        result.scenario.padEnd(40) +
          `${result.withoutSignal.toFixed(2)}ms`.padStart(18) +
          `${result.withSignal.toFixed(2)}ms`.padStart(15) +
          `${result.overhead.toFixed(2)}ms`.padStart(12) +
          `${result.overheadPercent.toFixed(1)}%`.padStart(12)
      )
    }
  }

  // === Section 7: Event Loop Impact ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 7: EVENT LOOP IMPACT')
  console.log('-'.repeat(80))

  console.log('\nMeasuring event loop latency during async glob operations...\n')
  console.log('Pattern'.padEnd(25) + 'Avg Latency'.padStart(15) + 'Max Latency'.padStart(15) + 'Samples'.padStart(10))
  console.log('-'.repeat(65))

  const eventLoopPatterns = ['**/*.js', '**/*']
  for (const pattern of eventLoopPatterns) {
    const result = await measureEventLoopLatency(pattern, MEDIUM_CWD)
    console.log(
      pattern.padEnd(25) +
        `${result.avgLatency.toFixed(2)}ms`.padStart(15) +
        `${result.maxLatency.toFixed(2)}ms`.padStart(15) +
        result.samples.toString().padStart(10)
    )
  }

  // === Section 8: P95/P99 Latency Analysis ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 8: ASYNC LATENCY PERCENTILES (Large fixture, 20 runs)')
  console.log('-'.repeat(80))

  const percentilePatterns = ['**/*.js', '*.js', 'level0/**/*.js']
  console.log('\nPattern'.padEnd(25) + 'Median'.padStart(10) + 'P95'.padStart(10) + 'P99'.padStart(10) + 'Max'.padStart(10))
  console.log('-'.repeat(65))

  for (const pattern of percentilePatterns) {
    const result = await runAsyncBenchmark(pattern, LARGE_CWD, {}, 20)
    console.log(
      pattern.padEnd(25) +
        `${result.globlin.median.toFixed(2)}`.padStart(10) +
        `${result.globlin.p95.toFixed(2)}`.padStart(10) +
        `${result.globlin.p99.toFixed(2)}`.padStart(10) +
        `${result.globlin.max.toFixed(2)}`.padStart(10)
    )
  }

  // === Section 9: Async vs Sync Comparison ===
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 9: ASYNC VS SYNC OVERHEAD (comparing with sync benchmark)')
  console.log('-'.repeat(80))

  // Import sync version for comparison
  const { globSync } = await import('../../js/index.js')

  console.log('\n[Globlin] Pattern'.padEnd(25) + 'Sync (ms)'.padStart(12) + 'Async (ms)'.padStart(12) + 'Overhead'.padStart(12))
  console.log('-'.repeat(61))

  for (const pattern of ['**/*.js', '*.js', 'level0/**/*.js']) {
    // Warmup
    globSync(pattern, { cwd: MEDIUM_CWD })
    await glob(pattern, { cwd: MEDIUM_CWD })

    const syncTimes: number[] = []
    const asyncTimes: number[] = []

    for (let i = 0; i < 10; i++) {
      const syncStart = performance.now()
      globSync(pattern, { cwd: MEDIUM_CWD })
      syncTimes.push(performance.now() - syncStart)

      const asyncStart = performance.now()
      await glob(pattern, { cwd: MEDIUM_CWD })
      asyncTimes.push(performance.now() - asyncStart)
    }

    const syncMedian = median(syncTimes)
    const asyncMedian = median(asyncTimes)
    const overhead = ((asyncMedian - syncMedian) / syncMedian) * 100

    console.log(
      pattern.padEnd(25) +
        `${syncMedian.toFixed(2)}`.padStart(12) +
        `${asyncMedian.toFixed(2)}`.padStart(12) +
        `${overhead >= 0 ? '+' : ''}${overhead.toFixed(1)}%`.padStart(12)
    )
  }

  // === Summary ===
  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))

  // Calculate aggregate stats by fixture
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

  // Concurrency summary
  console.log('\nConcurrency scaling (medium fixture, **/*.js):')
  const mediumConcurrency = concurrencyResults.filter((r) => r.fixture === 'medium')
  for (const r of mediumConcurrency) {
    console.log(`  ${r.concurrency.toString().padEnd(3)} concurrent: ${r.speedupVsGlob.toFixed(2)}x vs glob, throughput ${r.globlin.throughput.toFixed(0)}/s`)
  }

  // AbortSignal overhead summary
  const avgAbortOverhead = abortResults.reduce((sum, r) => sum + r.overheadPercent, 0) / abortResults.length
  console.log(`\nAbortSignal average overhead: ${avgAbortOverhead.toFixed(1)}%`)

  // Best and worst patterns
  const sortedBySpeedup = [...allResults].sort((a, b) => b.speedupVsGlob - a.speedupVsGlob)
  console.log('\nTop 5 async patterns (vs glob):')
  for (let i = 0; i < Math.min(5, sortedBySpeedup.length); i++) {
    const r = sortedBySpeedup[i]
    console.log(`  ${r.speedupVsGlob.toFixed(2)}x - ${r.pattern} (${r.fixture})`)
  }

  console.log('\nBottom 5 async patterns (vs glob):')
  for (let i = Math.max(0, sortedBySpeedup.length - 5); i < sortedBySpeedup.length; i++) {
    const r = sortedBySpeedup[i]
    console.log(`  ${r.speedupVsGlob.toFixed(2)}x - ${r.pattern} (${r.fixture})`)
  }

  console.log('\n' + '='.repeat(80))
  console.log('END OF ASYNC API BENCHMARK')
  console.log('='.repeat(80) + '\n')
}

main().catch(console.error)
