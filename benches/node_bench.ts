/**
 * Node.js benchmarks for globlin
 *
 * These benchmarks measure:
 * 1. glob (reference implementation) baseline performance
 * 2. fast-glob for comparison
 * 3. globlin once implemented
 *
 * Run with: npx tsx benches/node_bench.ts
 * Or: npm run bench:node
 *
 * Fixtures must be generated first: node benches/setup-fixtures.js
 */

import { globSync } from 'glob'
import fg from 'fast-glob'
import { existsSync } from 'fs'
import { join } from 'path'

// Configuration
const WARMUP_RUNS = 3
const BENCHMARK_RUNS = 10
const FIXTURES_BASE = join(__dirname, 'fixtures')

interface BenchmarkResult {
  name: string
  pattern: string
  fixture: string
  times: number[]
  mean: number
  min: number
  max: number
  stdDev: number
  resultCount: number
}

interface ComparisonResult {
  pattern: string
  fixture: string
  glob: BenchmarkResult
  fastGlob: BenchmarkResult
  globlin?: BenchmarkResult
  speedup: {
    fastGlobVsGlob: number
    globlinVsGlob?: number
    globlinVsFastGlob?: number
  }
}

function measureTime(fn: () => unknown): { time: number; result: unknown } {
  const start = performance.now()
  const result = fn()
  const time = performance.now() - start
  return { time, result }
}

function calculateStats(times: number[]): {
  mean: number
  min: number
  max: number
  stdDev: number
} {
  const mean = times.reduce((a, b) => a + b, 0) / times.length
  const min = Math.min(...times)
  const max = Math.max(...times)
  const variance = times.reduce((acc, t) => acc + Math.pow(t - mean, 2), 0) / times.length
  const stdDev = Math.sqrt(variance)
  return { mean, min, max, stdDev }
}

function runBenchmark(
  name: string,
  pattern: string,
  fixture: string,
  fn: () => unknown
): BenchmarkResult {
  // Warmup
  for (let i = 0; i < WARMUP_RUNS; i++) {
    fn()
  }

  // Benchmark runs
  const times: number[] = []
  let resultCount = 0

  for (let i = 0; i < BENCHMARK_RUNS; i++) {
    const { time, result } = measureTime(fn)
    times.push(time)
    if (Array.isArray(result)) {
      resultCount = result.length
    }
  }

  const stats = calculateStats(times)

  return {
    name,
    pattern,
    fixture,
    times,
    ...stats,
    resultCount,
  }
}

function formatTime(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(2)}us`
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}

function formatSpeedup(speedup: number): string {
  if (speedup >= 1) {
    return `${speedup.toFixed(1)}x faster`
  }
  return `${(1 / speedup).toFixed(1)}x slower`
}

// Patterns to benchmark
const PATTERNS = [
  { name: 'simple_txt', pattern: '*.txt' },
  { name: 'simple_js', pattern: '*.js' },
  { name: 'recursive_all', pattern: '**/*' },
  { name: 'recursive_js', pattern: '**/*.js' },
  { name: 'recursive_ts', pattern: '**/*.ts' },
  { name: 'scoped_js', pattern: 'level0/**/*.js' },
  { name: 'brace_ext', pattern: '**/*.{js,ts}' },
  { name: 'char_class', pattern: '**/*[0-9].js' },
  { name: 'question_mark', pattern: '**/file?.js' },
  { name: 'deep_scoped', pattern: '**/level1/**/*.ts' },
]

async function benchmarkFixture(fixtureName: string): Promise<ComparisonResult[]> {
  const fixture = join(FIXTURES_BASE, fixtureName)

  if (!existsSync(fixture)) {
    console.error(`Fixture not found: ${fixture}`)
    console.error('Run: node benches/setup-fixtures.js')
    process.exit(1)
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Benchmarking fixture: ${fixtureName}`)
  console.log('='.repeat(60))

  const results: ComparisonResult[] = []

  for (const { name, pattern } of PATTERNS) {
    console.log(`\nPattern: ${pattern} (${name})`)
    console.log('-'.repeat(40))

    // Benchmark glob
    const globResult = runBenchmark('glob', pattern, fixtureName, () =>
      globSync(pattern, { cwd: fixture })
    )
    console.log(`  glob:      ${formatTime(globResult.mean)} (${globResult.resultCount} results)`)

    // Benchmark fast-glob
    const fgResult = runBenchmark('fast-glob', pattern, fixtureName, () =>
      fg.sync(pattern, { cwd: fixture })
    )
    console.log(`  fast-glob: ${formatTime(fgResult.mean)} (${fgResult.resultCount} results)`)

    // TODO: Benchmark globlin once implemented
    // const globlinResult = runBenchmark('globlin', pattern, fixtureName, () =>
    //   globlinSync(pattern, { cwd: fixture })
    // );
    // console.log(`  globlin:   ${formatTime(globlinResult.mean)} (${globlinResult.resultCount} results)`);

    const speedupFgVsGlob = globResult.mean / fgResult.mean
    console.log(`  fast-glob vs glob: ${formatSpeedup(speedupFgVsGlob)}`)

    results.push({
      pattern,
      fixture: fixtureName,
      glob: globResult,
      fastGlob: fgResult,
      speedup: {
        fastGlobVsGlob: speedupFgVsGlob,
      },
    })
  }

  return results
}

