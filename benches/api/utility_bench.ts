/**
 * Phase 7.6: Comprehensive Utility Functions Benchmarking
 *
 * This benchmark performs a deep dive analysis of utility functions:
 * - hasMagic() on various pattern types (simple, complex, many patterns)
 * - escape() on paths with special characters
 * - unescape() on escaped patterns
 * - Batch operations (1k, 10k, 100k patterns)
 * - windowsPathsNoEscape impact
 *
 * Compare: globlin utilities vs glob utilities
 * Measure: Per-call overhead, batch processing throughput, pattern complexity impact
 */

import { hasMagic as ogHasMagic, escape as ogEscape, unescape as ogUnescape } from 'glob'
import { hasMagic, escape, unescape, analyzePattern, analyzePatterns } from '../../js/index.js'

interface BenchmarkResult {
  name: string
  category: string
  runs: number
  glob: {
    median: number
    p95: number
    p99: number
    min: number
    max: number
  }
  globlin: {
    median: number
    p95: number
    p99: number
    min: number
    max: number
  }
  speedupVsGlob: number
  perCallUs?: number
}

interface BatchBenchmarkResult {
  name: string
  batchSize: number
  runs: number
  glob: {
    totalMs: number
    perCallUs: number
  }
  globlin: {
    totalMs: number
    perCallUs: number
  }
  speedupVsGlob: number
}

