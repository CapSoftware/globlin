/**
 * Phase 7.5: Comprehensive Glob Class API Benchmarking
 *
 * This benchmark performs a deep dive analysis of the Glob class API:
 * - Construction overhead (new Glob())
 * - walk() vs walkSync() comparison
 * - stream() vs streamSync() comparison
 * - iterate() vs iterateSync() comparison
 * - Cache reuse effectiveness (new Glob(pattern, existingGlob))
 * - Option inheritance overhead
 * - Multiple patterns with same instance
 * - Symbol.iterator and Symbol.asyncIterator performance
 *
 * Compare: globlin Glob class vs glob Glob class
 * Measure: Construction time, method call overhead, cache hit/miss ratio, instance reuse benefit
 */

import { Glob as OgGlob } from 'glob'
import { Glob, globSync, glob } from '../../js/index.js'

const SMALL_CWD = './benches/fixtures/small'
const MEDIUM_CWD = './benches/fixtures/medium'
const LARGE_CWD = './benches/fixtures/large'

interface BenchmarkResult {
  name: string
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
  speedupVsGlob: number
  resultMatch: boolean
}

interface ConstructionResult {
  name: string
  patternCount: number
  optionCount: number
  runs: number
  globMedian: number
  globlinMedian: number
  speedup: number
}

interface CacheReuseResult {
  name: string
  operation: string
  withoutReuse: number
  withReuse: number
  benefit: number
}

interface MethodComparisonResult {
  method: string
  fixture: string
  asyncTime: number
  syncTime: number
  asyncOverhead: number
  resultCount: number
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function median(arr: number[]): number {
  return percentile(arr, 50)
}

/**
 * Section 1: Construction Overhead Benchmarking
 */
async function benchmarkConstruction(): Promise<ConstructionResult[]> {
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 1: CONSTRUCTION OVERHEAD')
  console.log('-'.repeat(80))

  const results: ConstructionResult[] = []
  const runs = 1000

  // Test 1: Simple pattern, minimal options
  console.log('\n1.1 Simple pattern, minimal options:')
  {
    const pattern = '*.js'
    const options = { cwd: '.' }  // glob requires options
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      new OgGlob(pattern, options)
      globTimes.push(performance.now() - start)
    }

    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      new Glob(pattern, options)
      globlinTimes.push(performance.now() - start)
    }

    const globMedian = median(globTimes)
    const globlinMedian = median(globlinTimes)
    const speedup = globMedian / globlinMedian

    console.log(`    glob:    ${globMedian.toFixed(4)}ms (median of ${runs})`)
    console.log(`    globlin: ${globlinMedian.toFixed(4)}ms (median of ${runs})`)
    console.log(`    Speedup: ${speedup.toFixed(2)}x`)