function printSummary(allResults: ComparisonResult[]): void {
  console.log(`\n${'='.repeat(60)}`)
  console.log('SUMMARY')
  console.log('='.repeat(60))

  // Group by fixture
  const byFixture = new Map<string, ComparisonResult[]>()
  for (const result of allResults) {
    const existing = byFixture.get(result.fixture) || []
    existing.push(result)
    byFixture.set(result.fixture, existing)
  }

  for (const [fixture, results] of byFixture) {
    console.log(`\n${fixture}:`)
    console.log('-'.repeat(40))

    const globMean = results.reduce((acc, r) => acc + r.glob.mean, 0) / results.length
    const fgMean = results.reduce((acc, r) => acc + r.fastGlob.mean, 0) / results.length
    const avgSpeedup =
      results.reduce((acc, r) => acc + r.speedup.fastGlobVsGlob, 0) / results.length

    console.log(`  Average glob time:      ${formatTime(globMean)}`)
    console.log(`  Average fast-glob time: ${formatTime(fgMean)}`)
    console.log(`  Average speedup (fg/g): ${avgSpeedup.toFixed(2)}x`)
  }

  // Print table
  console.log(`\n${'='.repeat(60)}`)
  console.log('DETAILED RESULTS TABLE')
  console.log('='.repeat(60))
  console.log('\n| Fixture | Pattern | glob | fast-glob | fg vs glob | Results |')
  console.log('|---------|---------|------|-----------|------------|---------|')

  for (const r of allResults) {
    console.log(
      `| ${r.fixture.padEnd(7)} | ${r.pattern.padEnd(20)} | ${formatTime(r.glob.mean).padEnd(8)} | ${formatTime(r.fastGlob.mean).padEnd(8)} | ${formatSpeedup(r.speedup.fastGlobVsGlob).padEnd(12)} | ${r.glob.resultCount.toString().padEnd(7)} |`
    )
  }
}

async function main(): Promise<void> {
  console.log('Node.js Glob Benchmarks')
  console.log('=======================\n')
  console.log(`Warmup runs: ${WARMUP_RUNS}`)
  console.log(`Benchmark runs: ${BENCHMARK_RUNS}`)
  console.log(`Fixtures base: ${FIXTURES_BASE}`)

  const allResults: ComparisonResult[] = []

  // Determine which fixtures to run based on CLI args
  const args = process.argv.slice(2)
  let fixtures = ['small', 'medium']

  if (args.includes('--all') || args.includes('-a')) {
    fixtures = ['small', 'medium', 'large']
  } else if (args.includes('--small') || args.includes('-s')) {
    fixtures = ['small']
  } else if (args.includes('--medium') || args.includes('-m')) {
    fixtures = ['medium']
  } else if (args.includes('--large') || args.includes('-l')) {
    fixtures = ['large']
  }

  for (const fixture of fixtures) {
    const fixtureResults = await benchmarkFixture(fixture)
    allResults.push(...fixtureResults)
  }

  printSummary(allResults)

  // Output JSON for CI
  if (args.includes('--json')) {
    const jsonOutput = JSON.stringify(allResults, null, 2)
    console.log('\nJSON Output:')
    console.log(jsonOutput)
  }
}

main().catch(console.error)
