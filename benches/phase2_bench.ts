#!/usr/bin/env npx tsx
/**
 * Phase 2 Performance Checkpoint Benchmark
 * 
 * Tests all pattern types from patterns.sh against glob, globlin, and fast-glob
 * to measure Phase 2 implementation performance.
 */

import { globSync as globOriginal } from 'glob'
import fg from 'fast-glob'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Import globlin
import { globSync } from '../js/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = join(__dirname, 'fixtures')

// Parse CLI args
const args = process.argv.slice(2)
const fixtureSize = args.find(a => ['small', 'medium', 'large', 'all'].includes(a)) || 'medium'
const jsonOutput = args.includes('--json')
const warmupRuns = 3
const benchmarkRuns = 10

// All patterns from patterns.sh
const patterns = [
  // Simple patterns
  { pattern: '*.js', type: 'simple' },
  { pattern: '*.ts', type: 'simple' },
  { pattern: '*.txt', type: 'simple' },
  
  // Recursive patterns
  { pattern: '**/*.js', type: 'recursive' },
  { pattern: '**/*.ts', type: 'recursive' },
  { pattern: '**/*.txt', type: 'recursive' },
  
  // Scoped recursive
  { pattern: 'level0/**/*.js', type: 'scoped' },
  { pattern: '**/level1/**/*.ts', type: 'scoped' },
  { pattern: '**/*/**/*.js', type: 'nested' },
  
  // Brace expansion
  { pattern: '**/*.{js,ts}', type: 'brace' },
  { pattern: 'level{0,1}/**/*.js', type: 'brace' },
  
  // Character classes
  { pattern: '**/*[0-9].js', type: 'charclass' },
  { pattern: '**/file[0-9][0-9].ts', type: 'charclass' },
  
  // Question mark
  { pattern: '**/file?.js', type: 'question' },
  { pattern: '**/level?/**/*.ts', type: 'question' },
  
  // Globstar
  { pattern: '**', type: 'globstar' },
  
  // Dot-relative
  { pattern: './**/*.txt', type: 'dotrelative' },
  
  // Complex
  { pattern: '**/level*/**/*.js', type: 'complex' },
  { pattern: './**/level0/**/level1/**/*.js', type: 'complex' },
  { pattern: '**/*/**/*/**/*.js', type: 'complex' },
]

interface BenchResult {
  pattern: string
  type: string
  glob: { time: number; count: number }
  globlin: { time: number; count: number }
  fastglob: { time: number; count: number }
  speedup: number
  match: boolean
}

interface FixtureResult {
  fixture: string
  fileCount: number
  results: BenchResult[]
  summary: {
    avgSpeedup: number
    minSpeedup: number
    maxSpeedup: number
    totalGlobTime: number
    totalGloblinTime: number
    patternsFasterThanGlob: number
    patternsSlowerThanGlob: number
  }
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
  
  // Return median time
  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)]
  
  return { time: median, count: results.length }
}

