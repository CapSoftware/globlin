/**
 * Phase 7.4: Comprehensive Iterator API (`globIterate`, `globIterateSync`) Benchmarking
 *
 * This benchmark performs a deep dive analysis of the iterator API:
 * - Iterator creation overhead
 * - Per-iteration cost
 * - Early termination (break after N results)
 * - Generator function overhead
 * - Comparison with stream API
 * - Comparison with sync/async collect API
 *
 * Compare: globlin iterate vs glob iterate
 * Measure: First yield latency, per-yield cost, memory during iteration,
 *          early termination efficiency
 */

import { glob as ogGlob, globSync as ogGlobSync } from 'glob'
import type { Glob as OgGlob } from 'glob'
import { globIterate, globIterateSync, globSync, glob, Glob } from '../../js/index.js'

const SMALL_CWD = './benches/fixtures/small'
const MEDIUM_CWD = './benches/fixtures/medium'
const LARGE_CWD = './benches/fixtures/large'

interface IteratorBenchmarkResult {
  pattern: string
  fixture: string
  runs: number
  glob: {
    firstYieldTime: number
    totalTime: number
    perYieldCost: number
    resultCount: number
  }
  globlin: {
    firstYieldTime: number
    totalTime: number
    perYieldCost: number
    resultCount: number
  }
  speedupFirstYield: number
  speedupTotal: number
  resultMatch: boolean
}

interface EarlyTerminationResult {
  pattern: string
  fixture: string
  terminateAfter: number
  fullResultCount: number
  glob: {
    time: number
    resultCount: number
  }
  globlin: {
    time: number
    resultCount: number
  }
  speedup: number
  timeSavingsPercent: number
}

interface IteratorVsSyncResult {
  pattern: string
  fixture: string
  syncTime: number
  asyncCollectTime: number
  iteratorTime: number
  iteratorOverheadVsSync: number
  iteratorOverheadVsAsync: number
}

interface IteratorVsStreamResult {
  pattern: string
  fixture: string
  streamTime: number
  iteratorTime: number
  overheadPercent: number
}