    results.push({
      name: 'Simple pattern, minimal options',
      patternCount: 1,
      optionCount: 1,
      runs,
      globMedian,
      globlinMedian,
      speedup,
    })
  }

  // Test 2: Simple pattern with cwd option
  console.log('\n1.2 Simple pattern with cwd option:')
  {
    const pattern = '*.js'
    const options = { cwd: MEDIUM_CWD }
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      new OgGlob(pattern, options)
      globTimes.push(performance.now() - start)
    }

    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      new Glob(pattern, options)
      globlinTimes.push(performance.now() - start)
    }

    const globMedian = median(globTimes)
    const globlinMedian = median(globlinTimes)
    const speedup = globMedian / globlinMedian

    console.log(`    glob:    ${globMedian.toFixed(4)}ms (median of ${runs})`)
    console.log(`    globlin: ${globlinMedian.toFixed(4)}ms (median of ${runs})`)
    console.log(`    Speedup: ${speedup.toFixed(2)}x`)

    results.push({
      name: 'Simple pattern with cwd',
      patternCount: 1,
      optionCount: 1,
      runs,
      globMedian,
      globlinMedian,
      speedup,
    })
  }

  // Test 3: Multiple patterns
  console.log('\n1.3 Multiple patterns (5 patterns):')
  {
    const patterns = ['*.js', '*.ts', '*.json', '*.md', '*.txt']
    const options = { cwd: MEDIUM_CWD }
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      new OgGlob(patterns, options)
      globTimes.push(performance.now() - start)
    }

    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      new Glob(patterns, options)
      globlinTimes.push(performance.now() - start)
    }

    const globMedian = median(globTimes)
    const globlinMedian = median(globlinTimes)
    const speedup = globMedian / globlinMedian

    console.log(`    glob:    ${globMedian.toFixed(4)}ms (median of ${runs})`)
    console.log(`    globlin: ${globlinMedian.toFixed(4)}ms (median of ${runs})`)
    console.log(`    Speedup: ${speedup.toFixed(2)}x`)

    results.push({
      name: 'Multiple patterns (5)',
      patternCount: 5,
      optionCount: 1,
      runs,
      globMedian,
      globlinMedian,
      speedup,
    })
  }

  // Test 4: Complex options
  console.log('\n1.4 Complex options (8 options):')
  {
    const pattern = '**/*.js'
    const options = {
      cwd: MEDIUM_CWD,
      dot: true,
      nodir: true,
      mark: true,
      absolute: false,
      nocase: true,
      follow: true,
      maxDepth: 10,
    }
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      new OgGlob(pattern, options)
      globTimes.push(performance.now() - start)
    }

    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      new Glob(pattern, options)
      globlinTimes.push(performance.now() - start)
    }

    const globMedian = median(globTimes)
    const globlinMedian = median(globlinTimes)
    const speedup = globMedian / globlinMedian

    console.log(`    glob:    ${globMedian.toFixed(4)}ms (median of ${runs})`)
    console.log(`    globlin: ${globlinMedian.toFixed(4)}ms (median of ${runs})`)
    console.log(`    Speedup: ${speedup.toFixed(2)}x`)

    results.push({
      name: 'Complex options (8)',
      patternCount: 1,
      optionCount: 8,
      runs,
      globMedian,
      globlinMedian,
      speedup,
    })
  }

  // Test 5: Brace expansion patterns
  console.log('\n1.5 Brace expansion patterns:')
  {
    const pattern = '**/*.{js,ts,jsx,tsx,json}'
    const options = { cwd: MEDIUM_CWD }
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      new OgGlob(pattern, options)
      globTimes.push(performance.now() - start)
    }

    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      new Glob(pattern, options)
      globlinTimes.push(performance.now() - start)
    }

    const globMedian = median(globTimes)
    const globlinMedian = median(globlinTimes)
    const speedup = globMedian / globlinMedian

    console.log(`    glob:    ${globMedian.toFixed(4)}ms (median of ${runs})`)
    console.log(`    globlin: ${globlinMedian.toFixed(4)}ms (median of ${runs})`)
    console.log(`    Speedup: ${speedup.toFixed(2)}x`)

    results.push({
      name: 'Brace expansion pattern',
      patternCount: 1,
      optionCount: 1,
      runs,
      globMedian,
      globlinMedian,
      speedup,
    })
  }

  return results
}

/**
 * Section 2: walk() vs walkSync() Comparison
 */
