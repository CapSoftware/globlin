#!/usr/bin/env npx tsx
/**
 * Fast-Path Optimization Benchmark (Task 2.5.4.4)
 *
 * Measures the performance improvement from fast-path matching for
 * common extension-only patterns that can skip regex matching.
 *
 * Fast-path patterns:
 * - *.ext (ExtensionOnly)
 * - *.{js,ts} (ExtensionSet)
 * - package.json (LiteralName)
 * - (double-star)/*.ext (RecursiveExtension)
 * - (double-star)/*.{js,ts} (RecursiveExtensionSet)
 *
 * Non-fast-path patterns (requires regex):
 * - Character classes: [0-9]
 * - Extglobs: +(foo|bar)
 * - Wildcards in name: *foo*
 */

import { globSync as globOriginal } from 'glob'
import fg from 'fast-glob'
import { existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Import globlin
import { globSync } from '../js/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = join(__dirname, 'fixtures')

// Parse CLI args
const args = process.argv.slice(2)
const fixtureSize = args.find(a => ['small', 'medium', 'large', 'all'].includes(a)) || 'medium'
const warmupRuns = 5
const benchmarkRuns = 20

// Patterns categorized by fast-path type
const fastPathPatterns = [
  // ExtensionOnly - *.ext at root level
  { pattern: '*.js', fastPath: 'ExtensionOnly', description: 'Simple extension at root' },
  { pattern: '*.ts', fastPath: 'ExtensionOnly', description: 'Simple extension at root' },
  { pattern: '*.txt', fastPath: 'ExtensionOnly', description: 'Simple extension at root' },

  // RecursiveExtension - **/*.ext
  { pattern: '**/*.js', fastPath: 'RecursiveExtension', description: 'Recursive extension' },
  { pattern: '**/*.ts', fastPath: 'RecursiveExtension', description: 'Recursive extension' },
  { pattern: '**/*.txt', fastPath: 'RecursiveExtension', description: 'Recursive extension' },

  // ExtensionSet - *.{ext1,ext2}
  {
    pattern: '**/*.{js,ts}',
    fastPath: 'RecursiveExtensionSet',
    description: 'Recursive extension set',
  },
  {
    pattern: '**/*.{js,ts,txt}',
    fastPath: 'RecursiveExtensionSet',
    description: 'Recursive extension set (3)',
  },
]

// Patterns that require regex (non-fast-path, for comparison)
const regexPatterns = [
  {
    pattern: '**/*[0-9].js',
    fastPath: 'None (char class)',
    description: 'Character class in name',
  },
  {
    pattern: '**/file[0-9][0-9].js',
    fastPath: 'None (char class)',
    description: 'Multiple char classes',
  },
  { pattern: '**/file?.js', fastPath: 'None (question)', description: 'Question mark wildcard' },
  {
    pattern: '**/level*/**/*.js',
    fastPath: 'None (prefix glob)',
    description: 'Wildcard in directory',
  },
]

interface BenchResult {
  pattern: string
  fastPath: string
  description: string
  glob: { time: number; count: number }
  globlin: { time: number; count: number }
  fastglob: { time: number; count: number }
  speedup: number
  vsFastGlob: number
  match: boolean
}

function countFiles(dir: string): number {
  let count = 0
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isFile()) {
      count++
    } else if (entry.isDirectory()) {
      count += countFiles(join(dir, entry.name))
    }
  }
  return count
}

function measureTime(fn: () => unknown[]): { time: number; count: number } {
  const times: number[] = []
  let results: unknown[] = []

  // Warmup
  for (let i = 0; i < warmupRuns; i++) {
    fn()
  }

  // Benchmark
  for (let i = 0; i < benchmarkRuns; i++) {
    const start = performance.now()
    results = fn()
    times.push(performance.now() - start)
  }

  // Return median time (more stable than average)
  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)]

  return { time: median, count: results.length }
}

function runBenchmark(fixtureDir: string, patterns: typeof fastPathPatterns): BenchResult[] {
  const results: BenchResult[] = []

  for (const { pattern, fastPath, description } of patterns) {
    // Benchmark glob
    const globResult = measureTime(() => globOriginal(pattern, { cwd: fixtureDir }))

    // Benchmark globlin
    const globlinResult = measureTime(() => globSync(pattern, { cwd: fixtureDir }))

    // Benchmark fast-glob
    const fastglobResult = measureTime(() => fg.sync(pattern, { cwd: fixtureDir }))

    // Calculate speedups
    const speedup = globResult.time / globlinResult.time
    const vsFastGlob = fastglobResult.time / globlinResult.time

    // Check if results match
    const globSet = new Set(globOriginal(pattern, { cwd: fixtureDir }))
    const globlinSet = new Set(globSync(pattern, { cwd: fixtureDir }))
    const match = globSet.size === globlinSet.size && [...globSet].every(r => globlinSet.has(r))

    results.push({
      pattern,
      fastPath,
      description,
      glob: globResult,
      globlin: globlinResult,
      fastglob: fastglobResult,
      speedup,
      vsFastGlob,
      match,
    })
  }

  return results
}