interface MemoryIteratorResult {
  pattern: string
  fixture: string
  resultCount: number
  syncMemory: {
    peakHeapUsed: number
    heapUsedDelta: number
  }
  iteratorMemory: {
    peakHeapUsed: number
    heapUsedDelta: number
  }
  memorySavingsPercent: number
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

/**
 * Measure async iterator timing (for await...of)
 */
async function measureAsyncIteratorTiming(
  iteratorFn: () => AsyncGenerator<string, void, void>,
  limit?: number
): Promise<{
  firstYieldTime: number
  totalTime: number
  resultCount: number
  perYieldCost: number
}> {
  const start = performance.now()
  let firstYieldTime = 0
  let resultCount = 0
  let firstYieldRecorded = false
  const yieldTimes: number[] = []
  let lastYieldTime = start

  const iterator = iteratorFn()

  for await (const _result of iterator) {
    const now = performance.now()
    if (!firstYieldRecorded) {
      firstYieldTime = now - start
      firstYieldRecorded = true
    }
    yieldTimes.push(now - lastYieldTime)
    lastYieldTime = now
    resultCount++

    if (limit && resultCount >= limit) {
      break
    }
  }

  const totalTime = performance.now() - start
  const perYieldCost = yieldTimes.length > 1 ? median(yieldTimes.slice(1)) : 0 // Skip first (includes setup)

  return { firstYieldTime, totalTime, resultCount, perYieldCost }
}

/**
 * Measure sync iterator timing (for...of)
 */
function measureSyncIteratorTiming(
  iteratorFn: () => Generator<string, void, void>,
  limit?: number
): { firstYieldTime: number; totalTime: number; resultCount: number; perYieldCost: number } {
  const start = performance.now()
  let firstYieldTime = 0
  let resultCount = 0
  let firstYieldRecorded = false
  const yieldTimes: number[] = []
  let lastYieldTime = start

  const iterator = iteratorFn()

  for (const _result of iterator) {
    const now = performance.now()
    if (!firstYieldRecorded) {
      firstYieldTime = now - start
      firstYieldRecorded = true
    }
    yieldTimes.push(now - lastYieldTime)
    lastYieldTime = now
    resultCount++

    if (limit && resultCount >= limit) {
      break
    }
  }

  const totalTime = performance.now() - start
  const perYieldCost = yieldTimes.length > 1 ? median(yieldTimes.slice(1)) : 0

  return { firstYieldTime, totalTime, resultCount, perYieldCost }
}

/**
 * Benchmark async iterator API comparing globlin vs glob
 */
async function runAsyncIteratorBenchmark(
  pattern: string,
  cwd: string,
  runs = 5,
  warmupRuns = 2
): Promise<IteratorBenchmarkResult> {
  const fixtureLabel = cwd.includes('small')
    ? 'small'
    : cwd.includes('medium')
      ? 'medium'
      : cwd.includes('large')
        ? 'large'
        : 'unknown'

  // Warmup
  for (let i = 0; i < warmupRuns; i++) {
    const g = new (await import('glob')).Glob(pattern, { cwd })
    await measureAsyncIteratorTiming(() => g.iterate())
    await measureAsyncIteratorTiming(() => globIterate(pattern, { cwd }))
  }

  // Benchmark glob iterate
  const globResults: Array<{
    firstYieldTime: number
    totalTime: number
    resultCount: number
    perYieldCost: number
  }> = []
  for (let i = 0; i < runs; i++) {
    const g = new (await import('glob')).Glob(pattern, { cwd })
    const result = await measureAsyncIteratorTiming(() => g.iterate())
    globResults.push(result)
  }

  // Benchmark globlin iterate
  const globlinResults: Array<{
    firstYieldTime: number
    totalTime: number
    resultCount: number
    perYieldCost: number
  }> = []
  for (let i = 0; i < runs; i++) {
    const result = await measureAsyncIteratorTiming(() => globIterate(pattern, { cwd }))
    globlinResults.push(result)
  }

  const globFirstYieldMedian = median(globResults.map(r => r.firstYieldTime))
  const globTotalMedian = median(globResults.map(r => r.totalTime))
  const globPerYieldMedian = median(globResults.map(r => r.perYieldCost))
  const globlinFirstYieldMedian = median(globlinResults.map(r => r.firstYieldTime))
  const globlinTotalMedian = median(globlinResults.map(r => r.totalTime))
  const globlinPerYieldMedian = median(globlinResults.map(r => r.perYieldCost))

  const globResultCount = globResults[0].resultCount
  const globlinResultCount = globlinResults[0].resultCount
  const resultMatch = globResultCount === globlinResultCount

  return {
    pattern,
    fixture: fixtureLabel,
    runs,
    glob: {
      firstYieldTime: globFirstYieldMedian,
      totalTime: globTotalMedian,
      perYieldCost: globPerYieldMedian,
      resultCount: globResultCount,
    },
    globlin: {
      firstYieldTime: globlinFirstYieldMedian,
      totalTime: globlinTotalMedian,
      perYieldCost: globlinPerYieldMedian,
      resultCount: globlinResultCount,
    },
    speedupFirstYield: globFirstYieldMedian / globlinFirstYieldMedian,
    speedupTotal: globTotalMedian / globlinTotalMedian,
    resultMatch,
  }
}

/**
 * Benchmark sync iterator API
 */
async function runSyncIteratorBenchmark(
  pattern: string,
  cwd: string,
  runs = 5,
  warmupRuns = 2
): Promise<IteratorBenchmarkResult> {
  const fixtureLabel = cwd.includes('small')
    ? 'small'
    : cwd.includes('medium')
      ? 'medium'
      : cwd.includes('large')
        ? 'large'
        : 'unknown'

  // Warmup
  for (let i = 0; i < warmupRuns; i++) {
    const g = new (await import('glob')).Glob(pattern, { cwd })
    measureSyncIteratorTiming(() => g.iterateSync())
    measureSyncIteratorTiming(() => globIterateSync(pattern, { cwd }))
  }

  // Benchmark glob iterateSync
  const globResults: Array<{
    firstYieldTime: number
    totalTime: number
    resultCount: number
    perYieldCost: number
  }> = []
  for (let i = 0; i < runs; i++) {
    const g = new (await import('glob')).Glob(pattern, { cwd })
    const result = measureSyncIteratorTiming(() => g.iterateSync())
    globResults.push(result)
  }

  // Benchmark globlin iterateSync
  const globlinResults: Array<{
    firstYieldTime: number
    totalTime: number
    resultCount: number
    perYieldCost: number
  }> = []
  for (let i = 0; i < runs; i++) {
    const result = measureSyncIteratorTiming(() => globIterateSync(pattern, { cwd }))
    globlinResults.push(result)
  }

  const globFirstYieldMedian = median(globResults.map(r => r.firstYieldTime))
  const globTotalMedian = median(globResults.map(r => r.totalTime))
  const globPerYieldMedian = median(globResults.map(r => r.perYieldCost))
  const globlinFirstYieldMedian = median(globlinResults.map(r => r.firstYieldTime))
  const globlinTotalMedian = median(globlinResults.map(r => r.totalTime))
  const globlinPerYieldMedian = median(globlinResults.map(r => r.perYieldCost))

  const globResultCount = globResults[0].resultCount
  const globlinResultCount = globlinResults[0].resultCount
  const resultMatch = globResultCount === globlinResultCount

  return {
    pattern,
    fixture: fixtureLabel,
    runs,
    glob: {
      firstYieldTime: globFirstYieldMedian,
      totalTime: globTotalMedian,
      perYieldCost: globPerYieldMedian,
      resultCount: globResultCount,
    },
    globlin: {
      firstYieldTime: globlinFirstYieldMedian,
      totalTime: globlinTotalMedian,
      perYieldCost: globlinPerYieldMedian,
      resultCount: globlinResultCount,
    },
    speedupFirstYield: globFirstYieldMedian / globlinFirstYieldMedian,
    speedupTotal: globTotalMedian / globlinTotalMedian,
    resultMatch,
  }
}

/**
 * Benchmark early termination efficiency
 */
async function runEarlyTerminationBenchmark(
  pattern: string,
  cwd: string,
  terminateAfter: number
): Promise<EarlyTerminationResult> {
  const fixtureLabel = cwd.includes('small')
    ? 'small'
    : cwd.includes('medium')
      ? 'medium'
      : cwd.includes('large')
        ? 'large'
        : 'unknown'

  // Get full result count first
  const fullResults = globSync(pattern, { cwd })
  const fullResultCount = fullResults.length

  // Warmup
  const g1 = new (await import('glob')).Glob(pattern, { cwd })
  await measureAsyncIteratorTiming(() => g1.iterate(), terminateAfter)
  await measureAsyncIteratorTiming(() => globIterate(pattern, { cwd }), terminateAfter)

  // Benchmark glob with early termination
  const globTimes: number[] = []
  let globCount = 0
  for (let i = 0; i < 3; i++) {
    const g = new (await import('glob')).Glob(pattern, { cwd })
    const result = await measureAsyncIteratorTiming(() => g.iterate(), terminateAfter)
    globTimes.push(result.totalTime)
    globCount = result.resultCount
  }

  // Benchmark globlin with early termination
  const globlinTimes: number[] = []
  let globlinCount = 0
  for (let i = 0; i < 3; i++) {
    const result = await measureAsyncIteratorTiming(
      () => globIterate(pattern, { cwd }),
      terminateAfter
    )
    globlinTimes.push(result.totalTime)
    globlinCount = result.resultCount
  }

  const globMedian = median(globTimes)
  const globlinMedian = median(globlinTimes)

  // Calculate time savings compared to full iteration
  const g2 = new (await import('glob')).Glob(pattern, { cwd })
  const fullGlobResult = await measureAsyncIteratorTiming(() => g2.iterate())
  const fullGloblinResult = await measureAsyncIteratorTiming(() => globIterate(pattern, { cwd }))
  const timeSavingsPercent =
    ((fullGloblinResult.totalTime - globlinMedian) / fullGloblinResult.totalTime) * 100

  return {
    pattern,
    fixture: fixtureLabel,
    terminateAfter,
    fullResultCount,
    glob: {
      time: globMedian,
      resultCount: globCount,
    },
    globlin: {
      time: globlinMedian,
      resultCount: globlinCount,
    },
    speedup: globMedian / globlinMedian,
    timeSavingsPercent,
  }
}

/**
 * Compare iterator vs sync API
 */
async function compareIteratorVsSync(pattern: string, cwd: string): Promise<IteratorVsSyncResult> {
  const fixtureLabel = cwd.includes('small')
    ? 'small'
    : cwd.includes('medium')
      ? 'medium'
      : cwd.includes('large')
        ? 'large'
        : 'unknown'

  // Warmup
  globSync(pattern, { cwd })
  await glob(pattern, { cwd })
  await measureAsyncIteratorTiming(() => globIterate(pattern, { cwd }))

  // Measure sync
  const syncTimes: number[] = []
  for (let i = 0; i < 5; i++) {
    const start = performance.now()
    globSync(pattern, { cwd })
    syncTimes.push(performance.now() - start)
  }

  // Measure async collect
  const asyncTimes: number[] = []
  for (let i = 0; i < 5; i++) {
    const start = performance.now()
    await glob(pattern, { cwd })
    asyncTimes.push(performance.now() - start)
  }

  // Measure iterator
  const iteratorTimes: number[] = []
  for (let i = 0; i < 5; i++) {
    const result = await measureAsyncIteratorTiming(() => globIterate(pattern, { cwd }))
    iteratorTimes.push(result.totalTime)
  }

  const syncTime = median(syncTimes)
  const asyncTime = median(asyncTimes)
  const iteratorTime = median(iteratorTimes)

  return {
    pattern,
    fixture: fixtureLabel,
    syncTime,
    asyncCollectTime: asyncTime,
    iteratorTime,
    iteratorOverheadVsSync: ((iteratorTime - syncTime) / syncTime) * 100,
    iteratorOverheadVsAsync: ((iteratorTime - asyncTime) / asyncTime) * 100,
  }
}

/**
 * Compare iterator vs stream API
 */
async function compareIteratorVsStream(
  pattern: string,
  cwd: string
): Promise<IteratorVsStreamResult> {
  const fixtureLabel = cwd.includes('small')
    ? 'small'
    : cwd.includes('medium')
      ? 'medium'
      : cwd.includes('large')
        ? 'large'
        : 'unknown'

  const { globStream } = await import('../../js/index.js')
  const { Minipass } = await import('minipass')

  // Measure stream
  const measureStream = () =>
    new Promise<number>((resolve, reject) => {
      const start = performance.now()
      const stream = globStream(pattern, { cwd })
      stream.on('data', () => {})
      stream.on('end', () => resolve(performance.now() - start))
      stream.on('error', reject)
    })

  // Warmup
  await measureStream()
  await measureAsyncIteratorTiming(() => globIterate(pattern, { cwd }))

  // Measure stream times
  const streamTimes: number[] = []
  for (let i = 0; i < 5; i++) {
    streamTimes.push(await measureStream())
  }

  // Measure iterator times
  const iteratorTimes: number[] = []
  for (let i = 0; i < 5; i++) {
    const result = await measureAsyncIteratorTiming(() => globIterate(pattern, { cwd }))
    iteratorTimes.push(result.totalTime)
  }

  const streamTime = median(streamTimes)
  const iteratorTime = median(iteratorTimes)

  return {
    pattern,
    fixture: fixtureLabel,
    streamTime,
    iteratorTime,
    overheadPercent: ((iteratorTime - streamTime) / streamTime) * 100,
  }
}

/**
 * Measure memory usage during iteration
 */
async function measureIteratorMemory(pattern: string, cwd: string): Promise<MemoryIteratorResult> {
  const fixtureLabel = cwd.includes('small')
    ? 'small'
    : cwd.includes('medium')
      ? 'medium'
      : cwd.includes('large')
        ? 'large'
        : 'unknown'

  // Measure sync API memory (baseline)
  forceGC()
  const syncStartHeap = process.memoryUsage().heapUsed
  const syncResults = globSync(pattern, { cwd })
  const syncEndHeap = process.memoryUsage().heapUsed
  const syncHeapDelta = syncEndHeap - syncStartHeap

  forceGC()

  // Measure iterator API memory
  forceGC()
  const iterStartHeap = process.memoryUsage().heapUsed
  let iterPeakHeap = iterStartHeap
  let iterResultCount = 0

  for await (const _result of globIterate(pattern, { cwd })) {
    iterResultCount++
    const currentHeap = process.memoryUsage().heapUsed
    iterPeakHeap = Math.max(iterPeakHeap, currentHeap)
  }

  const iterEndHeap = process.memoryUsage().heapUsed
  const iterHeapDelta = iterPeakHeap - iterStartHeap

  const memorySavingsPercent =
    syncHeapDelta > 0 ? ((syncHeapDelta - iterHeapDelta) / syncHeapDelta) * 100 : 0

  return {
    pattern,
    fixture: fixtureLabel,
    resultCount: syncResults.length,
    syncMemory: {
      peakHeapUsed: syncEndHeap,
      heapUsedDelta: syncHeapDelta,
    },
    iteratorMemory: {
      peakHeapUsed: iterPeakHeap,
      heapUsedDelta: iterHeapDelta,
    },
    memorySavingsPercent,
  }
}

// Test patterns
const SIMPLE_PATTERNS = ['*.js', '*.ts', '*.json']
const RECURSIVE_PATTERNS = ['**/*.js', '**/*.ts', '**/*']
const SCOPED_PATTERNS = ['level0/**/*.js', 'level0/level1/**/*.js']
const COMPLEX_PATTERNS = ['**/*.{js,ts}', 'level{0,1}/**/*.js']

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('Phase 7.4: Comprehensive Iterator API Benchmarking')
  console.log('='.repeat(80))

