/**
 * Proof of Concept Benchmark Suite
 *
 * Compares globlin vs glob v13 vs fast-glob on three key patterns:
 * 1. *.txt (simple)
 * 2. **\/*.js (recursive)
 * 3. src/**\/*.ts (scoped recursive - simulated with level0/**\/*.ts)
 *
 * Run with: npm run bench:poc
 *
 * Fixtures must be generated first: npm run bench:setup
 */

import { globSync as globlinSync, glob as globlinAsync } from '../js/index.js'
import { globSync as globOriginalSync, glob as globOriginalAsync } from 'glob'
import fg from 'fast-glob'
import { existsSync } from 'fs'
import { join } from 'path'

// Configuration
const WARMUP_RUNS = 5
const BENCHMARK_RUNS = 20
const FIXTURES_BASE = join(import.meta.dirname ?? __dirname, 'fixtures')

interface BenchResult {
  name: string
  times: number[]
  mean: number
  min: number
  max: number
  stdDev: number
  resultCount: number
}

interface PatternResult {
  pattern: string
  patternType: string
  glob: BenchResult
  fastGlob: BenchResult
  globlin: BenchResult
  speedup: {
    globlinVsGlob: number
    globlinVsFastGlob: number
    fastGlobVsGlob: number
  }
  resultsMatch: boolean
}

function measureSync(fn: () => unknown): { time: number; result: unknown } {
  const start = performance.now()
  const result = fn()
  const end = performance.now()
  return { time: end - start, result }
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
  const variance = times.reduce((acc, t) => acc + (t - mean) ** 2, 0) / times.length
  const stdDev = Math.sqrt(variance)
  return { mean, min, max, stdDev }
}

function runBenchmark(name: string, fn: () => unknown): BenchResult {
  // Warmup
  for (let i = 0; i < WARMUP_RUNS; i++) {
    fn()
  }

  // Benchmark runs
  const times: number[] = []
  let resultCount = 0

  for (let i = 0; i < BENCHMARK_RUNS; i++) {
    const { time, result } = measureSync(fn)
    times.push(time)
    if (Array.isArray(result)) {
      resultCount = result.length
    }
  }

  const stats = calculateStats(times)

  return {
    name,
    times,
    ...stats,
    resultCount,
  }
}

function formatTime(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(1)}us`
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

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

// PoC Patterns: 3 key patterns as specified in the plan
const POC_PATTERNS = [
  { name: 'simple', pattern: '*.txt', description: 'Simple extension match' },
  { name: 'recursive', pattern: '**/*.js', description: 'Recursive glob' },
  { name: 'scoped', pattern: 'level0/**/*.ts', description: 'Scoped recursive' },
]

async function runPoCBenchmark(fixtureName: string): Promise<PatternResult[]> {
  const fixture = join(FIXTURES_BASE, fixtureName)

  if (!existsSync(fixture)) {
    console.error(`Fixture not found: ${fixture}`)
    console.error('Run: npm run bench:setup')
    process.exit(1)
  }

  console.log(`\n${'='.repeat(70)}`)
  console.log(`  PROOF OF CONCEPT BENCHMARK - ${fixtureName} fixture`)
  console.log('='.repeat(70))

  const results: PatternResult[] = []

  for (const { name, pattern, description } of POC_PATTERNS) {
    console.log(`\n  Pattern: ${pattern}`)
    console.log(`  Type: ${description}`)
    console.log('  ' + '-'.repeat(66))

    // Run glob (reference)
    const globResult = runBenchmark('glob', () => globOriginalSync(pattern, { cwd: fixture }))

    // Run fast-glob
    const fgResult = runBenchmark('fast-glob', () => fg.sync(pattern, { cwd: fixture }))

    // Run globlin
    const globlinResult = runBenchmark('globlin', () => globlinSync(pattern, { cwd: fixture }))

    // Verify results match
    const globSet = new Set(
      globResult.resultCount > 0 ? globOriginalSync(pattern, { cwd: fixture }) : []
    )
    const globlinSet = new Set(
      globlinResult.resultCount > 0 ? globlinSync(pattern, { cwd: fixture }) : []
    )
    const resultsMatch = setsEqual(globSet, globlinSet)

    // Calculate speedups
    const speedup = {
      globlinVsGlob: globResult.mean / globlinResult.mean,
      globlinVsFastGlob: fgResult.mean / globlinResult.mean,
      fastGlobVsGlob: globResult.mean / fgResult.mean,
    }

    // Print results
    console.log(
      `  glob:      ${formatTime(globResult.mean).padEnd(10)} (${globResult.resultCount} results)`
    )
    console.log(
      `  fast-glob: ${formatTime(fgResult.mean).padEnd(10)} (${fgResult.resultCount} results)`
    )
    console.log(
      `  globlin:   ${formatTime(globlinResult.mean).padEnd(10)} (${globlinResult.resultCount} results)`
    )
    console.log()
    console.log(`  globlin vs glob:      ${formatSpeedup(speedup.globlinVsGlob)}`)
    console.log(`  globlin vs fast-glob: ${formatSpeedup(speedup.globlinVsFastGlob)}`)

    if (!resultsMatch) {
      console.log(
        `  WARNING: Results don't match! glob=${globSet.size}, globlin=${globlinSet.size}`
      )
    }

    results.push({
      pattern,
      patternType: name,
      glob: globResult,
      fastGlob: fgResult,
      globlin: globlinResult,
      speedup,
      resultsMatch,
    })
  }

  return results
}

