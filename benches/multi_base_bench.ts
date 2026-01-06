// Benchmark for multi-base pattern walking optimization.
// This benchmark tests the performance improvement from Task 5.10.2:
// walking from multiple base directories instead of cwd when patterns
// have different prefixes (e.g., ['src/**.ts', 'test/**.ts']).

import { globSync } from 'glob'
import { globSync as globlinSync } from '../js/index'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Use medium fixture
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'medium')

// Check if fixture exists
if (!fs.existsSync(FIXTURE_DIR)) {
  console.error('Medium fixture not found. Run: npm run bench:setup')
  process.exit(1)
}

interface BenchmarkResult {
  pattern: string | string[]
  globTime: number
  globlinTime: number
  speedup: number
  globResults: number
  globlinResults: number
  match: boolean
}

function benchmark(
  patterns: string | string[],
  options: { warmup?: number; runs?: number } = {}
): BenchmarkResult {
  const { warmup = 3, runs = 10 } = options
  const opts = { cwd: FIXTURE_DIR }

  // Warmup
  for (let i = 0; i < warmup; i++) {
    globSync(patterns, opts)
    globlinSync(patterns, opts)
  }

  // Benchmark glob
  const globTimes: number[] = []
  let globResults: string[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    globResults = globSync(patterns, opts)
    globTimes.push(performance.now() - start)
  }

  // Benchmark globlin
  const globlinTimes: number[] = []
  let globlinResults: string[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    globlinResults = globlinSync(patterns, opts)
    globlinTimes.push(performance.now() - start)
  }

  // Calculate median times
  globTimes.sort((a, b) => a - b)
  globlinTimes.sort((a, b) => a - b)
  const globTime = globTimes[Math.floor(runs / 2)]
  const globlinTime = globlinTimes[Math.floor(runs / 2)]

  // Check if results match
  const globSet = new Set(globResults)
  const globlinSet = new Set(globlinResults)
  const match = globSet.size === globlinSet.size && [...globSet].every(r => globlinSet.has(r))

  return {
    pattern: patterns,
    globTime,
    globlinTime,
    speedup: globTime / globlinTime,
    globResults: globResults.length,
    globlinResults: globlinResults.length,
    match,
  }
}

console.log('Multi-Base Pattern Benchmark')
console.log('============================')
console.log(`Fixture: ${FIXTURE_DIR}`)
console.log()

// Test patterns
const testCases: { name: string; patterns: string | string[] }[] = [
  // Single-base patterns (baseline)
  {
    name: 'Single base: level0/**/*.js',
    patterns: 'level0/**/*.js',
  },
  {
    name: 'Single base: level0/**/*.ts',
    patterns: 'level0/**/*.ts',
  },

  // Multi-base patterns (should benefit from optimization)
  {
    name: 'Multi-base: [level0/**/*.js, level1/**/*.js]',
    patterns: ['level0/**/*.js', 'level1/**/*.js'],
  },
  {
    name: 'Multi-base: [level0/**/*.ts, level1/**/*.ts]',
    patterns: ['level0/**/*.ts', 'level1/**/*.ts'],
  },
  {
    name: 'Multi-base: [level0/**/*.js, level2/**/*.js]',
    patterns: ['level0/**/*.js', 'level2/**/*.js'],
  },

  // Three bases
  {
    name: 'Multi-base 3x: [level0/**/*.js, level1/**/*.js, level2/**/*.js]',
    patterns: ['level0/**/*.js', 'level1/**/*.js', 'level2/**/*.js'],
  },

  // Mixed with overlapping
  {
    name: 'Multi-base mixed: [level0/**/*.js, level0/**/*.ts]',
    patterns: ['level0/**/*.js', 'level0/**/*.ts'],
  },

  // Comparison: walking from cwd vs multi-base
  {
    name: 'Walk from cwd: **/*.js',
    patterns: '**/*.js',
  },
]

// Run benchmarks
const results: BenchmarkResult[] = []
for (const { name, patterns } of testCases) {
  process.stdout.write(`Running: ${name}... `)
  const result = benchmark(patterns)
  results.push(result)
  console.log(
    `${result.speedup.toFixed(2)}x (${result.globlinTime.toFixed(2)}ms vs ${result.globTime.toFixed(2)}ms)`
  )
}

// Summary
console.log()
console.log('Summary')
console.log('-------')
console.log()
console.log('| Pattern Type | Speedup | Globlin (ms) | Glob (ms) | Results | Match |')
console.log('|--------------|---------|--------------|-----------|---------|-------|')

for (let i = 0; i < results.length; i++) {
  const r = results[i]
  const name = testCases[i].name
  console.log(
    `| ${name.substring(0, 55).padEnd(55)} | ${r.speedup.toFixed(2)}x | ${r.globlinTime.toFixed(2).padStart(12)} | ${r.globTime.toFixed(2).padStart(9)} | ${r.globlinResults.toString().padStart(7)} | ${r.match ? '✓' : '✗'}     |`
  )
}

// Calculate averages for multi-base patterns
const multiBaseResults = results.filter(
  (_, i) => testCases[i].name.includes('Multi-base') && !testCases[i].name.includes('mixed')
)
const avgMultiBase =
  multiBaseResults.reduce((sum, r) => sum + r.speedup, 0) / multiBaseResults.length

console.log()
console.log(`Average speedup for multi-base patterns: ${avgMultiBase.toFixed(2)}x`)

// Check for correctness
const mismatches = results.filter(r => !r.match)
if (mismatches.length > 0) {
  console.log()
  console.log('⚠️  Result mismatches detected:')
  for (const m of mismatches) {
    console.log(
      `  - ${JSON.stringify(m.pattern)}: glob=${m.globResults}, globlin=${m.globlinResults}`
    )
  }
}