async function benchmarkWalkMethods(): Promise<MethodComparisonResult[]> {
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 2: walk() vs walkSync() COMPARISON')
  console.log('-'.repeat(80))

  const results: MethodComparisonResult[] = []
  const pattern = '**/*.js'
  const runs = 10
  const warmupRuns = 3

  const fixtures = [
    { name: 'small', cwd: SMALL_CWD },
    { name: 'medium', cwd: MEDIUM_CWD },
    { name: 'large', cwd: LARGE_CWD },
  ]

  console.log('\n' + 'Fixture'.padEnd(10) + 'walkSync (ms)'.padStart(15) + 'walk (ms)'.padStart(15) + 'Async Overhead'.padStart(16) + 'Results'.padStart(10))
  console.log('-'.repeat(66))

  for (const fixture of fixtures) {
    const g = new Glob(pattern, { cwd: fixture.cwd })

    // Warmup
    for (let i = 0; i < warmupRuns; i++) {
      g.walkSync()
      await g.walk()
    }

    // Benchmark walkSync
    const syncTimes: number[] = []
    let syncResults: string[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      syncResults = g.walkSync()
      syncTimes.push(performance.now() - start)
    }

    // Benchmark walk (async)
    const asyncTimes: number[] = []
    let asyncResults: string[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      asyncResults = await g.walk()
      asyncTimes.push(performance.now() - start)
    }

    const syncMedian = median(syncTimes)
    const asyncMedian = median(asyncTimes)
    const overhead = ((asyncMedian - syncMedian) / syncMedian) * 100

    console.log(
      fixture.name.padEnd(10) +
        syncMedian.toFixed(2).padStart(15) +
        asyncMedian.toFixed(2).padStart(15) +
        `${overhead > 0 ? '+' : ''}${overhead.toFixed(1)}%`.padStart(16) +
        syncResults.length.toString().padStart(10)
    )

    results.push({
      method: 'walk vs walkSync',
      fixture: fixture.name,
      asyncTime: asyncMedian,
      syncTime: syncMedian,
      asyncOverhead: overhead,
      resultCount: syncResults.length,
    })
  }

  return results
}

/**
 * Section 3: stream() vs streamSync() Comparison
 */
async function benchmarkStreamMethods(): Promise<MethodComparisonResult[]> {
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 3: stream() vs streamSync() COMPARISON')
  console.log('-'.repeat(80))

  const results: MethodComparisonResult[] = []
  const pattern = '**/*.js'
  const runs = 10
  const warmupRuns = 3

  const fixtures = [
    { name: 'small', cwd: SMALL_CWD },
    { name: 'medium', cwd: MEDIUM_CWD },
    { name: 'large', cwd: LARGE_CWD },
  ]

  console.log('\n' + 'Fixture'.padEnd(10) + 'streamSync (ms)'.padStart(17) + 'stream (ms)'.padStart(15) + 'Async Overhead'.padStart(16) + 'Results'.padStart(10))
  console.log('-'.repeat(68))

  for (const fixture of fixtures) {
    const g = new Glob(pattern, { cwd: fixture.cwd })

    // Helper to consume stream
    const consumeStream = (stream: AsyncIterable<string> | Iterable<string>): Promise<string[]> => {
      return new Promise((resolve, reject) => {
        const results: string[] = []
        const s = stream as any
        s.on('data', (d: string) => results.push(d))
        s.on('end', () => resolve(results))
        s.on('error', reject)
      })
    }

    // Warmup
    for (let i = 0; i < warmupRuns; i++) {
      await consumeStream(g.streamSync())
      await consumeStream(g.stream())
    }

    // Benchmark streamSync
    const syncTimes: number[] = []
    let syncResults: string[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      syncResults = await consumeStream(g.streamSync())
      syncTimes.push(performance.now() - start)
    }

    // Benchmark stream (async)
    const asyncTimes: number[] = []
    let asyncResults: string[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      asyncResults = await consumeStream(g.stream())
      asyncTimes.push(performance.now() - start)
    }

    const syncMedian = median(syncTimes)
    const asyncMedian = median(asyncTimes)
    const overhead = ((asyncMedian - syncMedian) / syncMedian) * 100

    console.log(
      fixture.name.padEnd(10) +
        syncMedian.toFixed(2).padStart(17) +
        asyncMedian.toFixed(2).padStart(15) +
        `${overhead > 0 ? '+' : ''}${overhead.toFixed(1)}%`.padStart(16) +
        syncResults.length.toString().padStart(10)
    )

    results.push({
      method: 'stream vs streamSync',
      fixture: fixture.name,
      asyncTime: asyncMedian,
      syncTime: syncMedian,
      asyncOverhead: overhead,
      resultCount: syncResults.length,
    })
  }

  return results
}

