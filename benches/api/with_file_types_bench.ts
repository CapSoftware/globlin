/**
 * Phase 7.7: Comprehensive withFileTypes API Benchmarking
 *
 * This benchmark performs a deep dive analysis of the withFileTypes API:
 * - String results vs Path object results (overhead comparison)
 * - PathScurry integration overhead
 * - stat: true vs stat: false impact
 * - isFile()/isDirectory() method call cost
 * - Memory usage with Path objects vs strings
 * - Large result sets with Path objects
 *
 * Compare: globlin withFileTypes vs glob withFileTypes
 * Measure: Path object creation overhead, memory per object, method call efficiency
 */

import { globSync as ogGlobSync, glob as ogGlob } from 'glob'
import { globSync, glob } from '../../js/index.js'

// Define a minimal Path-like interface for benchmark purposes
interface PathLike {
  name: string
  relative(): string
  fullpath(): string
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

const SMALL_CWD = './benches/fixtures/small'
const MEDIUM_CWD = './benches/fixtures/medium'
const LARGE_CWD = './benches/fixtures/large'

interface BenchmarkResult {
  name: string
  pattern: string
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
  perResultOverhead?: number
}

interface MemoryProfile {
  name: string
  pattern: string
  fixture: string
  withFileTypes: boolean
  heapUsedBefore: number
  heapUsedAfter: number
  heapDelta: number
  resultCount: number
  bytesPerResult: number
}

interface MethodCallResult {
  name: string
  totalCalls: number
  totalTimeUs: number
  perCallUs: number
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

function formatBytes(bytes: number): string {
  if (Math.abs(bytes) < 1024) return `${bytes}B`
  if (Math.abs(bytes) < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`
}

/**
 * Section 1: withFileTypes vs string results (overhead comparison)
 */
async function benchmarkOverhead(): Promise<BenchmarkResult[]> {
  console.log('\n' + '='.repeat(80))
  console.log('SECTION 1: withFileTypes OVERHEAD vs STRING RESULTS')
  console.log('='.repeat(80))

  const results: BenchmarkResult[] = []
  const patterns = ['*.js', '**/*.js', 'level0/**/*.js', '**/*']
  const fixtures = [
    { name: 'small', cwd: SMALL_CWD },
    { name: 'medium', cwd: MEDIUM_CWD },
    { name: 'large', cwd: LARGE_CWD },
  ]

  for (const fixture of fixtures) {
    console.log(`\n>>> Fixture: ${fixture.name.toUpperCase()} <<<\n`)
    console.log(
      'Pattern'.padEnd(20) +
        'Str (ms)'.padStart(12) +
        'Path (ms)'.padStart(12) +
        'Overhead'.padStart(12) +
        'Count'.padStart(10) +
        'Per-result'.padStart(14)
    )
    console.log('-'.repeat(80))

    for (const pattern of patterns) {
      const runs = 10
      const warmupRuns = 3

      // Warmup
      for (let i = 0; i < warmupRuns; i++) {
        globSync(pattern, { cwd: fixture.cwd })
        globSync(pattern, { cwd: fixture.cwd, withFileTypes: true })
      }

      // Benchmark string results
      const stringTimes: number[] = []
      let stringCount = 0
      for (let i = 0; i < runs; i++) {
        const start = performance.now()
        const res = globSync(pattern, { cwd: fixture.cwd })
        stringTimes.push(performance.now() - start)
        stringCount = res.length
      }

      // Benchmark Path object results
      const pathTimes: number[] = []
      let pathCount = 0
      for (let i = 0; i < runs; i++) {
        const start = performance.now()
        const res = globSync(pattern, { cwd: fixture.cwd, withFileTypes: true })
        pathTimes.push(performance.now() - start)
        pathCount = res.length
      }

      const stringMedian = median(stringTimes)
      const pathMedian = median(pathTimes)
      const overhead = ((pathMedian - stringMedian) / stringMedian) * 100
      const perResultOverhead = pathCount > 0 ? ((pathMedian - stringMedian) / pathCount) * 1000 : 0 // in µs

      const result: BenchmarkResult = {
        name: `String vs Path (${fixture.name})`,
        pattern,
        fixture: fixture.name,
        runs,
        glob: {
          median: stringMedian,
          p95: percentile(stringTimes, 95),
          p99: percentile(stringTimes, 99),
          min: Math.min(...stringTimes),
          max: Math.max(...stringTimes),
          resultCount: stringCount,
        },
        globlin: {
          median: pathMedian,
          p95: percentile(pathTimes, 95),
          p99: percentile(pathTimes, 99),
          min: Math.min(...pathTimes),
          max: Math.max(...pathTimes),
          resultCount: pathCount,
        },
        speedupVsGlob: stringMedian / pathMedian,
        resultMatch: stringCount === pathCount,
        perResultOverhead,
      }
      results.push(result)

      console.log(
        pattern.padEnd(20) +
          stringMedian.toFixed(2).padStart(12) +
          pathMedian.toFixed(2).padStart(12) +
          `${overhead >= 0 ? '+' : ''}${overhead.toFixed(1)}%`.padStart(12) +
          pathCount.toString().padStart(10) +
          `${perResultOverhead.toFixed(2)}µs`.padStart(14)
      )
    }
  }

  return results
}

/**
 * Section 2: PathScurry integration overhead (globlin vs glob)
 */
async function benchmarkPathScurryIntegration(): Promise<BenchmarkResult[]> {
  console.log('\n' + '='.repeat(80))
  console.log('SECTION 2: PATHSCURRY INTEGRATION (globlin vs glob)')
  console.log('='.repeat(80))

  const results: BenchmarkResult[] = []
  const patterns = ['*.js', '**/*.js', 'level0/**/*.js', '**/*']
  const fixtures = [
    { name: 'small', cwd: SMALL_CWD },
    { name: 'medium', cwd: MEDIUM_CWD },
    { name: 'large', cwd: LARGE_CWD },
  ]

  for (const fixture of fixtures) {
    console.log(`\n>>> Fixture: ${fixture.name.toUpperCase()} <<<\n`)
    console.log(
      'Pattern'.padEnd(20) +
        'Glob (ms)'.padStart(12) +
        'Globlin (ms)'.padStart(14) +
        'Speedup'.padStart(10) +
        'G Count'.padStart(10) +
        'GL Count'.padStart(10) +
        'Match'.padStart(8)
    )
    console.log('-'.repeat(94))

    for (const pattern of patterns) {
      const runs = 10
      const warmupRuns = 3
      const options = { cwd: fixture.cwd, withFileTypes: true }

      // Warmup
      for (let i = 0; i < warmupRuns; i++) {
        ogGlobSync(pattern, options)
        globSync(pattern, options)
      }

      // Benchmark glob
      const globTimes: number[] = []
      let globResults: PathLike[] = []
      for (let i = 0; i < runs; i++) {
        const start = performance.now()
        globResults = ogGlobSync(pattern, options) as unknown as PathLike[]
        globTimes.push(performance.now() - start)
      }

      // Benchmark globlin
      const globlinTimes: number[] = []
      let globlinResults: PathLike[] = []
      for (let i = 0; i < runs; i++) {
        const start = performance.now()
        globlinResults = globSync(pattern, options) as unknown as PathLike[]
        globlinTimes.push(performance.now() - start)
      }

      const globMedian = median(globTimes)
      const globlinMedian = median(globlinTimes)

      // Check result match by comparing relative paths
      const globPaths = new Set(globResults.map((p) => p.relative()))
      const globlinPaths = new Set(globlinResults.map((p) => p.relative()))
      const resultMatch =
        globPaths.size === globlinPaths.size && [...globPaths].every((p) => globlinPaths.has(p))

      const result: BenchmarkResult = {
        name: `PathScurry integration (${fixture.name})`,
        pattern,
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
        speedupVsGlob: globMedian / globlinMedian,
        resultMatch,
      }
      results.push(result)

      console.log(
        pattern.padEnd(20) +
          globMedian.toFixed(2).padStart(12) +
          globlinMedian.toFixed(2).padStart(14) +
          `${result.speedupVsGlob.toFixed(2)}x`.padStart(10) +
          globResults.length.toString().padStart(10) +
          globlinResults.length.toString().padStart(10) +
          (resultMatch ? 'YES' : 'NO').padStart(8)
      )
    }
  }

  return results
}

/**
 * Section 3: stat: true vs stat: false impact
 */
async function benchmarkStatOption(): Promise<BenchmarkResult[]> {
  console.log('\n' + '='.repeat(80))
  console.log('SECTION 3: stat: true vs stat: false IMPACT')
  console.log('='.repeat(80))

  const results: BenchmarkResult[] = []
  const patterns = ['*.js', '**/*.js', '**/*']
  const fixtures = [
    { name: 'small', cwd: SMALL_CWD },
    { name: 'medium', cwd: MEDIUM_CWD },
    { name: 'large', cwd: LARGE_CWD },
  ]

  for (const fixture of fixtures) {
    console.log(`\n>>> Fixture: ${fixture.name.toUpperCase()} <<<\n`)
    console.log(
      'Pattern'.padEnd(20) +
        'stat:false'.padStart(14) +
        'stat:true'.padStart(14) +
        'Overhead'.padStart(12) +
        'Count'.padStart(10)
    )
    console.log('-'.repeat(70))

    for (const pattern of patterns) {
      const runs = 10
      const warmupRuns = 3

      // Warmup
      for (let i = 0; i < warmupRuns; i++) {
        globSync(pattern, { cwd: fixture.cwd, withFileTypes: true })
        globSync(pattern, { cwd: fixture.cwd, withFileTypes: true, stat: true })
      }

      // Benchmark stat: false (default)
      const noStatTimes: number[] = []
      let noStatCount = 0
      for (let i = 0; i < runs; i++) {
        const start = performance.now()
        const res = globSync(pattern, { cwd: fixture.cwd, withFileTypes: true })
        noStatTimes.push(performance.now() - start)
        noStatCount = res.length
      }

      // Benchmark stat: true
      const statTimes: number[] = []
      let statCount = 0
      for (let i = 0; i < runs; i++) {
        const start = performance.now()
        const res = globSync(pattern, { cwd: fixture.cwd, withFileTypes: true, stat: true })
        statTimes.push(performance.now() - start)
        statCount = res.length
      }

      const noStatMedian = median(noStatTimes)
      const statMedian = median(statTimes)
      const overhead = ((statMedian - noStatMedian) / noStatMedian) * 100

      const result: BenchmarkResult = {
        name: `stat option impact (${fixture.name})`,
        pattern,
        fixture: fixture.name,
        runs,
        glob: {
          median: noStatMedian,
          p95: percentile(noStatTimes, 95),
          p99: percentile(noStatTimes, 99),
          min: Math.min(...noStatTimes),
          max: Math.max(...noStatTimes),
          resultCount: noStatCount,
        },
        globlin: {
          median: statMedian,
          p95: percentile(statTimes, 95),
          p99: percentile(statTimes, 99),
          min: Math.min(...statTimes),
          max: Math.max(...statTimes),
          resultCount: statCount,
        },
        speedupVsGlob: noStatMedian / statMedian,
        resultMatch: noStatCount === statCount,
      }
      results.push(result)

      console.log(
        pattern.padEnd(20) +
          noStatMedian.toFixed(2).padStart(14) +
          statMedian.toFixed(2).padStart(14) +
          `${overhead >= 0 ? '+' : ''}${overhead.toFixed(1)}%`.padStart(12) +
          statCount.toString().padStart(10)
      )
    }
  }

  return results
}

/**
 * Section 4: isFile()/isDirectory() method call cost
 */
async function benchmarkMethodCalls(): Promise<MethodCallResult[]> {
  console.log('\n' + '='.repeat(80))
  console.log('SECTION 4: isFile()/isDirectory() METHOD CALL COST')
  console.log('='.repeat(80))

  const results: MethodCallResult[] = []
  const fixture = MEDIUM_CWD
  const pattern = '**/*'

  // Get Path objects with stat: true so isFile/isDirectory work
  const paths = globSync(pattern, { cwd: fixture, withFileTypes: true, stat: true })
  console.log(`\nTesting with ${paths.length} Path objects (medium fixture, stat: true)`)

  // Benchmark isFile()
  console.log('\n4.1 isFile() method:')
  {
    const runs = 100
    const times: number[] = []
    for (let run = 0; run < runs; run++) {
      const start = performance.now()
      for (const path of paths) {
        path.isFile()
      }
      times.push((performance.now() - start) * 1000) // µs
    }

    const totalUs = median(times)
    const perCallUs = totalUs / paths.length

    const result: MethodCallResult = {
      name: 'isFile()',
      totalCalls: paths.length,
      totalTimeUs: totalUs,
      perCallUs,
    }
    results.push(result)

    console.log(`  ${paths.length} calls in ${totalUs.toFixed(2)}µs = ${perCallUs.toFixed(4)}µs/call`)
  }

  // Benchmark isDirectory()
  console.log('\n4.2 isDirectory() method:')
  {
    const runs = 100
    const times: number[] = []
    for (let run = 0; run < runs; run++) {
      const start = performance.now()
      for (const path of paths) {
        path.isDirectory()
      }
      times.push((performance.now() - start) * 1000) // µs
    }

    const totalUs = median(times)
    const perCallUs = totalUs / paths.length

    const result: MethodCallResult = {
      name: 'isDirectory()',
      totalCalls: paths.length,
      totalTimeUs: totalUs,
      perCallUs,
    }
    results.push(result)

    console.log(`  ${paths.length} calls in ${totalUs.toFixed(2)}µs = ${perCallUs.toFixed(4)}µs/call`)
  }

  // Benchmark isSymbolicLink()
  console.log('\n4.3 isSymbolicLink() method:')
  {
    const runs = 100
    const times: number[] = []
    for (let run = 0; run < runs; run++) {
      const start = performance.now()
      for (const path of paths) {
        path.isSymbolicLink()
      }
      times.push((performance.now() - start) * 1000) // µs
    }

    const totalUs = median(times)
    const perCallUs = totalUs / paths.length

    const result: MethodCallResult = {
      name: 'isSymbolicLink()',
      totalCalls: paths.length,
      totalTimeUs: totalUs,
      perCallUs,
    }
    results.push(result)

    console.log(`  ${paths.length} calls in ${totalUs.toFixed(2)}µs = ${perCallUs.toFixed(4)}µs/call`)
  }

  // Benchmark fullpath()
  console.log('\n4.4 fullpath() method:')
  {
    const runs = 100
    const times: number[] = []
    for (let run = 0; run < runs; run++) {
      const start = performance.now()
      for (const path of paths) {
        path.fullpath()
      }
      times.push((performance.now() - start) * 1000) // µs
    }

    const totalUs = median(times)
    const perCallUs = totalUs / paths.length

    const result: MethodCallResult = {
      name: 'fullpath()',
      totalCalls: paths.length,
      totalTimeUs: totalUs,
      perCallUs,
    }
    results.push(result)

    console.log(`  ${paths.length} calls in ${totalUs.toFixed(2)}µs = ${perCallUs.toFixed(4)}µs/call`)
  }

  // Benchmark relative()
  console.log('\n4.5 relative() method:')
  {
    const runs = 100
    const times: number[] = []
    for (let run = 0; run < runs; run++) {
      const start = performance.now()
      for (const path of paths) {
        path.relative()
      }
      times.push((performance.now() - start) * 1000) // µs
    }

    const totalUs = median(times)
    const perCallUs = totalUs / paths.length

    const result: MethodCallResult = {
      name: 'relative()',
      totalCalls: paths.length,
      totalTimeUs: totalUs,
      perCallUs,
    }
    results.push(result)

    console.log(`  ${paths.length} calls in ${totalUs.toFixed(2)}µs = ${perCallUs.toFixed(4)}µs/call`)
  }

  // Benchmark name property access
  console.log('\n4.6 name property access:')
  {
    const runs = 100
    const times: number[] = []
    for (let run = 0; run < runs; run++) {
      const start = performance.now()
      for (const path of paths) {
        void path.name
      }
      times.push((performance.now() - start) * 1000) // µs
    }

    const totalUs = median(times)
    const perCallUs = totalUs / paths.length

    const result: MethodCallResult = {
      name: 'name (property)',
      totalCalls: paths.length,
      totalTimeUs: totalUs,
      perCallUs,
    }
    results.push(result)

    console.log(`  ${paths.length} accesses in ${totalUs.toFixed(2)}µs = ${perCallUs.toFixed(4)}µs/access`)
  }

  return results
}

/**
 * Section 5: Memory usage comparison
 */
async function benchmarkMemory(): Promise<MemoryProfile[]> {
  console.log('\n' + '='.repeat(80))
  console.log('SECTION 5: MEMORY USAGE COMPARISON')
  console.log('='.repeat(80))

  const results: MemoryProfile[] = []
  const pattern = '**/*'
  const fixtures = [
    { name: 'small', cwd: SMALL_CWD },
    { name: 'medium', cwd: MEDIUM_CWD },
    { name: 'large', cwd: LARGE_CWD },
  ]

  for (const fixture of fixtures) {
    console.log(`\n>>> Fixture: ${fixture.name.toUpperCase()} <<<`)

    // String results memory
    forceGC()
    const stringMemBefore = process.memoryUsage()
    const stringResults = globSync(pattern, { cwd: fixture.cwd })
    const stringMemAfter = process.memoryUsage()
    const stringHeapDelta = stringMemAfter.heapUsed - stringMemBefore.heapUsed
    const stringBytesPerResult = stringResults.length > 0 ? stringHeapDelta / stringResults.length : 0

    results.push({
      name: `String results (${fixture.name})`,
      pattern,
      fixture: fixture.name,
      withFileTypes: false,
      heapUsedBefore: stringMemBefore.heapUsed,
      heapUsedAfter: stringMemAfter.heapUsed,
      heapDelta: stringHeapDelta,
      resultCount: stringResults.length,
      bytesPerResult: stringBytesPerResult,
    })

    console.log(`  String results: ${stringResults.length} files, ${formatBytes(stringHeapDelta)} total, ${stringBytesPerResult.toFixed(1)} bytes/result`)

    // Path object results memory
    forceGC()
    const pathMemBefore = process.memoryUsage()
    const pathResults = globSync(pattern, { cwd: fixture.cwd, withFileTypes: true })
    const pathMemAfter = process.memoryUsage()
    const pathHeapDelta = pathMemAfter.heapUsed - pathMemBefore.heapUsed
    const pathBytesPerResult = pathResults.length > 0 ? pathHeapDelta / pathResults.length : 0

    results.push({
      name: `Path objects (${fixture.name})`,
      pattern,
      fixture: fixture.name,
      withFileTypes: true,
      heapUsedBefore: pathMemBefore.heapUsed,
      heapUsedAfter: pathMemAfter.heapUsed,
      heapDelta: pathHeapDelta,
      resultCount: pathResults.length,
      bytesPerResult: pathBytesPerResult,
    })

    console.log(`  Path objects:   ${pathResults.length} files, ${formatBytes(pathHeapDelta)} total, ${pathBytesPerResult.toFixed(1)} bytes/result`)

    // Memory overhead
    const memoryOverhead = pathBytesPerResult - stringBytesPerResult
    console.log(`  Memory overhead per result: ${memoryOverhead.toFixed(1)} bytes (${((memoryOverhead / stringBytesPerResult) * 100).toFixed(1)}%)`)
  }

  return results
}

/**
 * Section 6: Large result sets with Path objects
 */
async function benchmarkLargeResultSets(): Promise<BenchmarkResult[]> {
  console.log('\n' + '='.repeat(80))
  console.log('SECTION 6: LARGE RESULT SETS WITH PATH OBJECTS')
  console.log('='.repeat(80))

  const results: BenchmarkResult[] = []
  const pattern = '**/*'
  const fixture = LARGE_CWD

  console.log(`\n>>> Testing with large fixture (100k files) <<<\n`)

  // Test different pattern complexities
  const patterns = [
    { name: 'All files', pattern: '**/*' },
    { name: 'JS files only', pattern: '**/*.js' },
    { name: 'Root level', pattern: '*' },
    { name: 'Two levels', pattern: '*/*' },
    { name: 'Three levels', pattern: '*/*/*' },
  ]

  console.log(
    'Pattern'.padEnd(20) +
      'Glob (ms)'.padStart(12) +
      'Globlin (ms)'.padStart(14) +
      'Speedup'.padStart(10) +
      'G Count'.padStart(10) +
      'GL Count'.padStart(10) +
      'Match'.padStart(8)
  )
  console.log('-'.repeat(84))

  for (const { name, pattern } of patterns) {
    const runs = 5
    const warmupRuns = 2
    const options = { cwd: fixture, withFileTypes: true }

    // Warmup
    for (let i = 0; i < warmupRuns; i++) {
      ogGlobSync(pattern, options)
      globSync(pattern, options)
    }

    // Benchmark glob
    const globTimes: number[] = []
    let globResults: PathLike[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      globResults = ogGlobSync(pattern, options) as unknown as PathLike[]
      globTimes.push(performance.now() - start)
    }

    // Benchmark globlin
    const globlinTimes: number[] = []
    let globlinResults: PathLike[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      globlinResults = globSync(pattern, options) as unknown as PathLike[]
      globlinTimes.push(performance.now() - start)
    }

    const globMedian = median(globTimes)
    const globlinMedian = median(globlinTimes)

    // Check result match
    const globPaths = new Set(globResults.map((p) => p.relative()))
    const globlinPaths = new Set(globlinResults.map((p) => p.relative()))
    const resultMatch =
      globPaths.size === globlinPaths.size && [...globPaths].every((p) => globlinPaths.has(p))

    const result: BenchmarkResult = {
      name: `Large result set: ${name}`,
      pattern,
      fixture: 'large',
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
      speedupVsGlob: globMedian / globlinMedian,
      resultMatch,
    }
    results.push(result)

    console.log(
      name.padEnd(20) +
        globMedian.toFixed(2).padStart(12) +
        globlinMedian.toFixed(2).padStart(14) +
        `${result.speedupVsGlob.toFixed(2)}x`.padStart(10) +
        globResults.length.toString().padStart(10) +
        globlinResults.length.toString().padStart(10) +
        (resultMatch ? 'YES' : 'NO').padStart(8)
    )
  }

  return results
}

/**
 * Section 7: Async withFileTypes benchmarking
 */
async function benchmarkAsync(): Promise<BenchmarkResult[]> {
  console.log('\n' + '='.repeat(80))
  console.log('SECTION 7: ASYNC withFileTypes API')
  console.log('='.repeat(80))

  const results: BenchmarkResult[] = []
  const patterns = ['*.js', '**/*.js', '**/*']
  const fixtures = [
    { name: 'small', cwd: SMALL_CWD },
    { name: 'medium', cwd: MEDIUM_CWD },
    { name: 'large', cwd: LARGE_CWD },
  ]

  for (const fixture of fixtures) {
    console.log(`\n>>> Fixture: ${fixture.name.toUpperCase()} <<<\n`)
    console.log(
      'Pattern'.padEnd(20) +
        'Glob (ms)'.padStart(12) +
        'Globlin (ms)'.padStart(14) +
        'Speedup'.padStart(10) +
        'G Count'.padStart(10) +
        'GL Count'.padStart(10) +
        'Match'.padStart(8)
    )
    console.log('-'.repeat(94))

    for (const pattern of patterns) {
      const runs = 10
      const warmupRuns = 3
      const options = { cwd: fixture.cwd, withFileTypes: true }

      // Warmup
      for (let i = 0; i < warmupRuns; i++) {
        await ogGlob(pattern, options)
        await glob(pattern, options)
      }

      // Benchmark glob async
      const globTimes: number[] = []
      let globResults: PathLike[] = []
      for (let i = 0; i < runs; i++) {
        const start = performance.now()
        globResults = (await ogGlob(pattern, options)) as unknown as PathLike[]
        globTimes.push(performance.now() - start)
      }

      // Benchmark globlin async
      const globlinTimes: number[] = []
      let globlinResults: PathLike[] = []
      for (let i = 0; i < runs; i++) {
        const start = performance.now()
        globlinResults = (await glob(pattern, options)) as unknown as PathLike[]
        globlinTimes.push(performance.now() - start)
      }

      const globMedian = median(globTimes)
      const globlinMedian = median(globlinTimes)

      // Check result match
      const globPaths = new Set(globResults.map((p) => p.relative()))
      const globlinPaths = new Set(globlinResults.map((p) => p.relative()))
      const resultMatch =
        globPaths.size === globlinPaths.size && [...globPaths].every((p) => globlinPaths.has(p))

      const result: BenchmarkResult = {
        name: `Async withFileTypes (${fixture.name})`,
        pattern,
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
        speedupVsGlob: globMedian / globlinMedian,
        resultMatch,
      }
      results.push(result)

      console.log(
        pattern.padEnd(20) +
          globMedian.toFixed(2).padStart(12) +
          globlinMedian.toFixed(2).padStart(14) +
          `${result.speedupVsGlob.toFixed(2)}x`.padStart(10) +
          globResults.length.toString().padStart(10) +
          globlinResults.length.toString().padStart(10) +
          (resultMatch ? 'YES' : 'NO').padStart(8)
      )
    }
  }

  return results
}

/**
 * Main entry point
 */
async function main() {
  console.log('=' .repeat(80))
  console.log('PHASE 7.7: withFileTypes API DEEP DIVE BENCHMARKING')
  console.log('=' .repeat(80))
  console.log(`Date: ${new Date().toISOString()}`)
  console.log(`Node: ${process.version}`)
  console.log(`Platform: ${process.platform} ${process.arch}`)

  const allResults = {
    overhead: await benchmarkOverhead(),
    pathScurry: await benchmarkPathScurryIntegration(),
    statOption: await benchmarkStatOption(),
    methodCalls: await benchmarkMethodCalls(),
    memory: await benchmarkMemory(),
    largeResults: await benchmarkLargeResultSets(),
    async: await benchmarkAsync(),
  }

  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))

  // PathScurry integration summary
  const pathScurrySpeedups = allResults.pathScurry.map((r) => r.speedupVsGlob)
  const pathScurryMatches = allResults.pathScurry.filter((r) => r.resultMatch).length
  console.log('\nPathScurry integration (globlin vs glob):')
  console.log(`  Average speedup: ${(pathScurrySpeedups.reduce((a, b) => a + b, 0) / pathScurrySpeedups.length).toFixed(2)}x`)
  console.log(`  Result accuracy: ${pathScurryMatches}/${allResults.pathScurry.length} patterns match`)

  // String vs Path overhead summary
  const overheadResults = allResults.overhead.filter((r) => r.perResultOverhead !== undefined)
  const avgOverhead = overheadResults.reduce((a, b) => a + (b.perResultOverhead || 0), 0) / overheadResults.length
  console.log('\nPath object overhead vs strings:')
  console.log(`  Average per-result overhead: ${avgOverhead.toFixed(2)}µs`)

  // stat option summary
  const statResults = allResults.statOption
  const statOverhead = statResults.map((r) => (r.globlin.median - r.glob.median) / r.glob.median * 100)
  console.log('\nstat: true overhead:')
  console.log(`  Average overhead: ${(statOverhead.reduce((a, b) => a + b, 0) / statOverhead.length).toFixed(1)}%`)

  // Method call summary
  console.log('\nPath method call costs:')
  for (const result of allResults.methodCalls) {
    console.log(`  ${result.name.padEnd(20)}: ${result.perCallUs.toFixed(4)}µs/call`)
  }

  // Memory summary
  const memoryResults = allResults.memory
  const pathMemory = memoryResults.filter((r) => r.withFileTypes)
  const stringMemory = memoryResults.filter((r) => !r.withFileTypes)
  console.log('\nMemory usage:')
  for (let i = 0; i < pathMemory.length; i++) {
    const pathMem = pathMemory[i]
    const strMem = stringMemory[i]
    const overhead = pathMem.bytesPerResult - strMem.bytesPerResult
    console.log(`  ${pathMem.fixture}: String ${strMem.bytesPerResult.toFixed(0)}B vs Path ${pathMem.bytesPerResult.toFixed(0)}B (+${overhead.toFixed(0)}B overhead)`)
  }

  // Large result sets summary
  const largeSpeedups = allResults.largeResults.map((r) => r.speedupVsGlob)
  const largeMatches = allResults.largeResults.filter((r) => r.resultMatch).length
  console.log('\nLarge result sets (100k files):')
  console.log(`  Average speedup: ${(largeSpeedups.reduce((a, b) => a + b, 0) / largeSpeedups.length).toFixed(2)}x`)
  console.log(`  Result accuracy: ${largeMatches}/${allResults.largeResults.length} patterns match`)

  // Async summary
  const asyncSpeedups = allResults.async.map((r) => r.speedupVsGlob)
  const asyncMatches = allResults.async.filter((r) => r.resultMatch).length
  console.log('\nAsync withFileTypes:')
  console.log(`  Average speedup: ${(asyncSpeedups.reduce((a, b) => a + b, 0) / asyncSpeedups.length).toFixed(2)}x`)
  console.log(`  Result accuracy: ${asyncMatches}/${allResults.async.length} patterns match`)

  // Overall
  const allSpeedups = [
    ...pathScurrySpeedups,
    ...largeSpeedups,
    ...asyncSpeedups,
  ]
  const allMatches = pathScurryMatches + largeMatches + asyncMatches
  const totalComparisons = allResults.pathScurry.length + allResults.largeResults.length + allResults.async.length
  console.log('\n' + '-'.repeat(80))
  console.log('OVERALL:')
  console.log(`  Average speedup vs glob: ${(allSpeedups.reduce((a, b) => a + b, 0) / allSpeedups.length).toFixed(2)}x`)
  console.log(`  Total result accuracy: ${allMatches}/${totalComparisons} comparisons match (${((allMatches / totalComparisons) * 100).toFixed(1)}%)`)
}

main().catch(console.error)