  const asyncResults: IteratorBenchmarkResult[] = []
  const syncResults: IteratorBenchmarkResult[] = []
  const earlyTermResults: EarlyTerminationResult[] = []
  const iterVsSyncResults: IteratorVsSyncResult[] = []
  const iterVsStreamResults: IteratorVsStreamResult[] = []
  const memoryResults: MemoryIteratorResult[] = []

  const fixtures = [
    { cwd: SMALL_CWD, label: 'small' },
    { cwd: MEDIUM_CWD, label: 'medium' },
    { cwd: LARGE_CWD, label: 'large' },
  ]

  const patterns = [
    ...SIMPLE_PATTERNS.slice(0, 2),
    ...RECURSIVE_PATTERNS.slice(0, 2),
    ...SCOPED_PATTERNS.slice(0, 1),
  ]

  // ========================================
  // 1. Async Iterator Benchmarks
  // ========================================
  console.log('\n' + '-'.repeat(60))
  console.log('1. Async Iterator (globIterate) Benchmarks')
  console.log('-'.repeat(60))

  for (const { cwd, label } of fixtures) {
    console.log(`\n[${label.toUpperCase()} FIXTURE]`)

    for (const pattern of patterns) {
      try {
        const result = await runAsyncIteratorBenchmark(pattern, cwd, 5, 2)
        asyncResults.push(result)

        const speedupStr =
          result.speedupTotal >= 1
            ? `${result.speedupTotal.toFixed(2)}x faster`
            : `${(1 / result.speedupTotal).toFixed(2)}x slower`

        const firstYieldStr =
          result.speedupFirstYield >= 1
            ? `${result.speedupFirstYield.toFixed(2)}x faster`
            : `${(1 / result.speedupFirstYield).toFixed(2)}x slower`

        console.log(
          `  ${pattern.padEnd(25)} | ` +
            `First: ${result.globlin.firstYieldTime.toFixed(2)}ms (${firstYieldStr}) | ` +
            `Total: ${result.globlin.totalTime.toFixed(2)}ms (${speedupStr}) | ` +
            `Match: ${result.resultMatch ? 'YES' : 'NO'}`
        )
      } catch (err) {
        console.log(`  ${pattern.padEnd(25)} | ERROR: ${err}`)
      }
    }
  }