function runBenchmark(fixtureDir: string): BenchResult[] {
  const results: BenchResult[] = []
  
  for (const { pattern, type } of patterns) {
    // Benchmark glob
    const globResult = measureTime(() => 
      globOriginal(pattern, { cwd: fixtureDir })
    )
    
    // Benchmark globlin
    const globlinResult = measureTime(() =>
      globSync(pattern, { cwd: fixtureDir })
    )
    
    // Benchmark fast-glob
    const fastglobResult = measureTime(() =>
      fg.sync(pattern, { cwd: fixtureDir })
    )
    
    // Calculate speedup (glob/globlin)
    const speedup = globResult.time / globlinResult.time
    
    // Check if results match (using sets for order-independent comparison)
    const globSet = new Set(globOriginal(pattern, { cwd: fixtureDir }))
    const globlinSet = new Set(globSync(pattern, { cwd: fixtureDir }))
    const match = globSet.size === globlinSet.size && 
      [...globSet].every(r => globlinSet.has(r))
    
    results.push({
      pattern,
      type,
      glob: globResult,
      globlin: globlinResult,
      fastglob: fastglobResult,
      speedup,
      match
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

function printResults(fixtureResult: FixtureResult): void {
  console.log('\n' + '='.repeat(90))
  console.log(`  PHASE 2 BENCHMARK - ${fixtureResult.fixture} fixture (${fixtureResult.fileCount.toLocaleString()} files)`)
  console.log('='.repeat(90))
  
  // Print table header
  console.log('')
  console.log(
    '  ' +
    'Pattern'.padEnd(35) +
    'Type'.padEnd(12) +
    'glob'.padStart(12) +
    'globlin'.padStart(12) +
    'fast-glob'.padStart(12) +
    'Speedup'.padStart(10) +
    'Match'.padStart(8)
  )
  console.log('  ' + '-'.repeat(99))
  
  // Print each result
  for (const r of fixtureResult.results) {
    const patternDisplay = r.pattern.length > 33 
      ? r.pattern.slice(0, 31) + '..' 
      : r.pattern
    
    const speedupStr = r.speedup >= 1
      ? `${r.speedup.toFixed(1)}x`
      : `${(1/r.speedup).toFixed(1)}x slower`
    
    const speedupColor = r.speedup >= 10 ? '\x1b[32m' : // green for 10x+
                         r.speedup >= 5 ? '\x1b[33m' :  // yellow for 5x+
                         r.speedup >= 1 ? '\x1b[0m' :   // normal for 1x+
                         '\x1b[31m'                      // red for slower
    
    console.log(
      '  ' +
      patternDisplay.padEnd(35) +
      r.type.padEnd(12) +
      formatTime(r.glob.time).padStart(12) +
      formatTime(r.globlin.time).padStart(12) +
      formatTime(r.fastglob.time).padStart(12) +
      speedupColor + speedupStr.padStart(10) + '\x1b[0m' +
      (r.match ? '\x1b[32m  ok\x1b[0m' : '\x1b[31m  MISMATCH\x1b[0m')
    )
  }
  
  // Print summary
  const s = fixtureResult.summary
  console.log('')
  console.log('  ' + '-'.repeat(99))
  console.log(`  Summary:`)
  console.log(`    Average speedup:    ${s.avgSpeedup.toFixed(2)}x`)
  console.log(`    Min speedup:        ${s.minSpeedup.toFixed(2)}x`)
  console.log(`    Max speedup:        ${s.maxSpeedup.toFixed(2)}x`)
  console.log(`    Patterns faster:    ${s.patternsFasterThanGlob}/${fixtureResult.results.length}`)
  console.log(`    Patterns slower:    ${s.patternsSlowerThanGlob}/${fixtureResult.results.length}`)
  console.log(`    Total glob time:    ${formatTime(s.totalGlobTime)}`)
  console.log(`    Total globlin time: ${formatTime(s.totalGloblinTime)}`)
}

async function main() {
  console.log('\n  GLOBLIN PHASE 2 PERFORMANCE CHECKPOINT')
  console.log('  ' + '='.repeat(70))
  console.log(`  Warmup runs: ${warmupRuns}`)
  console.log(`  Benchmark runs: ${benchmarkRuns}`)
  console.log(`  Patterns: ${patterns.length}`)
  
  const fixtures = fixtureSize === 'all' 
    ? ['small', 'medium', 'large']
    : [fixtureSize]
  
  const allResults: FixtureResult[] = []
  
  for (const fixture of fixtures) {
    const fixtureDir = join(FIXTURES_DIR, fixture)
    
    if (!existsSync(fixtureDir)) {
      console.error(`\n  ERROR: Fixture not found: ${fixtureDir}`)
      console.error(`  Run 'npm run bench:setup' first`)
      process.exit(1)
    }
    
    const fileCount = countFiles(fixtureDir)
    console.log(`\n  Running ${fixture} fixture (${fileCount.toLocaleString()} files)...`)
    
    const results = runBenchmark(fixtureDir)
    
    // Calculate summary stats
    const speedups = results.map(r => r.speedup)
    const summary = {
      avgSpeedup: speedups.reduce((a, b) => a + b, 0) / speedups.length,
      minSpeedup: Math.min(...speedups),
      maxSpeedup: Math.max(...speedups),
      totalGlobTime: results.reduce((a, r) => a + r.glob.time, 0),
      totalGloblinTime: results.reduce((a, r) => a + r.globlin.time, 0),
      patternsFasterThanGlob: results.filter(r => r.speedup >= 1).length,
      patternsSlowerThanGlob: results.filter(r => r.speedup < 1).length,
    }
    
    const fixtureResult: FixtureResult = {
      fixture,
      fileCount,
      results,
      summary
    }
    
    allResults.push(fixtureResult)
    
    if (!jsonOutput) {
      printResults(fixtureResult)
    }
  }
  
  // Print overall summary
  if (!jsonOutput && allResults.length > 0) {
    console.log('\n' + '='.repeat(90))
    console.log('  OVERALL PERFORMANCE SUMMARY')
    console.log('='.repeat(90))
    
    // Group by pattern type
    const typeStats: Record<string, { speedups: number[]; count: number }> = {}
    for (const fr of allResults) {
      for (const r of fr.results) {
        if (!typeStats[r.type]) {
          typeStats[r.type] = { speedups: [], count: 0 }
        }
        typeStats[r.type].speedups.push(r.speedup)
        typeStats[r.type].count++
      }
    }
    
    console.log('\n  Performance by pattern type:')
    console.log('  ' + '-'.repeat(50))
    for (const [type, stats] of Object.entries(typeStats)) {
      const avg = stats.speedups.reduce((a, b) => a + b, 0) / stats.speedups.length
      const min = Math.min(...stats.speedups)
      const max = Math.max(...stats.speedups)
      console.log(`    ${type.padEnd(15)} avg: ${avg.toFixed(2)}x  (${min.toFixed(2)}x - ${max.toFixed(2)}x)`)
    }
    
    // Phase 2 target assessment
    const totalAvgSpeedup = allResults.reduce((a, fr) => a + fr.summary.avgSpeedup, 0) / allResults.length
    
    console.log('\n  ' + '='.repeat(70))
    console.log('  Phase 2 Target: 10-15x faster than glob on most patterns')
    console.log(`  Current average: ${totalAvgSpeedup.toFixed(2)}x`)
    
    if (totalAvgSpeedup >= 10) {
      console.log('  \x1b[32mSTATUS: TARGET MET\x1b[0m')
    } else if (totalAvgSpeedup >= 5) {
      console.log('  \x1b[33mSTATUS: PROGRESS (Phase 1 target met)\x1b[0m')
    } else {
      console.log('  \x1b[31mSTATUS: NEEDS IMPROVEMENT\x1b[0m')
    }
    console.log('  ' + '='.repeat(70))
  }
  
  if (jsonOutput) {
    console.log(JSON.stringify(allResults, null, 2))
  }
}

main().catch(console.error)
