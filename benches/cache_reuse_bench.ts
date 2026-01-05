/**
 * Benchmark: Glob class cache reuse optimization
 *
 * This benchmark measures the performance benefit of:
 * 1. Using the Glob class with reused options (passing Glob instance as options)
 * 2. The pattern cache (same patterns compiled once)
 * 3. Multiple glob operations with similar configurations
 */

import * as path from 'path'
import * as fs from 'fs'
import { glob, globSync, Glob } from '../js/index.js'
import { glob as globOriginal } from 'glob'

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'medium')
const RUNS = 10
const WARMUP_RUNS = 2

async function measureTime(
  fn: () => unknown | Promise<unknown>,
  runs: number = RUNS,
  warmup: number = WARMUP_RUNS
): Promise<{ avg: number; min: number; max: number }> {
  // Warmup runs
  for (let i = 0; i < warmup; i++) {
    await fn()
  }

  const times: number[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    await fn()
    times.push(performance.now() - start)
  }

  return {
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    min: Math.min(...times),
    max: Math.max(...times),
  }
}

function formatMs(ms: number): string {
  return ms.toFixed(2) + 'ms'
}

function formatSpeedup(base: number, test: number): string {
  const speedup = base / test
  if (speedup >= 1) {
    return `${speedup.toFixed(2)}x faster`
  } else {
    return `${(1 / speedup).toFixed(2)}x slower`
  }
}

