/**
 * Phase 7.3: Comprehensive Streaming API (`globStream`, `globStreamSync`) Benchmarking
 *
 * This benchmark performs a deep dive analysis of the streaming API:
 * - Time to first chunk (first result latency)
 * - Chunk delivery timing (inter-chunk delays)
 * - Backpressure handling
 * - Memory usage during streaming (peak vs sustained)
 * - Large result set streaming (100k+ files)
 *
 * Compare: globlin stream vs glob stream
 * Measure: First result latency, throughput (results/second), memory efficiency,
 *          Minipass overhead, chunk batching behavior
 */

import { glob as ogGlob, globStream as ogGlobStream, globStreamSync as ogGlobStreamSync } from 'glob'
import { globStream, globStreamSync, globSync, glob } from '../../js/index.js'
import { Minipass } from 'minipass'

const SMALL_CWD = './benches/fixtures/small'
const MEDIUM_CWD = './benches/fixtures/medium'
const LARGE_CWD = './benches/fixtures/large'

interface StreamBenchmarkResult {
  pattern: string
  fixture: string
  runs: number
  glob: {
    firstChunkTime: number
    totalTime: number
    resultCount: number
    chunksReceived: number
    avgChunkSize: number
  }
  globlin: {
    firstChunkTime: number
    totalTime: number
    resultCount: number
    chunksReceived: number
    avgChunkSize: number
  }
  speedupFirstChunk: number
  speedupTotal: number
  resultMatch: boolean
}

interface MemoryBenchmarkResult {
  pattern: string
  fixture: string
  resultCount: number
  syncMemory: {
    peakHeapUsed: number
    heapUsedDelta: number
  }
  streamMemory: {
    peakHeapUsed: number
    heapUsedDelta: number
  }
  memorySavingsPercent: number
}

interface BackpressureResult {
  pattern: string
  fixture: string
  slowConsumerDelay: number
  glob: {
    totalTime: number
    resultCount: number
    backpressureEvents: number
  }
  globlin: {
    totalTime: number
    resultCount: number
    backpressureEvents: number
  }
}