  // ========================================
  // 2. Sync Iterator Benchmarks
  // ========================================
  console.log('\n' + '-'.repeat(60))
  console.log('2. Sync Iterator (globIterateSync) Benchmarks')
  console.log('-'.repeat(60))

  for (const { cwd, label } of fixtures) {
    console.log(`\n[${label.toUpperCase()} FIXTURE]`)

    for (const pattern of patterns.slice(0, 3)) {
      try {
        const result = await runSyncIteratorBenchmark(pattern, cwd, 5, 2)
        syncResults.push(result)

        const speedupStr =
          result.speedupTotal >= 1
            ? `${result.speedupTotal.toFixed(2)}x faster`
            : `${(1 / result.speedupTotal).toFixed(2)}x slower`

        console.log(
          `  ${pattern.padEnd(25)} | ` +
            `Total: ${result.globlin.totalTime.toFixed(2)}ms (${speedupStr}) | ` +
            `Per-yield: ${(result.globlin.perYieldCost * 1000).toFixed(2)}us | ` +
            `Match: ${result.resultMatch ? 'YES' : 'NO'}`
        )
      } catch (err) {
        console.log(`  ${pattern.padEnd(25)} | ERROR: ${err}`)
      }
    }
  }

  // ========================================
  // 3. Early Termination Benchmarks
  // ========================================
  console.log('\n' + '-'.repeat(60))
  console.log('3. Early Termination Efficiency')
  console.log('-'.repeat(60))