/**
 * Section 4: iterate() vs iterateSync() Comparison
 */
async function benchmarkIterateMethods(): Promise<MethodComparisonResult[]> {
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 4: iterate() vs iterateSync() COMPARISON')
  console.log('-'.repeat(80))

  const results: MethodComparisonResult[] = []
  const pattern = '**/*.js'
  const runs = 10
  const warmupRuns = 3

  const fixtures = [
    { name: 'small', cwd: SMALL_CWD },
    { name: 'medium', cwd: MEDIUM_CWD },
    { name: 'large', cwd: LARGE_CWD },
  ]

  console.log('\n' + 'Fixture'.padEnd(10) + 'iterateSync (ms)'.padStart(18) + 'iterate (ms)'.padStart(15) + 'Async Overhead'.padStart(16) + 'Results'.padStart(10))
  console.log('-'.repeat(69))

  for (const fixture of fixtures) {
    const g = new Glob(pattern, { cwd: fixture.cwd })

    // Warmup
    for (let i = 0; i < warmupRuns; i++) {
      const syncResults: string[] = []
      for (const r of g.iterateSync()) {
        syncResults.push(r)
      }
      const asyncResults: string[] = []
      for await (const r of g.iterate()) {
        asyncResults.push(r)
      }
    }

    // Benchmark iterateSync
    const syncTimes: number[] = []
    let syncCount = 0
    for (let i = 0; i < runs; i++) {
      const results: string[] = []
      const start = performance.now()
      for (const r of g.iterateSync()) {
        results.push(r)
      }
      syncTimes.push(performance.now() - start)
      syncCount = results.length
    }

    // Benchmark iterate (async)
    const asyncTimes: number[] = []
    let asyncCount = 0
    for (let i = 0; i < runs; i++) {
      const results: string[] = []
      const start = performance.now()
      for await (const r of g.iterate()) {
        results.push(r)
      }
      asyncTimes.push(performance.now() - start)
      asyncCount = results.length
    }

    const syncMedian = median(syncTimes)
    const asyncMedian = median(asyncTimes)
    const overhead = ((asyncMedian - syncMedian) / syncMedian) * 100

    console.log(
      fixture.name.padEnd(10) +
        syncMedian.toFixed(2).padStart(18) +
        asyncMedian.toFixed(2).padStart(15) +
        `${overhead > 0 ? '+' : ''}${overhead.toFixed(1)}%`.padStart(16) +
        syncCount.toString().padStart(10)
    )

    results.push({
      method: 'iterate vs iterateSync',
      fixture: fixture.name,
      asyncTime: asyncMedian,
      syncTime: syncMedian,
      asyncOverhead: overhead,
      resultCount: syncCount,
    })
  }

  return results
}

/**
 * Section 5: Symbol.iterator and Symbol.asyncIterator Performance
 */