interface AccuracyResult {
  name: string
  pattern: string | string[]
  globResult: boolean | string
  globlinResult: boolean | string
  match: boolean
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function median(arr: number[]): number {
  return percentile(arr, 50)
}

// Test patterns
const SIMPLE_PATTERNS = ['*.js', '*.ts', 'foo.txt', 'bar', 'README.md']
const MAGIC_PATTERNS = ['**/*.js', '**/node_modules/**', '{a,b,c}.txt', '[abc].js', '!(test).js']
const COMPLEX_PATTERNS = [
  '**/{src,lib}/**/*.{js,ts,jsx,tsx}',
  '+(foo|bar|baz)/**/*.@(js|ts)',
  '**/[[:alpha:]][[:digit:]]*.txt',
  '!(**/test/**|**/*.spec.js)',
  '{1..100}.txt',
]
const ESCAPED_PATTERNS = ['\\*.js', '\\[a-z\\].txt', '\\{a,b\\}.js', '\\!\\(foo\\).ts']
const PATHS_WITH_SPECIAL_CHARS = [
  'file*.txt',
  'file[1].txt',
  'file{a,b}.txt',
  'path/to/file?.js',
  'test(1).ts',
  'data[0-9].json',
]

/**
 * Section 1: hasMagic() Benchmarking
 */
async function benchmarkHasMagic(): Promise<BenchmarkResult[]> {
  console.log('\n' + '='.repeat(80))
  console.log('SECTION 1: hasMagic() BENCHMARKING')
  console.log('='.repeat(80))

  const results: BenchmarkResult[] = []
  const runs = 10000

  // Test 1.1: Simple patterns (no magic)
  console.log('\n1.1 Simple patterns (no magic):')
  {
    const patterns = SIMPLE_PATTERNS
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        ogHasMagic(pattern)
        globTimes.push((performance.now() - start) * 1000) // Convert to µs
      }
    }

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        hasMagic(pattern)
        globlinTimes.push((performance.now() - start) * 1000)
      }
    }

    const result: BenchmarkResult = {
      name: 'Simple patterns (no magic)',
      category: 'hasMagic',
      runs: runs * patterns.length,
      glob: {
        median: median(globTimes),
        p95: percentile(globTimes, 95),
        p99: percentile(globTimes, 99),
        min: Math.min(...globTimes),
        max: Math.max(...globTimes),
      },
      globlin: {
        median: median(globlinTimes),
        p95: percentile(globlinTimes, 95),
        p99: percentile(globlinTimes, 99),
        min: Math.min(...globlinTimes),
        max: Math.max(...globlinTimes),
      },
      speedupVsGlob: median(globTimes) / median(globlinTimes),
      perCallUs: median(globlinTimes),
    }

    results.push(result)
    console.log(
      `  glob: ${result.glob.median.toFixed(3)}µs | globlin: ${result.globlin.median.toFixed(3)}µs | ${result.speedupVsGlob.toFixed(2)}x`
    )
  }

  // Test 1.2: Magic patterns
  console.log('\n1.2 Magic patterns:')
  {
    const patterns = MAGIC_PATTERNS
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        ogHasMagic(pattern)
        globTimes.push((performance.now() - start) * 1000)
      }
    }

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        hasMagic(pattern)
        globlinTimes.push((performance.now() - start) * 1000)
      }
    }

    const result: BenchmarkResult = {
      name: 'Magic patterns',
      category: 'hasMagic',
      runs: runs * patterns.length,
      glob: {
        median: median(globTimes),
        p95: percentile(globTimes, 95),
        p99: percentile(globTimes, 99),
        min: Math.min(...globTimes),
        max: Math.max(...globTimes),
      },
      globlin: {
        median: median(globlinTimes),
        p95: percentile(globlinTimes, 95),
        p99: percentile(globlinTimes, 99),
        min: Math.min(...globlinTimes),
        max: Math.max(...globlinTimes),
      },
      speedupVsGlob: median(globTimes) / median(globlinTimes),
      perCallUs: median(globlinTimes),
    }

    results.push(result)
    console.log(
      `  glob: ${result.glob.median.toFixed(3)}µs | globlin: ${result.globlin.median.toFixed(3)}µs | ${result.speedupVsGlob.toFixed(2)}x`
    )
  }

  // Test 1.3: Complex patterns
  console.log('\n1.3 Complex patterns:')
  {
    const patterns = COMPLEX_PATTERNS
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        ogHasMagic(pattern)
        globTimes.push((performance.now() - start) * 1000)
      }
    }

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        hasMagic(pattern)
        globlinTimes.push((performance.now() - start) * 1000)
      }
    }

    const result: BenchmarkResult = {
      name: 'Complex patterns',
      category: 'hasMagic',
      runs: runs * patterns.length,
      glob: {
        median: median(globTimes),
        p95: percentile(globTimes, 95),
        p99: percentile(globTimes, 99),
        min: Math.min(...globTimes),
        max: Math.max(...globTimes),
      },
      globlin: {
        median: median(globlinTimes),
        p95: percentile(globlinTimes, 95),
        p99: percentile(globlinTimes, 99),
        min: Math.min(...globlinTimes),
        max: Math.max(...globlinTimes),
      },
      speedupVsGlob: median(globTimes) / median(globlinTimes),
      perCallUs: median(globlinTimes),
    }

    results.push(result)
    console.log(
      `  glob: ${result.glob.median.toFixed(3)}µs | globlin: ${result.globlin.median.toFixed(3)}µs | ${result.speedupVsGlob.toFixed(2)}x`
    )
  }

  // Test 1.4: Escaped patterns (no magic after escaping)
  console.log('\n1.4 Escaped patterns:')
  {
    const patterns = ESCAPED_PATTERNS
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        ogHasMagic(pattern)
        globTimes.push((performance.now() - start) * 1000)
      }
    }

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        hasMagic(pattern)
        globlinTimes.push((performance.now() - start) * 1000)
      }
    }

    const result: BenchmarkResult = {
      name: 'Escaped patterns',
      category: 'hasMagic',
      runs: runs * patterns.length,
      glob: {
        median: median(globTimes),
        p95: percentile(globTimes, 95),
        p99: percentile(globTimes, 99),
        min: Math.min(...globTimes),
        max: Math.max(...globTimes),
      },
      globlin: {
        median: median(globlinTimes),
        p95: percentile(globlinTimes, 95),
        p99: percentile(globlinTimes, 99),
        min: Math.min(...globlinTimes),
        max: Math.max(...globlinTimes),
      },
      speedupVsGlob: median(globTimes) / median(globlinTimes),
      perCallUs: median(globlinTimes),
    }

    results.push(result)
    console.log(
      `  glob: ${result.glob.median.toFixed(3)}µs | globlin: ${result.globlin.median.toFixed(3)}µs | ${result.speedupVsGlob.toFixed(2)}x`
    )
  }

  // Test 1.5: Pattern arrays
  console.log('\n1.5 Pattern arrays:')
  {
    const patternArrays = [
      ['*.js', '*.ts'],
      [...SIMPLE_PATTERNS, ...MAGIC_PATTERNS],
      [...SIMPLE_PATTERNS, ...MAGIC_PATTERNS, ...COMPLEX_PATTERNS],
    ]
    const arrayRuns = 5000

    for (const patterns of patternArrays) {
      const globTimes: number[] = []
      const globlinTimes: number[] = []

      for (let i = 0; i < arrayRuns; i++) {
        const start = performance.now()
        ogHasMagic(patterns)
        globTimes.push((performance.now() - start) * 1000)
      }

      for (let i = 0; i < arrayRuns; i++) {
        const start = performance.now()
        hasMagic(patterns)
        globlinTimes.push((performance.now() - start) * 1000)
      }

      const result: BenchmarkResult = {
        name: `Array of ${patterns.length} patterns`,
        category: 'hasMagic',
        runs: arrayRuns,
        glob: {
          median: median(globTimes),
          p95: percentile(globTimes, 95),
          p99: percentile(globTimes, 99),
          min: Math.min(...globTimes),
          max: Math.max(...globTimes),
        },
        globlin: {
          median: median(globlinTimes),
          p95: percentile(globlinTimes, 95),
          p99: percentile(globlinTimes, 99),
          min: Math.min(...globlinTimes),
          max: Math.max(...globlinTimes),
        },
        speedupVsGlob: median(globTimes) / median(globlinTimes),
        perCallUs: median(globlinTimes) / patterns.length,
      }

      results.push(result)
      console.log(
        `  [${patterns.length} patterns] glob: ${result.glob.median.toFixed(3)}µs | globlin: ${result.globlin.median.toFixed(3)}µs | ${result.speedupVsGlob.toFixed(2)}x`
      )
    }
  }

  return results
}