async function runBenchmarks() {
  // Ensure fixture exists
  if (!fs.existsSync(FIXTURE_PATH)) {
    console.error(`Fixture not found at ${FIXTURE_PATH}`)
    console.log('Run: node benches/setup-fixtures.js to create fixtures')
    process.exit(1)
  }

  console.log('='.repeat(70))
  console.log('Glob Class Cache Reuse Benchmark')
  console.log('='.repeat(70))
  console.log(`Fixture: ${FIXTURE_PATH}`)
  console.log(`Runs per test: ${RUNS} (after ${WARMUP_RUNS} warmup runs)`)
  console.log('')

  const patterns = ['**/*.js', '**/*.ts', '**/*.json', '*.js', 'level0/**/*.js']
  const opts = { cwd: FIXTURE_PATH }

  // ============================================================================
  // Test 1: New Glob instance for each operation (no reuse)
  // ============================================================================
  console.log('1. New Glob instance for each pattern (no reuse)')
  console.log('-'.repeat(50))

  const noReuseTime = await measureTime(async () => {
    for (const pattern of patterns) {
      const g = new Glob(pattern, opts)
      g.walkSync()
    }
  })
  console.log(`   Average: ${formatMs(noReuseTime.avg)}`)
  console.log(`   Min/Max: ${formatMs(noReuseTime.min)} / ${formatMs(noReuseTime.max)}`)
  console.log('')

  // ============================================================================
  // Test 2: Reuse Glob instance as options (cache reuse)
  // ============================================================================
  console.log('2. Reuse Glob instance as options (cache reuse pattern)')
  console.log('-'.repeat(50))

  const reuseTime = await measureTime(async () => {
    // First Glob with initial options
    const g1 = new Glob(patterns[0], opts)
    g1.walkSync()

    // Subsequent Globs reuse g1's options
    for (let i = 1; i < patterns.length; i++) {
      const g = new Glob(patterns[i], g1) // Pass g1 as options
      g.walkSync()
    }
  })
  console.log(`   Average: ${formatMs(reuseTime.avg)}`)
  console.log(`   Min/Max: ${formatMs(reuseTime.min)} / ${formatMs(reuseTime.max)}`)
  console.log(`   vs no reuse: ${formatSpeedup(noReuseTime.avg, reuseTime.avg)}`)
  console.log('')

  // ============================================================================
  // Test 3: Same pattern multiple times (pattern cache benefit)
  // ============================================================================
  console.log('3. Same pattern multiple times (pattern cache benefit)')
  console.log('-'.repeat(50))

  const samePatternTime = await measureTime(async () => {
    for (let i = 0; i < 5; i++) {
      globSync('**/*.js', opts)
    }
  })
  console.log(`   Average: ${formatMs(samePatternTime.avg)}`)
  console.log(`   Min/Max: ${formatMs(samePatternTime.min)} / ${formatMs(samePatternTime.max)}`)
  console.log('')

  // ============================================================================
  // Test 4: Different patterns (no pattern cache benefit)
  // ============================================================================
  console.log('4. Different patterns each time (unique patterns)')
  console.log('-'.repeat(50))

  let counter = 0
  const diffPatternTime = await measureTime(async () => {
    for (let i = 0; i < 5; i++) {
      // Use different patterns each time to avoid cache hits
      globSync(`**/file${counter++}*.js`, opts)
    }
  })
  console.log(`   Average: ${formatMs(diffPatternTime.avg)}`)
  console.log(`   Min/Max: ${formatMs(diffPatternTime.min)} / ${formatMs(diffPatternTime.max)}`)
  console.log('')

  // ============================================================================
  // Test 5: Glob class methods comparison
  // ============================================================================
  console.log('5. Glob class methods (walk vs walkSync vs stream)')
  console.log('-'.repeat(50))

  const g = new Glob('**/*.js', opts)

  const walkSyncTime = await measureTime(() => {
    g.walkSync()
  })
  console.log(`   walkSync: ${formatMs(walkSyncTime.avg)}`)

  const walkAsyncTime = await measureTime(async () => {
    await g.walk()
  })
  console.log(`   walk (async): ${formatMs(walkAsyncTime.avg)}`)

  const streamTime = await measureTime(async () => {
    const results: string[] = []
    const stream = g.stream()
    for await (const item of stream) {
      results.push(item)
    }
  })
  console.log(`   stream: ${formatMs(streamTime.avg)}`)
  console.log('')

  // ============================================================================
  // Test 6: Chained cache reuse (g1 -> g2 -> g3)
  // ============================================================================
  console.log('6. Chained cache reuse (g1 -> g2 -> g3)')
  console.log('-'.repeat(50))

  const chainedTime = await measureTime(async () => {
    const g1 = new Glob('**/*.js', opts)
    g1.walkSync()

    const g2 = new Glob('**/*.ts', g1) // Inherit from g1
    g2.walkSync()

    const g3 = new Glob('**/*.json', g2) // Inherit from g2 (which inherited from g1)
    g3.walkSync()
  })
  console.log(`   Average: ${formatMs(chainedTime.avg)}`)
  console.log(`   Min/Max: ${formatMs(chainedTime.min)} / ${formatMs(chainedTime.max)}`)
  console.log('')

  // ============================================================================
  // Test 7: Comparison with original glob
  // ============================================================================
  console.log('7. Comparison: globlin vs glob (using Glob class)')
  console.log('-'.repeat(50))

  const globlinGlobTime = await measureTime(async () => {
    const g = new Glob('**/*.js', opts)
    return g.walkSync()
  })

  const originalGlobTime = await measureTime(async () => {
    return globOriginal('**/*.js', opts)
  })

  console.log(`   globlin Glob class: ${formatMs(globlinGlobTime.avg)}`)
  console.log(`   original glob: ${formatMs(originalGlobTime.avg)}`)
  console.log(`   Speedup: ${formatSpeedup(originalGlobTime.avg, globlinGlobTime.avg)}`)
  console.log('')

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('='.repeat(70))
  console.log('Summary')
  console.log('='.repeat(70))
  console.log('')
  console.log('Cache reuse benefit (reuse vs no reuse):', 
    formatSpeedup(noReuseTime.avg, reuseTime.avg))
  console.log('Pattern cache benefit (same vs different patterns):',
    formatSpeedup(diffPatternTime.avg, samePatternTime.avg))
  console.log('Glob class vs original glob:',
    formatSpeedup(originalGlobTime.avg, globlinGlobTime.avg))
  console.log('')
}

// Run benchmarks
runBenchmarks().catch(console.error)