async function benchmarkSymbolIterators(): Promise<MethodComparisonResult[]> {
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 5: Symbol.iterator vs Symbol.asyncIterator')
  console.log('-'.repeat(80))

  const results: MethodComparisonResult[] = []
  const pattern = '**/*.js'
  const runs = 10
  const warmupRuns = 3

  const fixtures = [
    { name: 'small', cwd: SMALL_CWD },
    { name: 'medium', cwd: MEDIUM_CWD },
    { name: 'large', cwd: LARGE_CWD },
  ]

  console.log('\n' + 'Fixture'.padEnd(10) + 'for...of (ms)'.padStart(15) + 'for await (ms)'.padStart(17) + 'Async Overhead'.padStart(16) + 'Results'.padStart(10))
  console.log('-'.repeat(68))

  for (const fixture of fixtures) {
    const g = new Glob(pattern, { cwd: fixture.cwd })

    // Warmup
    for (let i = 0; i < warmupRuns; i++) {
      const syncResults: string[] = []
      for (const r of g) {
        syncResults.push(r)
      }
      const asyncResults: string[] = []
      for await (const r of g) {
        asyncResults.push(r)
      }
    }

    // Benchmark for...of (Symbol.iterator)
    const syncTimes: number[] = []
    let syncCount = 0
    for (let i = 0; i < runs; i++) {
      const results: string[] = []
      const start = performance.now()
      for (const r of g) {
        results.push(r)
      }
      syncTimes.push(performance.now() - start)
      syncCount = results.length
    }

    // Benchmark for await...of (Symbol.asyncIterator)
    const asyncTimes: number[] = []
    let asyncCount = 0
    for (let i = 0; i < runs; i++) {
      const results: string[] = []
      const start = performance.now()
      for await (const r of g) {
        results.push(r)
      }
      asyncTimes.push(performance.now() - start)
      asyncCount = results.length
    }

    const syncMedian = median(syncTimes)
    const asyncMedian = median(asyncTimes)
    const overhead = ((asyncMedian - syncMedian) / syncMedian) * 100

    console.log(
      fixture.name.padEnd(10) +
        syncMedian.toFixed(2).padStart(15) +
        asyncMedian.toFixed(2).padStart(17) +
        `${overhead > 0 ? '+' : ''}${overhead.toFixed(1)}%`.padStart(16) +
        syncCount.toString().padStart(10)
    )

    results.push({
      method: 'Symbol iterators',
      fixture: fixture.name,
      asyncTime: asyncMedian,
      syncTime: syncMedian,
      asyncOverhead: overhead,
      resultCount: syncCount,
    })
  }

  return results
}

/**
 * Section 6: Cache Reuse Effectiveness
 */