/**
 * Section 2: escape() Benchmarking
 */
async function benchmarkEscape(): Promise<BenchmarkResult[]> {
  console.log('\n' + '='.repeat(80))
  console.log('SECTION 2: escape() BENCHMARKING')
  console.log('='.repeat(80))

  const results: BenchmarkResult[] = []
  const runs = 10000

  // Test 2.1: Paths with special characters
  console.log('\n2.1 Paths with special characters:')
  {
    const paths = PATHS_WITH_SPECIAL_CHARS
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      for (const path of paths) {
        const start = performance.now()
        ogEscape(path)
        globTimes.push((performance.now() - start) * 1000)
      }
    }

    for (let i = 0; i < runs; i++) {
      for (const path of paths) {
        const start = performance.now()
        escape(path)
        globlinTimes.push((performance.now() - start) * 1000)
      }
    }

    const result: BenchmarkResult = {
      name: 'Paths with special chars',
      category: 'escape',
      runs: runs * paths.length,
      glob: {
        median: median(globTimes),
        p95: percentile(globTimes, 95),
        p99: percentile(globTimes, 99),
        min: Math.min(...globTimes),
        max: Math.max(...globTimes),
      },
      globlin: {
        median: median(globlinTimes),
        p95: percentile(globlinTimes, 95),
        p99: percentile(globlinTimes, 99),
        min: Math.min(...globlinTimes),
        max: Math.max(...globlinTimes),
      },
      speedupVsGlob: median(globTimes) / median(globlinTimes),
      perCallUs: median(globlinTimes),
    }

    results.push(result)
    console.log(
      `  glob: ${result.glob.median.toFixed(3)}µs | globlin: ${result.globlin.median.toFixed(3)}µs | ${result.speedupVsGlob.toFixed(2)}x`
    )
  }

  // Test 2.2: Plain paths (no special chars)
  console.log('\n2.2 Plain paths (no special chars):')
  {
    const paths = ['file.txt', 'path/to/file.js', 'README.md', 'src/index.ts', 'package.json']
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      for (const path of paths) {
        const start = performance.now()
        ogEscape(path)
        globTimes.push((performance.now() - start) * 1000)
      }
    }

    for (let i = 0; i < runs; i++) {
      for (const path of paths) {
        const start = performance.now()
        escape(path)
        globlinTimes.push((performance.now() - start) * 1000)
      }
    }

    const result: BenchmarkResult = {
      name: 'Plain paths',
      category: 'escape',
      runs: runs * paths.length,
      glob: {
        median: median(globTimes),
        p95: percentile(globTimes, 95),
        p99: percentile(globTimes, 99),
        min: Math.min(...globTimes),
        max: Math.max(...globTimes),
      },
      globlin: {
        median: median(globlinTimes),
        p95: percentile(globlinTimes, 95),
        p99: percentile(globlinTimes, 99),
        min: Math.min(...globlinTimes),
        max: Math.max(...globlinTimes),
      },
      speedupVsGlob: median(globTimes) / median(globlinTimes),
      perCallUs: median(globlinTimes),
    }

    results.push(result)
    console.log(
      `  glob: ${result.glob.median.toFixed(3)}µs | globlin: ${result.globlin.median.toFixed(3)}µs | ${result.speedupVsGlob.toFixed(2)}x`
    )
  }

  // Test 2.3: Long paths with many special chars
  console.log('\n2.3 Long paths with many special chars:')
  {
    const paths = [
      'very/long/path/to/file[1](2){3}*.txt',
      'another[complex](path){with}?many*.specials.js',
      'deep/nested/path/with/[brackets]/and/(parens)/{braces}/*.ts',
    ]
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      for (const path of paths) {
        const start = performance.now()
        ogEscape(path)
        globTimes.push((performance.now() - start) * 1000)
      }
    }

    for (let i = 0; i < runs; i++) {
      for (const path of paths) {
        const start = performance.now()
        escape(path)
        globlinTimes.push((performance.now() - start) * 1000)
      }
    }

    const result: BenchmarkResult = {
      name: 'Long paths with special chars',
      category: 'escape',
      runs: runs * paths.length,
      glob: {
        median: median(globTimes),
        p95: percentile(globTimes, 95),
        p99: percentile(globTimes, 99),
        min: Math.min(...globTimes),
        max: Math.max(...globTimes),
      },
      globlin: {
        median: median(globlinTimes),
        p95: percentile(globlinTimes, 95),
        p99: percentile(globlinTimes, 99),
        min: Math.min(...globlinTimes),
        max: Math.max(...globlinTimes),
      },
      speedupVsGlob: median(globTimes) / median(globlinTimes),
      perCallUs: median(globlinTimes),
    }

    results.push(result)
    console.log(
      `  glob: ${result.glob.median.toFixed(3)}µs | globlin: ${result.globlin.median.toFixed(3)}µs | ${result.speedupVsGlob.toFixed(2)}x`
    )
  }

  // Test 2.4: windowsPathsNoEscape impact
  console.log('\n2.4 windowsPathsNoEscape impact:')
  {
    const paths = PATHS_WITH_SPECIAL_CHARS
    const globlinTimesDefault: number[] = []
    const globlinTimesWindows: number[] = []

    for (let i = 0; i < runs; i++) {
      for (const path of paths) {
        const start = performance.now()
        escape(path)
        globlinTimesDefault.push((performance.now() - start) * 1000)
      }
    }

    for (let i = 0; i < runs; i++) {
      for (const path of paths) {
        const start = performance.now()
        escape(path, { windowsPathsNoEscape: true })
        globlinTimesWindows.push((performance.now() - start) * 1000)
      }
    }

    console.log(
      `  Default: ${median(globlinTimesDefault).toFixed(3)}µs | windowsPathsNoEscape: ${median(globlinTimesWindows).toFixed(3)}µs`
    )
    console.log(
      `  Impact: ${((median(globlinTimesWindows) / median(globlinTimesDefault) - 1) * 100).toFixed(1)}%`
    )
  }

  return results
}