  const earlyTermCounts = [10, 100, 1000]

  for (const { cwd, label } of fixtures.slice(1)) {
    // Only medium and large
    console.log(`\n[${label.toUpperCase()} FIXTURE]`)

    const pattern = '**/*.js'
    for (const count of earlyTermCounts) {
      try {
        const result = await runEarlyTerminationBenchmark(pattern, cwd, count)
        earlyTermResults.push(result)

        const speedupStr =
          result.speedup >= 1
            ? `${result.speedup.toFixed(2)}x faster`
            : `${(1 / result.speedup).toFixed(2)}x slower`

        console.log(
          `  Break after ${count.toString().padEnd(5)} | ` +
            `Time: ${result.globlin.time.toFixed(2)}ms (${speedupStr}) | ` +
            `Savings: ${result.timeSavingsPercent.toFixed(1)}% | ` +
            `Full: ${result.fullResultCount} results`
        )
      } catch (err) {
        console.log(`  Break after ${count.toString().padEnd(5)} | ERROR: ${err}`)
      }
    }
  }

  // ========================================
  // 4. Iterator vs Sync/Async Comparison
  // ========================================
  console.log('\n' + '-'.repeat(60))
  console.log('4. Iterator vs Sync/Async API Overhead')
  console.log('-'.repeat(60))