async function benchmarkCacheReuse(): Promise<CacheReuseResult[]> {
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 6: CACHE REUSE EFFECTIVENESS')
  console.log('-'.repeat(80))

  const results: CacheReuseResult[] = []
  const runs = 10
  const warmupRuns = 3
  const cwd = MEDIUM_CWD

  // Test 1: Multiple patterns with same options (without cache reuse)
  console.log('\n6.1 Multiple patterns WITHOUT cache reuse:')
  {
    const patterns = ['*.js', '*.ts', '*.json', '*.md', '*.txt']

    // Warmup
    for (let i = 0; i < warmupRuns; i++) {
      for (const p of patterns) {
        const g = new Glob(p, { cwd })
        g.walkSync()
      }
    }

    // Benchmark
    const times: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      for (const p of patterns) {
        const g = new Glob(p, { cwd })
        g.walkSync()
      }
      times.push(performance.now() - start)
    }

    const medianTime = median(times)
    console.log(`    Time: ${medianTime.toFixed(2)}ms (median of ${runs})`)

    results.push({
      name: 'Multiple patterns',
      operation: 'without reuse',
      withoutReuse: medianTime,
      withReuse: 0,
      benefit: 0,
    })
  }

  // Test 2: Multiple patterns WITH cache reuse (passing Glob as options)
  console.log('\n6.2 Multiple patterns WITH cache reuse:')
  {
    const patterns = ['*.js', '*.ts', '*.json', '*.md', '*.txt']

    // Warmup
    for (let i = 0; i < warmupRuns; i++) {
      const baseGlob = new Glob(patterns[0], { cwd })
      baseGlob.walkSync()
      for (let j = 1; j < patterns.length; j++) {
        const g = new Glob(patterns[j], baseGlob)
        g.walkSync()
      }
    }

    // Benchmark
    const times: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      const baseGlob = new Glob(patterns[0], { cwd })
      baseGlob.walkSync()
      for (let j = 1; j < patterns.length; j++) {
        const g = new Glob(patterns[j], baseGlob)
        g.walkSync()
      }
      times.push(performance.now() - start)
    }

    const medianTime = median(times)
    console.log(`    Time: ${medianTime.toFixed(2)}ms (median of ${runs})`)

    // Update previous result with reuse info
    results[results.length - 1].withReuse = medianTime
    results[results.length - 1].benefit =
      ((results[results.length - 1].withoutReuse - medianTime) / results[results.length - 1].withoutReuse) * 100
  }

  // Test 3: Same pattern multiple times without cache
  console.log('\n6.3 Same pattern 5x WITHOUT cache:')
  {
    const pattern = '**/*.js'

    // Warmup
    for (let i = 0; i < warmupRuns; i++) {
      for (let j = 0; j < 5; j++) {
        const g = new Glob(pattern, { cwd })
        g.walkSync()
      }
    }

    // Benchmark
    const times: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      for (let j = 0; j < 5; j++) {
        const g = new Glob(pattern, { cwd })
        g.walkSync()
      }
      times.push(performance.now() - start)
    }

    const medianTime = median(times)
    console.log(`    Time: ${medianTime.toFixed(2)}ms (median of ${runs})`)

    results.push({
      name: 'Same pattern 5x',
      operation: 'without reuse',
      withoutReuse: medianTime,
      withReuse: 0,
      benefit: 0,
    })
  }

  // Test 4: Same pattern multiple times WITH cache reuse
  console.log('\n6.4 Same pattern 5x WITH instance reuse:')
  {
    const pattern = '**/*.js'

    // Warmup
    for (let i = 0; i < warmupRuns; i++) {
      const g = new Glob(pattern, { cwd })
      for (let j = 0; j < 5; j++) {
        g.walkSync()
      }
    }

    // Benchmark
    const times: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      const g = new Glob(pattern, { cwd })
      for (let j = 0; j < 5; j++) {
        g.walkSync()
      }
      times.push(performance.now() - start)
    }

    const medianTime = median(times)
    console.log(`    Time: ${medianTime.toFixed(2)}ms (median of ${runs})`)

    // Update previous result
    results[results.length - 1].withReuse = medianTime
    results[results.length - 1].benefit =
      ((results[results.length - 1].withoutReuse - medianTime) / results[results.length - 1].withoutReuse) * 100
  }

  // Test 5: Glob class vs globSync function
  console.log('\n6.5 Glob class vs globSync function:')
  {
    const pattern = '**/*.js'

    // Warmup
    for (let i = 0; i < warmupRuns; i++) {
      globSync(pattern, { cwd })
      const g = new Glob(pattern, { cwd })
      g.walkSync()
    }

    // Benchmark globSync function
    const funcTimes: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      globSync(pattern, { cwd })
      funcTimes.push(performance.now() - start)
    }

    // Benchmark Glob class
    const classTimes: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      const g = new Glob(pattern, { cwd })
      g.walkSync()
      classTimes.push(performance.now() - start)
    }

    const funcMedian = median(funcTimes)
    const classMedian = median(classTimes)
    const overhead = ((classMedian - funcMedian) / funcMedian) * 100

    console.log(`    globSync: ${funcMedian.toFixed(2)}ms`)
    console.log(`    Glob class: ${classMedian.toFixed(2)}ms`)
    console.log(`    Class overhead: ${overhead > 0 ? '+' : ''}${overhead.toFixed(1)}%`)

    results.push({
      name: 'Class vs function',
      operation: 'overhead',
      withoutReuse: funcMedian,
      withReuse: classMedian,
      benefit: -overhead,
    })
  }

  return results
}

/**
 * Section 7: Glob Class vs glob Glob Class Comparison
 */