/**
 * Section 3: unescape() Benchmarking
 */
async function benchmarkUnescape(): Promise<BenchmarkResult[]> {
  console.log('\n' + '='.repeat(80))
  console.log('SECTION 3: unescape() BENCHMARKING')
  console.log('='.repeat(80))

  const results: BenchmarkResult[] = []
  const runs = 10000

  // Test 3.1: Escaped patterns
  console.log('\n3.1 Escaped patterns:')
  {
    // Create escaped patterns to unescape
    const patterns = PATHS_WITH_SPECIAL_CHARS.map((p) => ogEscape(p))
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        ogUnescape(pattern)
        globTimes.push((performance.now() - start) * 1000)
      }
    }

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        unescape(pattern)
        globlinTimes.push((performance.now() - start) * 1000)
      }
    }

    const result: BenchmarkResult = {
      name: 'Escaped patterns',
      category: 'unescape',
      runs: runs * patterns.length,
      glob: {
        median: median(globTimes),
        p95: percentile(globTimes, 95),
        p99: percentile(globTimes, 99),
        min: Math.min(...globTimes),
        max: Math.max(...globTimes),
      },
      globlin: {
        median: median(globlinTimes),
        p95: percentile(globlinTimes, 95),
        p99: percentile(globlinTimes, 99),
        min: Math.min(...globlinTimes),
        max: Math.max(...globlinTimes),
      },
      speedupVsGlob: median(globTimes) / median(globlinTimes),
      perCallUs: median(globlinTimes),
    }

    results.push(result)
    console.log(
      `  glob: ${result.glob.median.toFixed(3)}µs | globlin: ${result.globlin.median.toFixed(3)}µs | ${result.speedupVsGlob.toFixed(2)}x`
    )
  }

  // Test 3.2: Heavily escaped patterns
  console.log('\n3.2 Heavily escaped patterns:')
  {
    const patterns = [
      '\\*\\*\\/\\*.\\[j\\]s',
      '\\{a\\,b\\,c\\}\\/\\[0\\-9\\].txt',
      '\\!\\(foo\\|bar\\)\\/\\?\\*.ts',
    ]
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        ogUnescape(pattern)
        globTimes.push((performance.now() - start) * 1000)
      }
    }

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        unescape(pattern)
        globlinTimes.push((performance.now() - start) * 1000)
      }
    }

    const result: BenchmarkResult = {
      name: 'Heavily escaped patterns',
      category: 'unescape',
      runs: runs * patterns.length,
      glob: {
        median: median(globTimes),
        p95: percentile(globTimes, 95),
        p99: percentile(globTimes, 99),
        min: Math.min(...globTimes),
        max: Math.max(...globTimes),
      },
      globlin: {
        median: median(globlinTimes),
        p95: percentile(globlinTimes, 95),
        p99: percentile(globlinTimes, 99),
        min: Math.min(...globlinTimes),
        max: Math.max(...globlinTimes),
      },
      speedupVsGlob: median(globTimes) / median(globlinTimes),
      perCallUs: median(globlinTimes),
    }

    results.push(result)
    console.log(
      `  glob: ${result.glob.median.toFixed(3)}µs | globlin: ${result.globlin.median.toFixed(3)}µs | ${result.speedupVsGlob.toFixed(2)}x`
    )
  }

  // Test 3.3: Plain patterns (no escapes)
  console.log('\n3.3 Plain patterns (no escapes):')
  {
    const patterns = ['file.txt', 'path/to/file.js', 'README.md', 'src/index.ts', 'package.json']
    const globTimes: number[] = []
    const globlinTimes: number[] = []

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        ogUnescape(pattern)
        globTimes.push((performance.now() - start) * 1000)
      }
    }

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        unescape(pattern)
        globlinTimes.push((performance.now() - start) * 1000)
      }
    }

    const result: BenchmarkResult = {
      name: 'Plain patterns (no escapes)',
      category: 'unescape',
      runs: runs * patterns.length,
      glob: {
        median: median(globTimes),
        p95: percentile(globTimes, 95),
        p99: percentile(globTimes, 99),
        min: Math.min(...globTimes),
        max: Math.max(...globTimes),
      },
      globlin: {
        median: median(globlinTimes),
        p95: percentile(globlinTimes, 95),
        p99: percentile(globlinTimes, 99),
        min: Math.min(...globlinTimes),
        max: Math.max(...globlinTimes),
      },
      speedupVsGlob: median(globTimes) / median(globlinTimes),
      perCallUs: median(globlinTimes),
    }

    results.push(result)
    console.log(
      `  glob: ${result.glob.median.toFixed(3)}µs | globlin: ${result.globlin.median.toFixed(3)}µs | ${result.speedupVsGlob.toFixed(2)}x`
    )
  }

  return results
}