  for (const { cwd, label } of fixtures) {
    console.log(`\n[${label.toUpperCase()} FIXTURE]`)

    for (const pattern of ['**/*.js', '*.js']) {
      try {
        const result = await compareIteratorVsSync(pattern, cwd)
        iterVsSyncResults.push(result)

        const overheadSyncStr =
          result.iteratorOverheadVsSync >= 0
            ? `+${result.iteratorOverheadVsSync.toFixed(1)}%`
            : `${result.iteratorOverheadVsSync.toFixed(1)}%`

        const overheadAsyncStr =
          result.iteratorOverheadVsAsync >= 0
            ? `+${result.iteratorOverheadVsAsync.toFixed(1)}%`
            : `${result.iteratorOverheadVsAsync.toFixed(1)}%`

        console.log(
          `  ${pattern.padEnd(25)} | ` +
            `Sync: ${result.syncTime.toFixed(2)}ms | ` +
            `Async: ${result.asyncCollectTime.toFixed(2)}ms | ` +
            `Iterator: ${result.iteratorTime.toFixed(2)}ms | ` +
            `vs Sync: ${overheadSyncStr}`
        )
      } catch (err) {
        console.log(`  ${pattern.padEnd(25)} | ERROR: ${err}`)
      }
    }
  }

  // ========================================
  // 5. Iterator vs Stream Comparison
  // ========================================
  console.log('\n' + '-'.repeat(60))
  console.log('5. Iterator vs Stream API Comparison')
  console.log('-'.repeat(60))