interface ThroughputResult {
  pattern: string
  fixture: string
  glob: {
    totalTime: number
    resultCount: number
    throughput: number // results per second
  }
  globlin: {
    totalTime: number
    resultCount: number
    throughput: number
  }
  speedup: number
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
 * Measure time to first chunk and total time for a stream
 */
async function measureStreamTiming(
  streamFn: () => Minipass<string, string>
): Promise<{ firstChunkTime: number; totalTime: number; resultCount: number; chunksReceived: number }> {
  return new Promise((resolve, reject) => {
    const start = performance.now()
    let firstChunkTime = 0
    let resultCount = 0
    let chunksReceived = 0
    let firstChunkRecorded = false

    const stream = streamFn()

    stream.on('data', (data: string | string[]) => {
      if (!firstChunkRecorded) {
        firstChunkTime = performance.now() - start
        firstChunkRecorded = true
      }
      chunksReceived++
      // Handle both single string and array of strings
      if (Array.isArray(data)) {
        resultCount += data.length
      } else {
        resultCount++
      }
    })

    stream.on('end', () => {
      const totalTime = performance.now() - start
      resolve({ firstChunkTime, totalTime, resultCount, chunksReceived })
    })

    stream.on('error', reject)
  })
}

/**
 * Benchmark stream API comparing globlin vs glob
 */
async function runStreamBenchmark(
  pattern: string,
  cwd: string,
  runs = 5,
  warmupRuns = 2
): Promise<StreamBenchmarkResult> {
  const fixtureLabel = cwd.includes('small')
    ? 'small'
    : cwd.includes('medium')
      ? 'medium'
      : cwd.includes('large')
        ? 'large'
        : 'unknown'

  // Warmup
  for (let i = 0; i < warmupRuns; i++) {
    await measureStreamTiming(() => ogGlobStream(pattern, { cwd }))
    await measureStreamTiming(() => globStream(pattern, { cwd }))
  }

  // Benchmark glob stream
  const globResults: Array<{ firstChunkTime: number; totalTime: number; resultCount: number; chunksReceived: number }> = []
  for (let i = 0; i < runs; i++) {
    const result = await measureStreamTiming(() => ogGlobStream(pattern, { cwd }))
    globResults.push(result)
  }

  // Benchmark globlin stream
  const globlinResults: Array<{ firstChunkTime: number; totalTime: number; resultCount: number; chunksReceived: number }> = []
  for (let i = 0; i < runs; i++) {
    const result = await measureStreamTiming(() => globStream(pattern, { cwd }))
    globlinResults.push(result)
  }

  const globFirstChunkMedian = median(globResults.map((r) => r.firstChunkTime))
  const globTotalMedian = median(globResults.map((r) => r.totalTime))
  const globlinFirstChunkMedian = median(globlinResults.map((r) => r.firstChunkTime))
  const globlinTotalMedian = median(globlinResults.map((r) => r.totalTime))

  const globResultCount = globResults[0].resultCount
  const globlinResultCount = globlinResults[0].resultCount
  const resultMatch = globResultCount === globlinResultCount

  return {
    pattern,
    fixture: fixtureLabel,
    runs,
    glob: {
      firstChunkTime: globFirstChunkMedian,
      totalTime: globTotalMedian,
      resultCount: globResultCount,
      chunksReceived: globResults[0].chunksReceived,
      avgChunkSize: globResultCount / globResults[0].chunksReceived,
    },
    globlin: {
      firstChunkTime: globlinFirstChunkMedian,
      totalTime: globlinTotalMedian,
      resultCount: globlinResultCount,
      chunksReceived: globlinResults[0].chunksReceived,
      avgChunkSize: globlinResultCount / globlinResults[0].chunksReceived,
    },
    speedupFirstChunk: globFirstChunkMedian / globlinFirstChunkMedian,
    speedupTotal: globTotalMedian / globlinTotalMedian,
    resultMatch,
  }
}

/**
 * Benchmark sync stream API
 */
async function runSyncStreamBenchmark(
  pattern: string,
  cwd: string,
  runs = 5
): Promise<{ pattern: string; fixture: string; glob: { time: number; count: number }; globlin: { time: number; count: number }; speedup: number }> {
  const fixtureLabel = cwd.includes('small')
    ? 'small'
    : cwd.includes('medium')
      ? 'medium'
      : cwd.includes('large')
        ? 'large'
        : 'unknown'

  // Warmup
  for (let i = 0; i < 2; i++) {
    await measureStreamTiming(() => ogGlobStreamSync(pattern, { cwd }))
    await measureStreamTiming(() => globStreamSync(pattern, { cwd }))
  }

  const globTimes: number[] = []
  const globlinTimes: number[] = []
  let globCount = 0
  let globlinCount = 0

  for (let i = 0; i < runs; i++) {
    const globResult = await measureStreamTiming(() => ogGlobStreamSync(pattern, { cwd }))
    globTimes.push(globResult.totalTime)
    globCount = globResult.resultCount

    const globlinResult = await measureStreamTiming(() => globStreamSync(pattern, { cwd }))
    globlinTimes.push(globlinResult.totalTime)
    globlinCount = globlinResult.resultCount
  }

  const globMedian = median(globTimes)
  const globlinMedian = median(globlinTimes)

  return {
    pattern,
    fixture: fixtureLabel,
    glob: { time: globMedian, count: globCount },
    globlin: { time: globlinMedian, count: globlinCount },
    speedup: globMedian / globlinMedian,
  }
}

/**
 * Measure memory usage during streaming vs sync operations
 */
async function measureMemoryUsage(
  pattern: string,
  cwd: string
): Promise<MemoryBenchmarkResult> {
  const fixtureLabel = cwd.includes('small')
    ? 'small'
    : cwd.includes('medium')
      ? 'medium'
      : cwd.includes('large')
        ? 'large'
        : 'unknown'

  forceGC()
  const baselineHeap = process.memoryUsage().heapUsed

  // Measure sync API memory
  forceGC()
  const syncStartHeap = process.memoryUsage().heapUsed
  let syncPeakHeap = syncStartHeap
  const syncResults = globSync(pattern, { cwd })
  const syncCurrentHeap = process.memoryUsage().heapUsed
  syncPeakHeap = Math.max(syncPeakHeap, syncCurrentHeap)
  const syncHeapDelta = syncCurrentHeap - syncStartHeap

  forceGC()

  // Measure stream API memory
  forceGC()
  const streamStartHeap = process.memoryUsage().heapUsed
  let streamPeakHeap = streamStartHeap
  let streamResultCount = 0

  await new Promise<void>((resolve, reject) => {
    const stream = globStream(pattern, { cwd })
    stream.on('data', () => {
      streamResultCount++
      const currentHeap = process.memoryUsage().heapUsed
      streamPeakHeap = Math.max(streamPeakHeap, currentHeap)
    })
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  const streamEndHeap = process.memoryUsage().heapUsed
  const streamHeapDelta = streamPeakHeap - streamStartHeap

  const memorySavingsPercent =
    syncHeapDelta > 0 ? ((syncHeapDelta - streamHeapDelta) / syncHeapDelta) * 100 : 0

  return {
    pattern,
    fixture: fixtureLabel,
    resultCount: syncResults.length,
    syncMemory: {
      peakHeapUsed: syncPeakHeap - baselineHeap,
      heapUsedDelta: syncHeapDelta,
    },
    streamMemory: {
      peakHeapUsed: streamPeakHeap - baselineHeap,
      heapUsedDelta: streamHeapDelta,
    },
    memorySavingsPercent,
  }
}

/**
 * Measure backpressure handling with slow consumer
 */
async function measureBackpressure(
  pattern: string,
  cwd: string,
  delayMs: number = 1
): Promise<BackpressureResult> {
  const fixtureLabel = cwd.includes('small')
    ? 'small'
    : cwd.includes('medium')
      ? 'medium'
      : cwd.includes('large')
        ? 'large'
        : 'unknown'

  // Measure glob with slow consumer
  const globStart = performance.now()
  let globResultCount = 0
  let globBackpressureEvents = 0

  await new Promise<void>((resolve, reject) => {
    const stream = ogGlobStream(pattern, { cwd })
    stream.on('data', async () => {
      globResultCount++
      // Simulate slow consumer
      await new Promise((r) => setTimeout(r, delayMs))
    })
    stream.on('drain', () => {
      globBackpressureEvents++
    })
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  const globTotalTime = performance.now() - globStart

  // Measure globlin with slow consumer
  const globlinStart = performance.now()
  let globlinResultCount = 0
  let globlinBackpressureEvents = 0

  await new Promise<void>((resolve, reject) => {
    const stream = globStream(pattern, { cwd })
    stream.on('data', async () => {
      globlinResultCount++
      // Simulate slow consumer
      await new Promise((r) => setTimeout(r, delayMs))
    })
    stream.on('drain', () => {
      globlinBackpressureEvents++
    })
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  const globlinTotalTime = performance.now() - globlinStart

  return {
    pattern,
    fixture: fixtureLabel,
    slowConsumerDelay: delayMs,
    glob: {
      totalTime: globTotalTime,
      resultCount: globResultCount,
      backpressureEvents: globBackpressureEvents,
    },
    globlin: {
      totalTime: globlinTotalTime,
      resultCount: globlinResultCount,
      backpressureEvents: globlinBackpressureEvents,
    },
  }
}

/**
 * Measure throughput (results per second)
 */
async function measureThroughput(
  pattern: string,
  cwd: string,
  runs = 3
): Promise<ThroughputResult> {
  const fixtureLabel = cwd.includes('small')
    ? 'small'
    : cwd.includes('medium')
      ? 'medium'
      : cwd.includes('large')
        ? 'large'
        : 'unknown'

  // Warmup
  await measureStreamTiming(() => ogGlobStream(pattern, { cwd }))
  await measureStreamTiming(() => globStream(pattern, { cwd }))

  // Measure glob throughput
  const globResults: { time: number; count: number }[] = []
  for (let i = 0; i < runs; i++) {
    const result = await measureStreamTiming(() => ogGlobStream(pattern, { cwd }))
    globResults.push({ time: result.totalTime, count: result.resultCount })
  }

  // Measure globlin throughput
  const globlinResults: { time: number; count: number }[] = []
  for (let i = 0; i < runs; i++) {
    const result = await measureStreamTiming(() => globStream(pattern, { cwd }))
    globlinResults.push({ time: result.totalTime, count: result.resultCount })
  }

  const globMedianTime = median(globResults.map((r) => r.time))
  const globlinMedianTime = median(globlinResults.map((r) => r.time))
  const globCount = globResults[0].count
  const globlinCount = globlinResults[0].count

  // Throughput in results per second
  const globThroughput = (globCount / globMedianTime) * 1000
  const globlinThroughput = (globlinCount / globlinMedianTime) * 1000

  return {
    pattern,
    fixture: fixtureLabel,
    glob: {
      totalTime: globMedianTime,
      resultCount: globCount,
      throughput: globThroughput,
    },
    globlin: {
      totalTime: globlinMedianTime,
      resultCount: globlinCount,
      throughput: globlinThroughput,
    },
    speedup: globThroughput > 0 ? globlinThroughput / globThroughput : 1,
  }
}

/**
 * Compare stream vs sync API performance
 */
async function compareStreamVsSync(
  pattern: string,
  cwd: string
): Promise<{ pattern: string; fixture: string; syncTime: number; streamTime: number; overhead: number; overheadPercent: number }> {
  const fixtureLabel = cwd.includes('small')
    ? 'small'
    : cwd.includes('medium')
      ? 'medium'
      : cwd.includes('large')
        ? 'large'
        : 'unknown'

  // Warmup
  await glob(pattern, { cwd })
  await measureStreamTiming(() => globStream(pattern, { cwd }))

  // Measure sync
  const syncStart = performance.now()
  await glob(pattern, { cwd })
  const syncTime = performance.now() - syncStart

  // Measure stream
  const streamResult = await measureStreamTiming(() => globStream(pattern, { cwd }))
  const streamTime = streamResult.totalTime

  const overhead = streamTime - syncTime
  const overheadPercent = (overhead / syncTime) * 100

  return {
    pattern,
    fixture: fixtureLabel,
    syncTime,
    streamTime,
    overhead,
    overheadPercent,
  }
}

// Test patterns
const SIMPLE_PATTERNS = ['*.js', '*.ts', '*.json', '*.txt']
const RECURSIVE_PATTERNS = ['**/*.js', '**/*.ts', '**/*', '**/file*.js']
const SCOPED_PATTERNS = ['level0/**/*.js', 'level0/**/*.ts', 'level0/level1/**/*.js']
const COMPLEX_PATTERNS = ['**/*.{js,ts}', 'level{0,1}/**/*.js', '**/level*/**/*.ts']

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('Phase 7.3: Comprehensive Streaming API Benchmarking')
  console.log('='.repeat(80))

  const allResults: StreamBenchmarkResult[] = []
  const syncStreamResults: Array<{ pattern: string; fixture: string; glob: { time: number; count: number }; globlin: { time: number; count: number }; speedup: number }> = []
  const memoryResults: MemoryBenchmarkResult[] = []
  const throughputResults: ThroughputResult[] = []
  const streamVsSyncResults: Array<{ pattern: string; fixture: string; syncTime: number; streamTime: number; overhead: number; overheadPercent: number }> = []

  // ========================================
  // 1. Stream Timing Benchmarks
  // ========================================
  console.log('\n' + '-'.repeat(60))
  console.log('1. Stream Timing Benchmarks (First Chunk & Total Time)')
  console.log('-'.repeat(60))

  const fixtures = [
    { cwd: SMALL_CWD, label: 'small' },
    { cwd: MEDIUM_CWD, label: 'medium' },
    { cwd: LARGE_CWD, label: 'large' },
  ]

  const patterns = [...SIMPLE_PATTERNS.slice(0, 2), ...RECURSIVE_PATTERNS.slice(0, 2), ...SCOPED_PATTERNS.slice(0, 1)]

  for (const { cwd, label } of fixtures) {
    console.log(`\n[${label.toUpperCase()} FIXTURE]`)

    for (const pattern of patterns) {
      try {
        const result = await runStreamBenchmark(pattern, cwd, 5, 2)
        allResults.push(result)

        const speedupStr =
          result.speedupTotal >= 1
            ? `${result.speedupTotal.toFixed(2)}x faster`
            : `${(1 / result.speedupTotal).toFixed(2)}x slower`

        const firstChunkStr =
          result.speedupFirstChunk >= 1
            ? `${result.speedupFirstChunk.toFixed(2)}x faster`
            : `${(1 / result.speedupFirstChunk).toFixed(2)}x slower`

        console.log(
          `  ${pattern.padEnd(25)} | ` +
            `First: ${result.globlin.firstChunkTime.toFixed(2)}ms (${firstChunkStr}) | ` +
            `Total: ${result.globlin.totalTime.toFixed(2)}ms (${speedupStr}) | ` +
            `Match: ${result.resultMatch ? 'YES' : 'NO'}`
        )
      } catch (err) {
        console.log(`  ${pattern.padEnd(25)} | ERROR: ${err}`)
      }
    }
  }

  // ========================================
  // 2. Sync Stream Benchmarks
  // ========================================
  console.log('\n' + '-'.repeat(60))
  console.log('2. Sync Stream API Benchmarks (globStreamSync)')
  console.log('-'.repeat(60))

  for (const { cwd, label } of fixtures) {
    console.log(`\n[${label.toUpperCase()} FIXTURE]`)

    for (const pattern of patterns.slice(0, 3)) {
      try {
        const result = await runSyncStreamBenchmark(pattern, cwd, 5)
        syncStreamResults.push(result)

        const speedupStr =
          result.speedup >= 1
            ? `${result.speedup.toFixed(2)}x faster`
            : `${(1 / result.speedup).toFixed(2)}x slower`

        console.log(
          `  ${pattern.padEnd(25)} | ` +
            `Time: ${result.globlin.time.toFixed(2)}ms (${speedupStr}) | ` +
            `Count: ${result.globlin.count}`
        )
      } catch (err) {
        console.log(`  ${pattern.padEnd(25)} | ERROR: ${err}`)
      }
    }
  }

  // ========================================
  // 3. Memory Usage Comparison
  // ========================================
  console.log('\n' + '-'.repeat(60))
  console.log('3. Memory Usage: Stream vs Sync')
  console.log('-'.repeat(60))

  // Only run memory benchmarks on medium/large fixtures for meaningful results
  for (const { cwd, label } of fixtures.slice(1)) {
    console.log(`\n[${label.toUpperCase()} FIXTURE]`)

    for (const pattern of ['**/*.js', '**/*']) {
      try {
        forceGC()
        const result = await measureMemoryUsage(pattern, cwd)
        memoryResults.push(result)

        const syncMB = (result.syncMemory.heapUsedDelta / 1024 / 1024).toFixed(2)
        const streamMB = (result.streamMemory.heapUsedDelta / 1024 / 1024).toFixed(2)

        console.log(
          `  ${pattern.padEnd(25)} | ` +
            `Sync: ${syncMB}MB | ` +
            `Stream: ${streamMB}MB | ` +
            `Savings: ${result.memorySavingsPercent.toFixed(1)}% | ` +
            `Results: ${result.resultCount}`
        )
      } catch (err) {
        console.log(`  ${pattern.padEnd(25)} | ERROR: ${err}`)
      }
    }
  }

  // ========================================
  // 4. Throughput Measurements
  // ========================================
  console.log('\n' + '-'.repeat(60))
  console.log('4. Throughput (results/second)')
  console.log('-'.repeat(60))

  for (const { cwd, label } of fixtures) {
    console.log(`\n[${label.toUpperCase()} FIXTURE]`)

    for (const pattern of ['**/*.js', '**/*']) {
      try {
        const result = await measureThroughput(pattern, cwd, 3)
        throughputResults.push(result)

        const speedupStr =
          result.speedup >= 1
            ? `${result.speedup.toFixed(2)}x faster`
            : `${(1 / result.speedup).toFixed(2)}x slower`

        console.log(
          `  ${pattern.padEnd(25)} | ` +
            `Glob: ${result.glob.throughput.toFixed(0)} r/s | ` +
            `Globlin: ${result.globlin.throughput.toFixed(0)} r/s | ` +
            `${speedupStr}`
        )
      } catch (err) {
        console.log(`  ${pattern.padEnd(25)} | ERROR: ${err}`)
      }
    }
  }

  // ========================================
  // 5. Stream vs Sync Overhead
  // ========================================
  console.log('\n' + '-'.repeat(60))
  console.log('5. Stream vs Sync Overhead')
  console.log('-'.repeat(60))

  for (const { cwd, label } of fixtures) {
    console.log(`\n[${label.toUpperCase()} FIXTURE]`)

    for (const pattern of ['**/*.js', '*.js']) {
      try {
        const result = await compareStreamVsSync(pattern, cwd)
        streamVsSyncResults.push(result)

        const overheadStr =
          result.overheadPercent >= 0
            ? `+${result.overheadPercent.toFixed(1)}%`
            : `${result.overheadPercent.toFixed(1)}%`

        console.log(
          `  ${pattern.padEnd(25)} | ` +
            `Sync: ${result.syncTime.toFixed(2)}ms | ` +
            `Stream: ${result.streamTime.toFixed(2)}ms | ` +
            `Overhead: ${overheadStr}`
        )
      } catch (err) {
        console.log(`  ${pattern.padEnd(25)} | ERROR: ${err}`)
      }
    }
  }

  // ========================================
  // 6. Chunk Delivery Analysis
  // ========================================
  console.log('\n' + '-'.repeat(60))
  console.log('6. Chunk Delivery Analysis')
  console.log('-'.repeat(60))

  for (const { cwd, label } of fixtures.slice(1)) {
    console.log(`\n[${label.toUpperCase()} FIXTURE]`)

    for (const pattern of ['**/*.js', '**/*']) {
      try {
        const result = allResults.find((r) => r.pattern === pattern && r.fixture === label)
        if (result) {
          console.log(
            `  ${pattern.padEnd(25)} | ` +
              `Glob chunks: ${result.glob.chunksReceived} (avg ${result.glob.avgChunkSize.toFixed(1)} results/chunk) | ` +
              `Globlin chunks: ${result.globlin.chunksReceived} (avg ${result.globlin.avgChunkSize.toFixed(1)} results/chunk)`
          )
        }
      } catch (err) {
        console.log(`  ${pattern.padEnd(25)} | ERROR: ${err}`)
      }
    }
  }

  // ========================================
  // Summary
  // ========================================
  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))

  // Calculate averages
  const avgFirstChunkSpeedup =
    allResults.reduce((sum, r) => sum + r.speedupFirstChunk, 0) / allResults.length
  const avgTotalSpeedup =
    allResults.reduce((sum, r) => sum + r.speedupTotal, 0) / allResults.length
  const resultsMatching = allResults.filter((r) => r.resultMatch).length

  console.log(`\nStream Timing:`)
  console.log(`  Average first chunk speedup: ${avgFirstChunkSpeedup.toFixed(2)}x`)
  console.log(`  Average total time speedup: ${avgTotalSpeedup.toFixed(2)}x`)
  console.log(`  Results matching: ${resultsMatching}/${allResults.length} (${((resultsMatching / allResults.length) * 100).toFixed(0)}%)`)

  const avgSyncStreamSpeedup =
    syncStreamResults.reduce((sum, r) => sum + r.speedup, 0) / syncStreamResults.length
  console.log(`\nSync Stream:`)
  console.log(`  Average speedup: ${avgSyncStreamSpeedup.toFixed(2)}x`)

  if (memoryResults.length > 0) {
    const avgMemorySavings =
      memoryResults.reduce((sum, r) => sum + r.memorySavingsPercent, 0) / memoryResults.length
    console.log(`\nMemory:`)
    console.log(`  Average memory savings: ${avgMemorySavings.toFixed(1)}%`)
  }

  if (throughputResults.length > 0) {
    const avgThroughputSpeedup =
      throughputResults.reduce((sum, r) => sum + r.speedup, 0) / throughputResults.length
    console.log(`\nThroughput:`)
    console.log(`  Average throughput speedup: ${avgThroughputSpeedup.toFixed(2)}x`)
  }

  if (streamVsSyncResults.length > 0) {
    const avgOverhead =
      streamVsSyncResults.reduce((sum, r) => sum + r.overheadPercent, 0) / streamVsSyncResults.length
    console.log(`\nStream vs Sync Overhead:`)
    console.log(`  Average overhead: ${avgOverhead >= 0 ? '+' : ''}${avgOverhead.toFixed(1)}%`)
  }

  // Performance by fixture size
  console.log('\nPerformance by Fixture Size:')
  for (const label of ['small', 'medium', 'large']) {
    const fixtureResults = allResults.filter((r) => r.fixture === label)
    if (fixtureResults.length > 0) {
      const avgSpeedup =
        fixtureResults.reduce((sum, r) => sum + r.speedupTotal, 0) / fixtureResults.length
      const fasterCount = fixtureResults.filter((r) => r.speedupTotal >= 1).length
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