function formatTime(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(1)}us`
  } else if (ms < 1000) {
    return `${ms.toFixed(2)}ms`
  } else {
    return `${(ms / 1000).toFixed(2)}s`
  }
}

function printTable(title: string, results: BenchResult[]): void {
  console.log('\n  ' + title)
  console.log('  ' + '-'.repeat(110))
  console.log(
    '  ' +
      'Pattern'.padEnd(30) +
      'FastPath'.padEnd(22) +
      'glob'.padStart(10) +
      'globlin'.padStart(10) +
      'fast-glob'.padStart(10) +
      'vs glob'.padStart(10) +
      'vs fg'.padStart(8) +
      'Match'.padStart(8)
  )
  console.log('  ' + '-'.repeat(110))

  for (const r of results) {
    const patternDisplay = r.pattern.length > 28 ? r.pattern.slice(0, 26) + '..' : r.pattern

    const speedupStr =
      r.speedup >= 1 ? `${r.speedup.toFixed(1)}x` : `${(1 / r.speedup).toFixed(1)}x-`

    const vsFgStr =
      r.vsFastGlob >= 1 ? `${r.vsFastGlob.toFixed(1)}x` : `${(1 / r.vsFastGlob).toFixed(1)}x-`

    const speedupColor =
      r.speedup >= 3
        ? '\x1b[32m' // green for 3x+
        : r.speedup >= 2
          ? '\x1b[33m' // yellow for 2x+
          : r.speedup >= 1
            ? '\x1b[0m' // normal for 1x+
            : '\x1b[31m' // red for slower

    const fgColor = r.vsFastGlob >= 1 ? '\x1b[32m' : '\x1b[31m'

    console.log(
      '  ' +
        patternDisplay.padEnd(30) +
        r.fastPath.padEnd(22) +
        formatTime(r.glob.time).padStart(10) +
        formatTime(r.globlin.time).padStart(10) +
        formatTime(r.fastglob.time).padStart(10) +
        speedupColor +
        speedupStr.padStart(10) +
        '\x1b[0m' +
        fgColor +
        vsFgStr.padStart(8) +
        '\x1b[0m' +
        (r.match ? '\x1b[32m  ok\x1b[0m' : '\x1b[31m  FAIL\x1b[0m')
    )
  }
}

async function main() {
  console.log('\n  FAST-PATH OPTIMIZATION BENCHMARK (Task 2.5.4.4)')
  console.log('  ' + '='.repeat(70))
  console.log(`  Warmup runs: ${warmupRuns}`)
  console.log(`  Benchmark runs: ${benchmarkRuns}`)
  console.log(`  Target: 2-3x improvement on extension-only patterns`)

  const fixtures = fixtureSize === 'all' ? ['small', 'medium', 'large'] : [fixtureSize]

  for (const fixture of fixtures) {
    const fixtureDir = join(FIXTURES_DIR, fixture)

    if (!existsSync(fixtureDir)) {
      console.error(`\n  ERROR: Fixture not found: ${fixtureDir}`)
      console.error(`  Run 'npm run bench:setup' first`)
      process.exit(1)
    }

    const fileCount = countFiles(fixtureDir)
    console.log('\n' + '='.repeat(120))
    console.log(`  ${fixture.toUpperCase()} FIXTURE (${fileCount.toLocaleString()} files)`)
    console.log('='.repeat(120))

    // Run fast-path patterns
    const fastPathResults = runBenchmark(fixtureDir, fastPathPatterns)
    printTable(
      'FAST-PATH PATTERNS (extension-only, should use optimized matching):',
      fastPathResults
    )

    // Run regex patterns (for comparison)
    const regexResults = runBenchmark(fixtureDir, regexPatterns)
    printTable('REGEX PATTERNS (requires full regex matching, for comparison):', regexResults)

    // Summary stats
    const fpSpeedups = fastPathResults.map(r => r.speedup)
    const fpAvg = fpSpeedups.reduce((a, b) => a + b, 0) / fpSpeedups.length
    const fpMin = Math.min(...fpSpeedups)
    const fpMax = Math.max(...fpSpeedups)

    const rxSpeedups = regexResults.map(r => r.speedup)
    const rxAvg = rxSpeedups.reduce((a, b) => a + b, 0) / rxSpeedups.length
    const rxMin = Math.min(...rxSpeedups)
    const rxMax = Math.max(...rxSpeedups)

    console.log('\n  SUMMARY')
    console.log('  ' + '-'.repeat(60))
    console.log(`  Fast-path patterns:`)
    console.log(`    Average speedup vs glob: ${fpAvg.toFixed(2)}x`)
    console.log(`    Range: ${fpMin.toFixed(2)}x - ${fpMax.toFixed(2)}x`)
    console.log(
      `    Patterns matching: ${fastPathResults.filter(r => r.match).length}/${fastPathResults.length}`
    )
    console.log('')
    console.log(`  Regex patterns:`)
    console.log(`    Average speedup vs glob: ${rxAvg.toFixed(2)}x`)
    console.log(`    Range: ${rxMin.toFixed(2)}x - ${rxMax.toFixed(2)}x`)
    console.log(
      `    Patterns matching: ${regexResults.filter(r => r.match).length}/${regexResults.length}`
    )

    // Fast-path vs regex comparison
    const improvement = fpAvg / rxAvg
    console.log('')
    console.log('  ' + '='.repeat(60))
    console.log(`  FAST-PATH IMPROVEMENT OVER REGEX PATTERNS: ${improvement.toFixed(2)}x`)

    // Target check
    const target = 2.0 // Target is 2-3x improvement
    if (fpAvg >= target) {
      console.log(`  \x1b[32mTARGET MET: ${fpAvg.toFixed(2)}x >= ${target}x\x1b[0m`)
    } else {
      console.log(`  \x1b[31mTARGET NOT MET: ${fpAvg.toFixed(2)}x < ${target}x\x1b[0m`)
    }
    console.log('  ' + '='.repeat(60))
  }

  console.log('\n  Note: Fast-path optimization skips regex compilation and matching')
  console.log('  for common extension-only patterns, using simple string operations.')
  console.log('')
}

main().catch(console.error)