  for (const { cwd, label } of fixtures) {
    console.log(`\n[${label.toUpperCase()} FIXTURE]`)

    for (const pattern of ['**/*.js', '**/*']) {
      try {
        const result = await compareIteratorVsStream(pattern, cwd)
        iterVsStreamResults.push(result)

        const overheadStr =
          result.overheadPercent >= 0
            ? `+${result.overheadPercent.toFixed(1)}%`
            : `${result.overheadPercent.toFixed(1)}%`

        console.log(
          `  ${pattern.padEnd(25)} | ` +
            `Stream: ${result.streamTime.toFixed(2)}ms | ` +
            `Iterator: ${result.iteratorTime.toFixed(2)}ms | ` +
            `Overhead: ${overheadStr}`
        )
      } catch (err) {
        console.log(`  ${pattern.padEnd(25)} | ERROR: ${err}`)
      }
    }
  }

  // ========================================
  // 6. Memory Usage Comparison
  // ========================================
  console.log('\n' + '-'.repeat(60))
  console.log('6. Memory Usage: Iterator vs Sync')
  console.log('-'.repeat(60))

  for (const { cwd, label } of fixtures.slice(1)) {
    // Only medium and large
    console.log(`\n[${label.toUpperCase()} FIXTURE]`)

    for (const pattern of ['**/*.js', '**/*']) {
      try {
        forceGC()
        const result = await measureIteratorMemory(pattern, cwd)
        memoryResults.push(result)

        const syncMB = (result.syncMemory.heapUsedDelta / 1024 / 1024).toFixed(2)
        const iterMB = (result.iteratorMemory.heapUsedDelta / 1024 / 1024).toFixed(2)

        console.log(
          `  ${pattern.padEnd(25)} | ` +
            `Sync: ${syncMB}MB | ` +
            `Iterator: ${iterMB}MB | ` +
            `Savings: ${result.memorySavingsPercent.toFixed(1)}% | ` +
            `Results: ${result.resultCount}`
        )
      } catch (err) {
        console.log(`  ${pattern.padEnd(25)} | ERROR: ${err}`)
      }
    }
  }

  // ========================================
  // 7. Per-Yield Cost Analysis
  // ========================================
  console.log('\n' + '-'.repeat(60))
  console.log('7. Per-Yield Cost Analysis')
  console.log('-'.repeat(60))

  for (const { cwd, label } of fixtures.slice(1)) {
    console.log(`\n[${label.toUpperCase()} FIXTURE]`)

    for (const result of asyncResults.filter(r => r.fixture === label)) {
      const perYieldUs = result.globlin.perYieldCost * 1000
      console.log(
        `  ${result.pattern.padEnd(25)} | ` +
          `Per-yield: ${perYieldUs.toFixed(2)}us | ` +
          `Results: ${result.globlin.resultCount} | ` +
          `Total: ${result.globlin.totalTime.toFixed(2)}ms`
      )
    }
  }