/**
 * Section 4: Batch Operations Benchmarking
 */
async function benchmarkBatchOperations(): Promise<BatchBenchmarkResult[]> {
  console.log('\n' + '='.repeat(80))
  console.log('SECTION 4: BATCH OPERATIONS')
  console.log('='.repeat(80))

  const results: BatchBenchmarkResult[] = []
  const batchSizes = [1000, 10000, 100000]

  // Generate test patterns for batch operations
  function generatePatterns(count: number): string[] {
    const patterns: string[] = []
    const templates = [
      '*.js',
      '*.ts',
      '**/*.js',
      'src/**/*.ts',
      '{a,b}.txt',
      '[abc].js',
      'file[0-9].txt',
      '!(test).js',
    ]
    for (let i = 0; i < count; i++) {
      patterns.push(templates[i % templates.length].replace('.', `${i}.`))
    }
    return patterns
  }

  // Test 4.1: Batch hasMagic
  console.log('\n4.1 Batch hasMagic():')
  for (const size of batchSizes) {
    const patterns = generatePatterns(size)
    const runs = 5

    // glob batch
    const globTimes: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      for (const pattern of patterns) {
        ogHasMagic(pattern)
      }
      globTimes.push(performance.now() - start)
    }

    // globlin batch
    const globlinTimes: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      for (const pattern of patterns) {
        hasMagic(pattern)
      }
      globlinTimes.push(performance.now() - start)
    }

    const globMedian = median(globTimes)
    const globlinMedian = median(globlinTimes)

    const result: BatchBenchmarkResult = {
      name: 'Batch hasMagic',
      batchSize: size,
      runs,
      glob: {
        totalMs: globMedian,
        perCallUs: (globMedian / size) * 1000,
      },
      globlin: {
        totalMs: globlinMedian,
        perCallUs: (globlinMedian / size) * 1000,
      },
      speedupVsGlob: globMedian / globlinMedian,
    }

    results.push(result)
    console.log(
      `  [${size.toLocaleString()} patterns] glob: ${result.glob.totalMs.toFixed(2)}ms (${result.glob.perCallUs.toFixed(3)}µs/call) | globlin: ${result.globlin.totalMs.toFixed(2)}ms (${result.globlin.perCallUs.toFixed(3)}µs/call) | ${result.speedupVsGlob.toFixed(2)}x`
    )
  }

  // Test 4.2: Batch escape
  console.log('\n4.2 Batch escape():')
  for (const size of batchSizes) {
    const paths = generatePatterns(size).map((p) => p.replace('*', 'x').replace('?', 'y'))
    const runs = 5

    // glob batch
    const globTimes: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      for (const path of paths) {
        ogEscape(path)
      }
      globTimes.push(performance.now() - start)
    }

    // globlin batch
    const globlinTimes: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      for (const path of paths) {
        escape(path)
      }
      globlinTimes.push(performance.now() - start)
    }

    const globMedian = median(globTimes)
    const globlinMedian = median(globlinTimes)

    const result: BatchBenchmarkResult = {
      name: 'Batch escape',
      batchSize: size,
      runs,
      glob: {
        totalMs: globMedian,
        perCallUs: (globMedian / size) * 1000,
      },
      globlin: {
        totalMs: globlinMedian,
        perCallUs: (globlinMedian / size) * 1000,
      },
      speedupVsGlob: globMedian / globlinMedian,
    }

    results.push(result)
    console.log(
      `  [${size.toLocaleString()} paths] glob: ${result.glob.totalMs.toFixed(2)}ms (${result.glob.perCallUs.toFixed(3)}µs/call) | globlin: ${result.globlin.totalMs.toFixed(2)}ms (${result.globlin.perCallUs.toFixed(3)}µs/call) | ${result.speedupVsGlob.toFixed(2)}x`
    )
  }

  // Test 4.3: Batch unescape
  console.log('\n4.3 Batch unescape():')
  for (const size of batchSizes) {
    const paths = generatePatterns(size).map((p) => ogEscape(p))
    const runs = 5

    // glob batch
    const globTimes: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      for (const path of paths) {
        ogUnescape(path)
      }
      globTimes.push(performance.now() - start)
    }

    // globlin batch
    const globlinTimes: number[] = []
    for (let i = 0; i < runs; i++) {
      const start = performance.now()
      for (const path of paths) {
        unescape(path)
      }
      globlinTimes.push(performance.now() - start)
    }

    const globMedian = median(globTimes)
    const globlinMedian = median(globlinTimes)

    const result: BatchBenchmarkResult = {
      name: 'Batch unescape',
      batchSize: size,
      runs,
      glob: {
        totalMs: globMedian,
        perCallUs: (globMedian / size) * 1000,
      },
      globlin: {
        totalMs: globlinMedian,
        perCallUs: (globlinMedian / size) * 1000,
      },
      speedupVsGlob: globMedian / globlinMedian,
    }

    results.push(result)
    console.log(
      `  [${size.toLocaleString()} patterns] glob: ${result.glob.totalMs.toFixed(2)}ms (${result.glob.perCallUs.toFixed(3)}µs/call) | globlin: ${result.globlin.totalMs.toFixed(2)}ms (${result.globlin.perCallUs.toFixed(3)}µs/call) | ${result.speedupVsGlob.toFixed(2)}x`
    )
  }

  return results
}