async function benchmarkVsGlobClass(): Promise<BenchmarkResult[]> {
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 7: GLOBLIN GLOB CLASS vs GLOB GLOB CLASS')
  console.log('-'.repeat(80))

  const results: BenchmarkResult[] = []
  const patterns = ['**/*.js', '*.js', 'level0/**/*.js', '**/*.{js,ts}', '**/*']
  const runs = 10
  const warmupRuns = 3

  const fixtures = [
    { name: 'small', cwd: SMALL_CWD },
    { name: 'medium', cwd: MEDIUM_CWD },
    { name: 'large', cwd: LARGE_CWD },
  ]

  for (const fixture of fixtures) {
    console.log(`\n>>> Fixture: ${fixture.name.toUpperCase()} <<<\n`)
    console.log(
      'Pattern'.padEnd(20) +
        'glob Glob (ms)'.padStart(16) +
        'globlin Glob (ms)'.padStart(19) +
        'Speedup'.padStart(10) +
        'Count'.padStart(10) +
        'Match'.padStart(8)
    )
    console.log('-'.repeat(83))

    for (const pattern of patterns) {
      // Warmup
      for (let i = 0; i < warmupRuns; i++) {
        const og = new OgGlob(pattern, { cwd: fixture.cwd })
        og.walkSync()
        const gl = new Glob(pattern, { cwd: fixture.cwd })
        gl.walkSync()
      }

      // Benchmark glob's Glob class
      const globTimes: number[] = []
      let globResults: string[] = []
      for (let i = 0; i < runs; i++) {
        const start = performance.now()
        const g = new OgGlob(pattern, { cwd: fixture.cwd })
        globResults = g.walkSync()
        globTimes.push(performance.now() - start)
      }

      // Benchmark globlin's Glob class
      const globlinTimes: number[] = []
      let globlinResults: string[] = []
      for (let i = 0; i < runs; i++) {
        const start = performance.now()
        const g = new Glob(pattern, { cwd: fixture.cwd })
        globlinResults = g.walkSync()
        globlinTimes.push(performance.now() - start)
      }

      const globMedian = median(globTimes)
      const globlinMedian = median(globlinTimes)
      const speedup = globMedian / globlinMedian

      // Compare results
      const globSet = new Set(globResults)
      const globlinSet = new Set(globlinResults)
      const resultMatch = globSet.size === globlinSet.size && [...globSet].every(r => globlinSet.has(r))

      console.log(
        pattern.padEnd(20) +
          globMedian.toFixed(2).padStart(16) +
          globlinMedian.toFixed(2).padStart(19) +
          `${speedup.toFixed(2)}x`.padStart(10) +
          globlinResults.length.toString().padStart(10) +
          (resultMatch ? 'YES' : 'NO').padStart(8)
      )

      results.push({
        name: pattern,
        fixture: fixture.name,
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
        speedupVsGlob: speedup,
        resultMatch,
      })
    }
  }

  return results
}

/**
 * Section 8: Option Inheritance Overhead
 */
async function benchmarkOptionInheritance(): Promise<void> {
  console.log('\n' + '-'.repeat(80))
  console.log('SECTION 8: OPTION INHERITANCE OVERHEAD')
  console.log('-'.repeat(80))

  const runs = 1000
  const cwd = MEDIUM_CWD

  // Create a base Glob with many options
  const baseOptions = {
    cwd,
    dot: true,
    nodir: true,
    mark: true,
    nocase: true,
    follow: true,
    maxDepth: 10,
  }

  // Test 1: Creating Glob with explicit options
  console.log('\n8.1 Creating Glob with explicit options:')
  {
    const times: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      new Glob('**/*.js', baseOptions)
      times.push(performance.now() - start)
    }
    console.log(`    Time: ${median(times).toFixed(4)}ms (median of ${runs})`)
  }

  // Test 2: Creating Glob by inheriting from another Glob
  console.log('\n8.2 Creating Glob by inheriting from another Glob:')
  {
    const baseGlob = new Glob('*.ts', baseOptions)
    const times: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      new Glob('**/*.js', baseGlob)
      times.push(performance.now() - start)
    }
    console.log(`    Time: ${median(times).toFixed(4)}ms (median of ${runs})`)
  }

  // Test 3: Chained inheritance (g1 -> g2 -> g3)
  console.log('\n8.3 Chained inheritance (g1 -> g2 -> g3):')
  {
    const g1 = new Glob('*.ts', { cwd })
    const times: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      const g2 = new Glob('*.js', g1)
      const g3 = new Glob('*.json', g2)
      void g3
      times.push(performance.now() - start)
    }
    console.log(`    Time: ${median(times).toFixed(4)}ms (median of ${runs})`)
  }
}

