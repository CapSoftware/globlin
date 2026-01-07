/**
 * Benchmark to test lock-free cache performance
 * 
 * Tests:
 * 1. Single-threaded repeated cache access
 * 2. Concurrent cache access (simulated via Promise.all)
 * 3. Cache hit rate comparison
 */

import { globSync } from '../../js/index.js'
import { globSync as ogGlobSync } from 'glob'

const MEDIUM_CWD = './benches/fixtures/medium'
const LARGE_CWD = './benches/fixtures/large'
const PATTERN = '**/*.js'

interface BenchResult {
  name: string
  time: number
  ops: number
  results: number
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

async function benchSingleThreaded(
  name: string,
  fn: () => unknown[],
  iterations: number
): Promise<BenchResult> {
  // Warmup
  for (let i = 0; i < 3; i++) fn()

  const times: number[] = []
  let results = 0

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    const r = fn()
    times.push(performance.now() - start)
    results = r.length
  }

  return {
    name,
    time: median(times),
    ops: iterations,
    results,
  }
}

async function benchConcurrent(
  name: string,
  fn: () => Promise<unknown[]>,
  concurrency: number,
  batches: number
): Promise<BenchResult> {
  // Warmup
  await Promise.all(Array(3).fill(0).map(() => fn()))

  const times: number[] = []
  let results = 0

  for (let batch = 0; batch < batches; batch++) {
    const start = performance.now()
    const allResults = await Promise.all(
      Array(concurrency).fill(0).map(() => fn())
    )
    times.push(performance.now() - start)
    results = allResults[0].length
  }

  return {
    name,
    time: median(times),
    ops: concurrency * batches,
    results,
  }
}