/**
 * Section 5: analyzePattern() Benchmarking (globlin-only)
 */
async function benchmarkAnalyzePattern(): Promise<void> {
  console.log('\n' + '='.repeat(80))
  console.log('SECTION 5: analyzePattern() BENCHMARKING (globlin-only)')
  console.log('='.repeat(80))

  const runs = 10000

  // Test 5.1: Simple patterns
  console.log('\n5.1 Simple patterns:')
  {
    const patterns = SIMPLE_PATTERNS
    const times: number[] = []

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        analyzePattern(pattern)
        times.push((performance.now() - start) * 1000)
      }
    }

    console.log(`  Median: ${median(times).toFixed(3)}µs | P95: ${percentile(times, 95).toFixed(3)}µs`)
  }

  // Test 5.2: Patterns with potential issues
  console.log('\n5.2 Patterns with potential issues:')
  {
    const patterns = [
      '\\*.js', // escaped wildcard at start
      '*.txt   ', // trailing spaces
      '', // empty pattern
      '**/**/**/*.js', // multiple globstars
      'file\\\\name.txt', // double escaped
    ]
    const times: number[] = []

    for (let i = 0; i < runs; i++) {
      for (const pattern of patterns) {
        const start = performance.now()
        analyzePattern(pattern)
        times.push((performance.now() - start) * 1000)
      }
    }

    console.log(`  Median: ${median(times).toFixed(3)}µs | P95: ${percentile(times, 95).toFixed(3)}µs`)
  }

  // Test 5.3: analyzePatterns batch
  console.log('\n5.3 analyzePatterns() batch:')
  {
    const patternSets = [
      SIMPLE_PATTERNS,
      [...SIMPLE_PATTERNS, ...MAGIC_PATTERNS],
      [...SIMPLE_PATTERNS, ...MAGIC_PATTERNS, ...COMPLEX_PATTERNS],
    ]

    for (const patterns of patternSets) {
      const times: number[] = []
      for (let i = 0; i < runs; i++) {
        const start = performance.now()
        analyzePatterns(patterns)
        times.push((performance.now() - start) * 1000)
      }

      console.log(
        `  [${patterns.length} patterns] Median: ${median(times).toFixed(3)}µs | Per-pattern: ${(median(times) / patterns.length).toFixed(3)}µs`
      )
    }
  }
}