/**
 * Main function
 */
async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('PHASE 7.5: COMPREHENSIVE GLOB CLASS API BENCHMARKING')
  console.log('='.repeat(80))

  // Run all benchmark sections
  const constructionResults = await benchmarkConstruction()
  const walkResults = await benchmarkWalkMethods()
  const streamResults = await benchmarkStreamMethods()
  const iterateResults = await benchmarkIterateMethods()
  const symbolResults = await benchmarkSymbolIterators()
  const cacheResults = await benchmarkCacheReuse()
  const vsGlobResults = await benchmarkVsGlobClass()
  await benchmarkOptionInheritance()

  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))

  // Construction summary
  console.log('\nConstruction Overhead:')
  console.log('  Scenario'.padEnd(35) + 'glob'.padStart(12) + 'globlin'.padStart(12) + 'Speedup'.padStart(10))
  console.log('-'.repeat(69))
  for (const r of constructionResults) {
    console.log(
      `  ${r.name}`.padEnd(35) +
        `${r.globMedian.toFixed(4)}ms`.padStart(12) +
        `${r.globlinMedian.toFixed(4)}ms`.padStart(12) +
        `${r.speedup.toFixed(2)}x`.padStart(10)
    )
  }

  // Method comparison summary
  console.log('\nMethod Async Overhead (vs sync):')
  const allMethodResults = [...walkResults, ...streamResults, ...iterateResults, ...symbolResults]
  const avgOverhead = allMethodResults.reduce((sum, r) => sum + r.asyncOverhead, 0) / allMethodResults.length
  console.log(`  Average async overhead: ${avgOverhead > 0 ? '+' : ''}${avgOverhead.toFixed(1)}%`)

  // Cache reuse summary
  console.log('\nCache Reuse Benefits:')
  for (const r of cacheResults.filter(r => r.benefit !== 0)) {
    const label = r.benefit > 0 ? 'savings' : 'overhead'
    console.log(`  ${r.name}: ${Math.abs(r.benefit).toFixed(1)}% ${label}`)
  }

  // vs Glob class summary
  console.log('\nGlobin Glob Class vs glob Glob Class:')
  const byFixture: Record<string, BenchmarkResult[]> = {}
  for (const r of vsGlobResults) {
    if (!byFixture[r.fixture]) byFixture[r.fixture] = []
    byFixture[r.fixture].push(r)
  }
  console.log('  Fixture'.padEnd(12) + 'Avg Speedup'.padStart(15) + 'Faster Than glob'.padStart(20) + 'Result Match'.padStart(15))
  console.log('-'.repeat(62))
  for (const [fixture, results] of Object.entries(byFixture)) {
    const avgSpeedup = results.reduce((sum, r) => sum + r.speedupVsGlob, 0) / results.length
    const fasterCount = results.filter(r => r.speedupVsGlob > 1).length
    const matchCount = results.filter(r => r.resultMatch).length
    console.log(
      `  ${fixture}`.padEnd(12) +
        `${avgSpeedup.toFixed(2)}x`.padStart(15) +
        `${fasterCount}/${results.length}`.padStart(20) +
        `${matchCount}/${results.length}`.padStart(15)
    )
  }

  // Overall stats
  const totalPatterns = vsGlobResults.length
  const totalFaster = vsGlobResults.filter(r => r.speedupVsGlob > 1).length
  const totalMatch = vsGlobResults.filter(r => r.resultMatch).length
  const overallSpeedup = vsGlobResults.reduce((sum, r) => sum + r.speedupVsGlob, 0) / totalPatterns

  console.log(`\nOverall: ${overallSpeedup.toFixed(2)}x average speedup, ${totalFaster}/${totalPatterns} patterns faster, ${totalMatch}/${totalPatterns} results match`)

  console.log('\n' + '='.repeat(80))
  console.log('END OF GLOB CLASS API BENCHMARK')
  console.log('='.repeat(80) + '\n')
}

main().catch(console.error)
