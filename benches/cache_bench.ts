/**
 * Benchmark to measure the effect of pattern caching.
 *
 * This benchmark tests scenarios where patterns are compiled multiple times,
 * which benefits from caching:
 * 1. Repeated glob calls with the same patterns
 * 2. Brace expansion producing duplicate patterns
 * 3. Multiple globs with overlapping patterns
 */

import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

interface GloblinModule {
  glob: (pattern: string | string[], options?: { cwd?: string }) => Promise<string[]>
  globSync: (pattern: string | string[], options?: { cwd?: string }) => string[]
}

async function loadGloblin(): Promise<GloblinModule | null> {
  try {
    return await import('../index.js')
  } catch {
    console.log('Globlin not built, skipping benchmark')
    return null
  }
}

async function createBenchmarkFixture(): Promise<string> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-bench-'))

  // Create a reasonable-sized fixture
  for (let i = 0; i < 100; i++) {
    fs.writeFileSync(path.join(tempDir, `file${i}.js`), '')
    fs.writeFileSync(path.join(tempDir, `file${i}.ts`), '')
    fs.writeFileSync(path.join(tempDir, `file${i}.txt`), '')
  }

  fs.mkdirSync(path.join(tempDir, 'src'))
  for (let i = 0; i < 50; i++) {
    fs.writeFileSync(path.join(tempDir, 'src', `module${i}.js`), '')
    fs.writeFileSync(path.join(tempDir, 'src', `module${i}.ts`), '')
  }

  fs.mkdirSync(path.join(tempDir, 'lib'))
  for (let i = 0; i < 50; i++) {
    fs.writeFileSync(path.join(tempDir, 'lib', `util${i}.js`), '')
  }

  return tempDir
}

async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; time: number }> {
  const start = performance.now()
  const result = await fn()
  const time = performance.now() - start
  return { result, time }
}

function measureTimeSync<T>(fn: () => T): { result: T; time: number } {
  const start = performance.now()
  const result = fn()
  const time = performance.now() - start
  return { result, time }
}

async function runBenchmarks() {
  const globlin = await loadGloblin()
  if (!globlin) return

  console.log('Creating benchmark fixture...')
  const fixtureDir = await createBenchmarkFixture()
  console.log(`Fixture created at: ${fixtureDir}`)

  const runs = 50

  console.log('\n=== Pattern Cache Benchmark ===\n')

  // Benchmark 1: Repeated calls with same pattern
  console.log('1. Repeated glob calls with same pattern')
  {
    const pattern = '**/*.js'
    const options = { cwd: fixtureDir }

    // Warmup
    await globlin.glob(pattern, options)

    // First call (cold cache for this pattern if cache was cleared)
    const firstTimes: number[] = []
    const repeatTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      const { time } = await measureTime(() => globlin.glob(pattern, options))
      if (i === 0) {
        firstTimes.push(time)
      } else {
        repeatTimes.push(time)
      }
    }

    const avgFirst = firstTimes.reduce((a, b) => a + b, 0) / firstTimes.length
    const avgRepeat = repeatTimes.reduce((a, b) => a + b, 0) / repeatTimes.length
    console.log(`   First call: ${avgFirst.toFixed(2)}ms`)
    console.log(`   Repeated calls avg: ${avgRepeat.toFixed(2)}ms`)
    console.log(`   (Cache benefit is in pattern compilation, not visible in total time)`)
  }

  // Benchmark 2: Brace expansion with duplicates
  console.log('\n2. Brace expansion with potential duplicates')
  {
    const pattern = '*.{js,ts,js,ts}' // Duplicate extensions
    const options = { cwd: fixtureDir }

    // Warmup
    globlin.globSync(pattern, options)

    const times: number[] = []
    for (let i = 0; i < runs; i++) {
      const { time } = measureTimeSync(() => globlin.globSync(pattern, options))
      times.push(time)
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const min = Math.min(...times)
    const max = Math.max(...times)
    console.log(`   Avg: ${avg.toFixed(2)}ms, Min: ${min.toFixed(2)}ms, Max: ${max.toFixed(2)}ms`)
  }

  // Benchmark 3: Multiple different patterns
  console.log('\n3. Multiple different patterns (cache warmup)')
  {
    const patterns = [
      '*.js',
      '*.ts',
      '**/*.js',
      '**/*.ts',
      'src/**/*.js',
      'lib/**/*.js',
      '**/*.{js,ts}',
    ]
    const options = { cwd: fixtureDir }

    // First pass - patterns being compiled and cached
    const firstPassTimes: number[] = []
    for (const pattern of patterns) {
      const { time } = measureTimeSync(() => globlin.globSync(pattern, options))
      firstPassTimes.push(time)
    }

    // Second pass - patterns should be cached
    const secondPassTimes: number[] = []
    for (const pattern of patterns) {
      const { time } = measureTimeSync(() => globlin.globSync(pattern, options))
      secondPassTimes.push(time)
    }

    const avgFirst = firstPassTimes.reduce((a, b) => a + b, 0) / firstPassTimes.length
    const avgSecond = secondPassTimes.reduce((a, b) => a + b, 0) / secondPassTimes.length
    console.log(`   First pass avg: ${avgFirst.toFixed(2)}ms`)
    console.log(`   Second pass avg: ${avgSecond.toFixed(2)}ms`)
  }

  // Benchmark 4: Heavy brace expansion
  console.log('\n4. Heavy brace expansion pattern')
  {
    const pattern = '**/*.{js,ts,jsx,tsx,json,md,css,scss}'
    const options = { cwd: fixtureDir }

    // Warmup
    globlin.globSync(pattern, options)

    const times: number[] = []
    for (let i = 0; i < runs; i++) {
      const { time } = measureTimeSync(() => globlin.globSync(pattern, options))
      times.push(time)
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const min = Math.min(...times)
    console.log(`   Avg: ${avg.toFixed(2)}ms, Min: ${min.toFixed(2)}ms`)
  }

  // Cleanup
  fs.rmSync(fixtureDir, { recursive: true })
  console.log('\nBenchmark complete!')
}

runBenchmarks().catch(console.error)