function printSummary(results: PatternResult[]): void {
  console.log(`\n${'='.repeat(70)}`)
  console.log('  SUMMARY')
  console.log('='.repeat(70))

  // Calculate averages
  const avgGloblinVsGlob =
    results.reduce((acc, r) => acc + r.speedup.globlinVsGlob, 0) / results.length
  const avgGloblinVsFg =
    results.reduce((acc, r) => acc + r.speedup.globlinVsFastGlob, 0) / results.length

  console.log(`\n  Average globlin vs glob:      ${avgGloblinVsGlob.toFixed(1)}x faster`)
  console.log(`  Average globlin vs fast-glob: ${avgGloblinVsFg.toFixed(1)}x faster`)

  // Table
  console.log(
    `\n  ${'Pattern'.padEnd(18)} | ${'glob'.padEnd(10)} | ${'fast-glob'.padEnd(10)} | ${'globlin'.padEnd(10)} | ${'Speedup'.padEnd(12)} | Results`
  )
  console.log('  ' + '-'.repeat(76))

  for (const r of results) {
    const speedupStr = `${r.speedup.globlinVsGlob.toFixed(1)}x`
    const matchStr = r.resultsMatch ? 'match' : 'MISMATCH'
    console.log(
      `  ${r.pattern.padEnd(18)} | ${formatTime(r.glob.mean).padEnd(10)} | ${formatTime(r.fastGlob.mean).padEnd(10)} | ${formatTime(r.globlin.mean).padEnd(10)} | ${speedupStr.padEnd(12)} | ${matchStr}`
    )
  }

  // Phase 1 Target Check
  const minSpeedup = Math.min(...results.map(r => r.speedup.globlinVsGlob))
  console.log(`\n  ${'='.repeat(66)}`)
  console.log(`  Phase 1 Target: 5-10x speedup on simple patterns`)
  console.log(`  Minimum speedup achieved: ${minSpeedup.toFixed(1)}x`)

  if (minSpeedup >= 5) {
    console.log(`  STATUS: PASS - Target achieved!`)
  } else if (minSpeedup >= 3) {
    console.log(`  STATUS: CLOSE - ${(((5 - minSpeedup) / 5) * 100).toFixed(0)}% below target`)
  } else {
    console.log(
      `  STATUS: NEEDS IMPROVEMENT - ${(((5 - minSpeedup) / 5) * 100).toFixed(0)}% below target`
    )
  }
  console.log('  ' + '='.repeat(66))
}

async function main(): Promise<void> {
  console.log('\n  GLOBLIN PROOF OF CONCEPT BENCHMARK')
  console.log('  ' + '='.repeat(66))
  console.log(`  Warmup runs: ${WARMUP_RUNS}`)
  console.log(`  Benchmark runs: ${BENCHMARK_RUNS}`)

  // Run on different fixture sizes
  const args = process.argv.slice(2)
  let fixtures = ['small']

  if (args.includes('--all') || args.includes('-a')) {
    fixtures = ['small', 'medium', 'large']
  } else if (args.includes('--medium') || args.includes('-m')) {
    fixtures = ['medium']
  } else if (args.includes('--large') || args.includes('-l')) {
    fixtures = ['large']
  }

  const allResults: PatternResult[] = []

  for (const fixture of fixtures) {
    const fixtureResults = await runPoCBenchmark(fixture)
    allResults.push(...fixtureResults)
  }

  printSummary(allResults)

  // JSON output for CI
  if (args.includes('--json')) {
    console.log('\nJSON Output:')
    console.log(JSON.stringify(allResults, null, 2))
  }
}

main().catch(console.error)