async function main() {
  console.log('=' .repeat(80))
  console.log('LOCK-FREE CACHE BENCHMARK')
  console.log('=' .repeat(80))
  console.log('')

  // =========================================================================
  // Test 1: Repeated single-threaded access (cache hit scenario)
  // =========================================================================
  console.log('### Test 1: Repeated Single-Threaded Access (Cache Hit Scenario) ###\n')
  console.log('This tests repeated glob operations on the same directory.')
  console.log('With lock-free reads, we should see better performance on cache hits.\n')

  const iterations = 50

  // With cache enabled
  const globlinCached = await benchSingleThreaded(
    'globlin (cache: true)',
    () => globSync(PATTERN, { cwd: MEDIUM_CWD, cache: true }),
    iterations
  )

  // Without cache
  const globlinUncached = await benchSingleThreaded(
    'globlin (cache: false)',
    () => globSync(PATTERN, { cwd: MEDIUM_CWD, cache: false }),
    iterations
  )

  // Original glob
  const globOriginal = await benchSingleThreaded(
    'glob (original)',
    () => ogGlobSync(PATTERN, { cwd: MEDIUM_CWD }),
    iterations
  )

  console.log(`${'Library'.padEnd(30)} ${'Median Time'.padStart(12)} ${'Results'.padStart(10)} ${'vs glob'.padStart(10)}`)
  console.log('-'.repeat(65))
  console.log(`${globlinCached.name.padEnd(30)} ${globlinCached.time.toFixed(2).padStart(9)}ms ${globlinCached.results.toString().padStart(10)} ${(globOriginal.time / globlinCached.time).toFixed(2).padStart(9)}x`)
  console.log(`${globlinUncached.name.padEnd(30)} ${globlinUncached.time.toFixed(2).padStart(9)}ms ${globlinUncached.results.toString().padStart(10)} ${(globOriginal.time / globlinUncached.time).toFixed(2).padStart(9)}x`)
  console.log(`${globOriginal.name.padEnd(30)} ${globOriginal.time.toFixed(2).padStart(9)}ms ${globOriginal.results.toString().padStart(10)} ${'1.00'.padStart(9)}x`)

  const cacheSpeedup = globlinUncached.time / globlinCached.time
  console.log(`\nCache speedup: ${cacheSpeedup.toFixed(2)}x`)

  // =========================================================================
  // Test 2: Concurrent access (multiple patterns, same dirs)
  // =========================================================================
  console.log('\n### Test 2: Concurrent Access (Simulated via Promise.all) ###\n')
  console.log('This tests concurrent glob operations that access the same directories.')
  console.log('Lock-free reads should allow better concurrency.\n')

  const concurrency = 10
  const batches = 10
  const patterns = ['**/*.js', '**/*.ts', '**/*.json', '**/*.md', '**/*.txt']

  // Helper to run all patterns
  const runPatterns = async (opts: { cache?: boolean }) => {
    const results: string[][] = []
    for (const p of patterns) {
      results.push(globSync(p, { cwd: MEDIUM_CWD, ...opts }))
    }
    return results.flat()
  }

  const concurrentCached = await benchConcurrent(
    'globlin concurrent (cache: true)',
    async () => runPatterns({ cache: true }),
    concurrency,
    batches
  )

  const concurrentUncached = await benchConcurrent(
    'globlin concurrent (cache: false)',
    async () => runPatterns({ cache: false }),
    concurrency,
    batches
  )

  console.log(`${'Scenario'.padEnd(35)} ${'Median Time'.padStart(12)} ${'Ops'.padStart(8)}`)
  console.log('-'.repeat(60))
  console.log(`${concurrentCached.name.padEnd(35)} ${concurrentCached.time.toFixed(2).padStart(9)}ms ${concurrentCached.ops.toString().padStart(8)}`)
  console.log(`${concurrentUncached.name.padEnd(35)} ${concurrentUncached.time.toFixed(2).padStart(9)}ms ${concurrentUncached.ops.toString().padStart(8)}`)

  const concurrentSpeedup = concurrentUncached.time / concurrentCached.time
  console.log(`\nConcurrent cache speedup: ${concurrentSpeedup.toFixed(2)}x`)

  // =========================================================================
  // Test 3: Large fixture with cache
  // =========================================================================
  console.log('\n### Test 3: Large Fixture (100k files) ###\n')

  const largeIterations = 10

  const largeCached = await benchSingleThreaded(
    'globlin large (cache: true)',
    () => globSync(PATTERN, { cwd: LARGE_CWD, cache: true }),
    largeIterations
  )

  const largeUncached = await benchSingleThreaded(
    'globlin large (cache: false)',
    () => globSync(PATTERN, { cwd: LARGE_CWD, cache: false }),
    largeIterations
  )

  const largeGlob = await benchSingleThreaded(
    'glob large',
    () => ogGlobSync(PATTERN, { cwd: LARGE_CWD }),
    largeIterations
  )

  console.log(`${'Library'.padEnd(30)} ${'Median Time'.padStart(12)} ${'Results'.padStart(10)} ${'vs glob'.padStart(10)}`)
  console.log('-'.repeat(65))
  console.log(`${largeCached.name.padEnd(30)} ${largeCached.time.toFixed(2).padStart(9)}ms ${largeCached.results.toString().padStart(10)} ${(largeGlob.time / largeCached.time).toFixed(2).padStart(9)}x`)
  console.log(`${largeUncached.name.padEnd(30)} ${largeUncached.time.toFixed(2).padStart(9)}ms ${largeUncached.results.toString().padStart(10)} ${(largeGlob.time / largeUncached.time).toFixed(2).padStart(9)}x`)
  console.log(`${largeGlob.name.padEnd(30)} ${largeGlob.time.toFixed(2).padStart(9)}ms ${largeGlob.results.toString().padStart(10)} ${'1.00'.padStart(9)}x`)

  const largeCacheSpeedup = largeUncached.time / largeCached.time
  console.log(`\nLarge fixture cache speedup: ${largeCacheSpeedup.toFixed(2)}x`)

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`
Test 1 - Single-threaded repeated (medium fixture):
  Cache speedup: ${cacheSpeedup.toFixed(2)}x
  vs glob with cache: ${(globOriginal.time / globlinCached.time).toFixed(2)}x
  vs glob without cache: ${(globOriginal.time / globlinUncached.time).toFixed(2)}x

Test 2 - Concurrent access:
  Cache speedup: ${concurrentSpeedup.toFixed(2)}x

Test 3 - Large fixture (100k files):
  Cache speedup: ${largeCacheSpeedup.toFixed(2)}x
  vs glob with cache: ${(largeGlob.time / largeCached.time).toFixed(2)}x
  vs glob without cache: ${(largeGlob.time / largeUncached.time).toFixed(2)}x
`)

  const overallCacheSpeedup = (cacheSpeedup + concurrentSpeedup + largeCacheSpeedup) / 3
  console.log(`Average cache speedup across all tests: ${overallCacheSpeedup.toFixed(2)}x`)

  if (overallCacheSpeedup > 1.0) {
    console.log('\n✅ Lock-free cache is providing a speedup!')
  } else {
    console.log('\n⚠️ Lock-free cache is not providing measurable speedup on this system.')
    console.log('   This may be due to OS-level VFS caching being very effective.')
  }
}

main().catch(console.error)