/**
 * Section 6: Accuracy Verification
 */
async function verifyAccuracy(): Promise<AccuracyResult[]> {
  console.log('\n' + '='.repeat(80))
  console.log('SECTION 6: ACCURACY VERIFICATION')
  console.log('='.repeat(80))

  const results: AccuracyResult[] = []

  // Test hasMagic accuracy
  console.log('\n6.1 hasMagic() accuracy:')
  const hasMagicTestPatterns = [
    ...SIMPLE_PATTERNS,
    ...MAGIC_PATTERNS,
    ...COMPLEX_PATTERNS,
    ...ESCAPED_PATTERNS,
  ]

  let hasMagicMatches = 0
  for (const pattern of hasMagicTestPatterns) {
    const globResult = ogHasMagic(pattern)
    const globlinResult = hasMagic(pattern)
    const match = globResult === globlinResult

    results.push({
      name: 'hasMagic',
      pattern,
      globResult,
      globlinResult,
      match,
    })

    if (match) hasMagicMatches++
    if (!match) {
      console.log(`  MISMATCH: "${pattern}" - glob: ${globResult}, globlin: ${globlinResult}`)
    }
  }
  console.log(`  ${hasMagicMatches}/${hasMagicTestPatterns.length} patterns match (${((hasMagicMatches / hasMagicTestPatterns.length) * 100).toFixed(1)}%)`)

  // Test escape accuracy
  console.log('\n6.2 escape() accuracy:')
  const escapeTestPaths = [...PATHS_WITH_SPECIAL_CHARS, 'plain.txt', 'no-specials.js']

  let escapeMatches = 0
  for (const path of escapeTestPaths) {
    const globResult = ogEscape(path)
    const globlinResult = escape(path)
    const match = globResult === globlinResult

    results.push({
      name: 'escape',
      pattern: path,
      globResult,
      globlinResult,
      match,
    })

    if (match) escapeMatches++
    if (!match) {
      console.log(`  MISMATCH: "${path}" - glob: "${globResult}", globlin: "${globlinResult}"`)
    }
  }
  console.log(`  ${escapeMatches}/${escapeTestPaths.length} paths match (${((escapeMatches / escapeTestPaths.length) * 100).toFixed(1)}%)`)

  // Test unescape accuracy
  console.log('\n6.3 unescape() accuracy:')
  const unescapeTestPatterns = escapeTestPaths.map((p) => ogEscape(p))

  let unescapeMatches = 0
  for (const pattern of unescapeTestPatterns) {
    const globResult = ogUnescape(pattern)
    const globlinResult = unescape(pattern)
    const match = globResult === globlinResult

    results.push({
      name: 'unescape',
      pattern,
      globResult,
      globlinResult,
      match,
    })

    if (match) unescapeMatches++
    if (!match) {
      console.log(`  MISMATCH: "${pattern}" - glob: "${globResult}", globlin: "${globlinResult}"`)
    }
  }
  console.log(`  ${unescapeMatches}/${unescapeTestPatterns.length} patterns match (${((unescapeMatches / unescapeTestPatterns.length) * 100).toFixed(1)}%)`)

  return results
}