  // ========================================
  // Summary
  // ========================================
  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))

  // Async iterator summary
  if (asyncResults.length > 0) {
    const avgFirstYieldSpeedup =
      asyncResults.reduce((sum, r) => sum + r.speedupFirstYield, 0) / asyncResults.length
    const avgTotalSpeedup =
      asyncResults.reduce((sum, r) => sum + r.speedupTotal, 0) / asyncResults.length
    const resultsMatching = asyncResults.filter(r => r.resultMatch).length

    console.log(`\nAsync Iterator (globIterate):`)
    console.log(`  Average first yield speedup: ${avgFirstYieldSpeedup.toFixed(2)}x`)
    console.log(`  Average total time speedup: ${avgTotalSpeedup.toFixed(2)}x`)
    console.log(
      `  Results matching: ${resultsMatching}/${asyncResults.length} (${((resultsMatching / asyncResults.length) * 100).toFixed(0)}%)`
    )
  }

  // Sync iterator summary
  if (syncResults.length > 0) {
    const avgSyncSpeedup =
      syncResults.reduce((sum, r) => sum + r.speedupTotal, 0) / syncResults.length
    console.log(`\nSync Iterator (globIterateSync):`)
    console.log(`  Average speedup: ${avgSyncSpeedup.toFixed(2)}x`)
  }

  // Early termination summary
  if (earlyTermResults.length > 0) {
    const avgSavings =
      earlyTermResults.reduce((sum, r) => sum + r.timeSavingsPercent, 0) / earlyTermResults.length
    console.log(`\nEarly Termination:`)
    console.log(`  Average time savings: ${avgSavings.toFixed(1)}%`)
  }

  // Iterator vs sync/async overhead
  if (iterVsSyncResults.length > 0) {
    const avgOverheadVsSync =
      iterVsSyncResults.reduce((sum, r) => sum + r.iteratorOverheadVsSync, 0) /
      iterVsSyncResults.length
    const avgOverheadVsAsync =
      iterVsSyncResults.reduce((sum, r) => sum + r.iteratorOverheadVsAsync, 0) /
      iterVsSyncResults.length
    console.log(`\nIterator Overhead:`)
    console.log(
      `  vs Sync API: ${avgOverheadVsSync >= 0 ? '+' : ''}${avgOverheadVsSync.toFixed(1)}%`
    )
    console.log(
      `  vs Async API: ${avgOverheadVsAsync >= 0 ? '+' : ''}${avgOverheadVsAsync.toFixed(1)}%`
    )
  }

  // Iterator vs stream
  if (iterVsStreamResults.length > 0) {
    const avgOverheadVsStream =
      iterVsStreamResults.reduce((sum, r) => sum + r.overheadPercent, 0) /
      iterVsStreamResults.length
    console.log(`\nIterator vs Stream:`)
    console.log(
      `  Average overhead: ${avgOverheadVsStream >= 0 ? '+' : ''}${avgOverheadVsStream.toFixed(1)}%`
    )
  }

  // Memory summary
  if (memoryResults.length > 0) {
    const avgMemorySavings =
      memoryResults.reduce((sum, r) => sum + r.memorySavingsPercent, 0) / memoryResults.length
    console.log(`\nMemory:`)
    console.log(`  Average memory savings vs sync: ${avgMemorySavings.toFixed(1)}%`)
  }

  // Performance by fixture size
  console.log('\nPerformance by Fixture Size (Async Iterator):')
  for (const label of ['small', 'medium', 'large']) {
    const fixtureResults = asyncResults.filter(r => r.fixture === label)
    if (fixtureResults.length > 0) {
      const avgSpeedup =
        fixtureResults.reduce((sum, r) => sum + r.speedupTotal, 0) / fixtureResults.length
      const fasterCount = fixtureResults.filter(r => r.speedupTotal >= 1).length
      console.log(
        `  ${label.padEnd(8)}: ${avgSpeedup.toFixed(2)}x avg speedup, ` +
          `${fasterCount}/${fixtureResults.length} patterns faster`
      )
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('Benchmark complete!')
}

main().catch(console.error)