/**
 * Main entry point
 */
async function main() {
  console.log('=' .repeat(80))
  console.log('PHASE 7.6: UTILITY FUNCTIONS BENCHMARKING')
  console.log('=' .repeat(80))
  console.log(`Date: ${new Date().toISOString()}`)
  console.log(`Node: ${process.version}`)
  console.log(`Platform: ${process.platform} ${process.arch}`)

  const allResults = {
    hasMagic: await benchmarkHasMagic(),
    escape: await benchmarkEscape(),
    unescape: await benchmarkUnescape(),
    batch: await benchmarkBatchOperations(),
    accuracy: await verifyAccuracy(),
  }

  await benchmarkAnalyzePattern()

  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))

  // Calculate averages by category
  const hasMagicSpeedups = allResults.hasMagic.map((r) => r.speedupVsGlob)
  const escapeSpeedups = allResults.escape.map((r) => r.speedupVsGlob)
  const unescapeSpeedups = allResults.unescape.map((r) => r.speedupVsGlob)
  const batchSpeedups = allResults.batch.map((r) => r.speedupVsGlob)

  console.log('\nAverage speedups vs glob:')
  console.log(`  hasMagic(): ${(hasMagicSpeedups.reduce((a, b) => a + b, 0) / hasMagicSpeedups.length).toFixed(2)}x`)
  console.log(`  escape():   ${(escapeSpeedups.reduce((a, b) => a + b, 0) / escapeSpeedups.length).toFixed(2)}x`)
  console.log(`  unescape(): ${(unescapeSpeedups.reduce((a, b) => a + b, 0) / unescapeSpeedups.length).toFixed(2)}x`)
  console.log(`  Batch:      ${(batchSpeedups.reduce((a, b) => a + b, 0) / batchSpeedups.length).toFixed(2)}x`)

  const allSpeedups = [...hasMagicSpeedups, ...escapeSpeedups, ...unescapeSpeedups, ...batchSpeedups]
  console.log(`\nOverall average: ${(allSpeedups.reduce((a, b) => a + b, 0) / allSpeedups.length).toFixed(2)}x`)

  // Accuracy summary
  const accuracyResults = allResults.accuracy
  const totalTests = accuracyResults.length
  const passingTests = accuracyResults.filter((r) => r.match).length
  console.log(`\nAccuracy: ${passingTests}/${totalTests} tests match (${((passingTests / totalTests) * 100).toFixed(1)}%)`)

  // Per-call overhead summary
  console.log('\nPer-call overhead (globlin):')
  const hasMagicPerCall = allResults.hasMagic.filter((r) => r.perCallUs).map((r) => r.perCallUs!)
  const escapePerCall = allResults.escape.filter((r) => r.perCallUs).map((r) => r.perCallUs!)
  const unescapePerCall = allResults.unescape.filter((r) => r.perCallUs).map((r) => r.perCallUs!)

  if (hasMagicPerCall.length > 0) {
    console.log(`  hasMagic(): ${(hasMagicPerCall.reduce((a, b) => a + b, 0) / hasMagicPerCall.length).toFixed(3)}µs/call`)
  }
  if (escapePerCall.length > 0) {
    console.log(`  escape():   ${(escapePerCall.reduce((a, b) => a + b, 0) / escapePerCall.length).toFixed(3)}µs/call`)
  }
  if (unescapePerCall.length > 0) {
    console.log(`  unescape(): ${(unescapePerCall.reduce((a, b) => a + b, 0) / unescapePerCall.length).toFixed(3)}µs/call`)
  }
}

main().catch(console.error)
