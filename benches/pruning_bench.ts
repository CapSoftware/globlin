#!/usr/bin/env npx tsx
/**
 * Directory Pruning Effectiveness Benchmark
 * 
 * Measures how many directories are traversed for various scoped patterns,
 * comparing globlin's pruning strategy vs full traversal.
 * 
 * Creates a BRANCHING fixture structure to properly test pruning:
 * - Multiple top-level directories (src, test, docs, lib, scripts)
 * - Each with nested subdirectories
 * - Files distributed across all branches
 * 
 * Pruning should skip entire branches that don't match the pattern prefix.
 */

import { globSync as globOriginal } from 'glob'
import fg from 'fast-glob'
import { existsSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

// Import globlin
import { globSync } from '../js/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = join(__dirname, 'fixtures')

// Patterns specifically designed to test directory pruning with branching fixture
const pruningPatterns = [
  // Scoped patterns where pruning should help significantly (skip test/, docs/, node_modules/)
  { pattern: 'src/**/*.ts', expectedPruning: 'high', note: 'Only needs src/ (~35% of dirs)' },
  { pattern: 'src/lib/**/*.ts', expectedPruning: 'high', note: 'Only needs src/lib/ (~15% of dirs)' },
  { pattern: 'src/components/**/*.js', expectedPruning: 'high', note: 'Only needs src/components/' },
  { pattern: 'test/**/*.ts', expectedPruning: 'high', note: 'Only needs test/ (~15% of dirs)' },
  
  // Patterns with partial prefixes (magic in first segment)
  { pattern: 'src/*/utils/**/*.ts', expectedPruning: 'medium', note: 'src/* is magic - partial pruning' },
  
  // Patterns that can NOT benefit from pruning (globstar at start)
  { pattern: '**/*.js', expectedPruning: 'none', note: 'Globstar at start - no pruning possible' },
  { pattern: '**/*.ts', expectedPruning: 'none', note: 'Globstar at start - no pruning possible' },
  { pattern: '**/lib/**/*.ts', expectedPruning: 'none', note: 'Globstar at start - must traverse all' },
  
  // Mixed patterns (prefix + nested globstar)
  { pattern: 'src/**/utils/**/*.ts', expectedPruning: 'partial', note: 'Has prefix but nested globstar' },
  { pattern: 'node_modules/**/*.js', expectedPruning: 'high', note: 'Only needs node_modules/' },
]

interface PruningResult {
  pattern: string
  note: string
  glob: { time: number; count: number }
  globlin: { time: number; count: number }
  fastglob: { time: number; count: number }
  speedup: number
  match: boolean
}

function measureTime(fn: () => unknown[]): { time: number; count: number } {
  const warmupRuns = 3
  const benchmarkRuns = 10
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

function formatTime(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(1)}us`
  } else if (ms < 1000) {
    return `${ms.toFixed(2)}ms`
  } else {
    return `${(ms / 1000).toFixed(2)}s`
  }
}

function runPruningBenchmark(fixtureDir: string): PruningResult[] {
  const results: PruningResult[] = []
  
  for (const { pattern, note } of pruningPatterns) {
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
      note,
      glob: globResult,
      globlin: globlinResult,
      fastglob: fastglobResult,
      speedup,
      match
    })
  }
  
  return results
}

function countTotalDirs(dir: string): number {
  let count = 1 // Count the directory itself
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += countTotalDirs(join(dir, entry.name))
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return count
}

function countScopedDirs(dir: string, prefix: string): number {
  // Count directories only in the prefix subtree
  const prefixPath = join(dir, prefix)
  if (!existsSync(prefixPath)) return 0
  return countTotalDirs(prefixPath)
}

/**
 * Create a branching fixture structure designed to test directory pruning.
 * 
 * Structure:
 * pruning-test/
 * ├── src/
 * │   ├── lib/
 * │   │   ├── utils/
 * │   │   └── core/
 * │   ├── components/
 * │   │   ├── ui/
 * │   │   └── forms/
 * │   └── services/
 * ├── test/
 * │   ├── unit/
 * │   └── integration/
 * ├── docs/
 * │   ├── api/
 * │   └── guides/
 * ├── scripts/
 * └── node_modules/
 *     ├── package-a/
 *     ├── package-b/
 *     └── package-c/
 */
function createBranchingFixture(baseDir: string, fileCount: number = 5000): string {
  const fixtureDir = join(baseDir, 'pruning-test')
  
  // Clean existing
  if (existsSync(fixtureDir)) {
    rmSync(fixtureDir, { recursive: true })
  }
  
  // Define directory structure with weights (percentage of files)
  const structure: Record<string, number> = {
    'src/lib/utils': 10,
    'src/lib/core': 10,
    'src/components/ui': 8,
    'src/components/forms': 8,
    'src/services': 6,
    'test/unit': 8,
    'test/integration': 6,
    'docs/api': 4,
    'docs/guides': 4,
    'scripts': 4,
    'node_modules/package-a/dist': 10,
    'node_modules/package-b/lib': 10,
    'node_modules/package-c/src': 12,
  }
  
  // Create directories and files
  for (const [dir, weight] of Object.entries(structure)) {
    const fullPath = join(fixtureDir, dir)
    mkdirSync(fullPath, { recursive: true })
    
    const numFiles = Math.floor(fileCount * weight / 100)
    for (let i = 0; i < numFiles; i++) {
      const ext = i % 3 === 0 ? 'ts' : i % 3 === 1 ? 'js' : 'json'
      writeFileSync(join(fullPath, `file${i}.${ext}`), `// File ${i}\n`)
    }
  }
  
  return fixtureDir
}

async function main() {
  console.log('\n  DIRECTORY PRUNING EFFECTIVENESS BENCHMARK')
  console.log('  ' + '='.repeat(70))
  
  // Create a branching fixture specifically for testing pruning
  // Use a larger file count to make the pruning benefits more visible
  console.log('\n  Creating branching fixture for pruning tests...')
  const fixtureDir = createBranchingFixture(FIXTURES_DIR, 30000)
  
  // Count directories
  const totalDirs = countTotalDirs(fixtureDir)
  const srcDirs = countScopedDirs(fixtureDir, 'src')
  const srcLibDirs = countScopedDirs(fixtureDir, 'src/lib')
  const testDirs = countScopedDirs(fixtureDir, 'test')
  const nodeModulesDirs = countScopedDirs(fixtureDir, 'node_modules')
  
  console.log(`\n  Fixture: branching (designed for pruning tests)`)
  console.log(`  Total directories: ${totalDirs.toLocaleString()}`)
  console.log(`  src/ subtree: ${srcDirs.toLocaleString()} dirs (${((srcDirs/totalDirs)*100).toFixed(1)}% of total)`)
  console.log(`  src/lib/ subtree: ${srcLibDirs.toLocaleString()} dirs (${((srcLibDirs/totalDirs)*100).toFixed(1)}% of total)`)
  console.log(`  test/ subtree: ${testDirs.toLocaleString()} dirs (${((testDirs/totalDirs)*100).toFixed(1)}% of total)`)
  console.log(`  node_modules/ subtree: ${nodeModulesDirs.toLocaleString()} dirs (${((nodeModulesDirs/totalDirs)*100).toFixed(1)}% of total)`)
  
  // Count files for reference
  let totalFiles = 0
  const countFilesRecursive = (dir: string): number => {
    let count = 0
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile()) count++
      else if (entry.isDirectory()) count += countFilesRecursive(join(dir, entry.name))
    }
    return count
  }
  totalFiles = countFilesRecursive(fixtureDir)
  console.log(`  Total files: ${totalFiles.toLocaleString()}`)
  
  console.log(`\n  Running benchmarks...`)
  const results = runPruningBenchmark(fixtureDir)
  
  // Print results
  console.log('\n' + '='.repeat(95))
  console.log('  PRUNING BENCHMARK RESULTS')
  console.log('='.repeat(95))
  
  console.log('')
  console.log(
    '  ' +
    'Pattern'.padEnd(35) +
    'Expected'.padEnd(12) +
    'glob'.padStart(12) +
    'globlin'.padStart(12) +
    'fast-glob'.padStart(12) +
    'Speedup'.padStart(10) +
    'Match'.padStart(8)
  )
  console.log('  ' + '-'.repeat(91))
  
  for (const r of results) {
    const patternDisplay = r.pattern.length > 33 
      ? r.pattern.slice(0, 31) + '..' 
      : r.pattern
    
    const speedupStr = r.speedup >= 1
      ? `${r.speedup.toFixed(1)}x`
      : `${(1/r.speedup).toFixed(1)}x slower`
    
    const speedupColor = r.speedup >= 5 ? '\x1b[32m' :  // green for 5x+
                         r.speedup >= 2 ? '\x1b[33m' :  // yellow for 2x+
                         r.speedup >= 1 ? '\x1b[0m' :   // normal for 1x+
                         '\x1b[31m'                      // red for slower
    
    console.log(
      '  ' +
      patternDisplay.padEnd(35) +
      r.note.slice(0, 10).padEnd(12) +
      formatTime(r.glob.time).padStart(12) +
      formatTime(r.globlin.time).padStart(12) +
      formatTime(r.fastglob.time).padStart(12) +
      speedupColor + speedupStr.padStart(10) + '\x1b[0m' +
      (r.match ? '\x1b[32m  ok\x1b[0m' : '\x1b[31m  MISMATCH\x1b[0m')
    )
  }
  
  // Summary by expected pruning level
  console.log('\n  ' + '='.repeat(70))
  console.log('  Summary by Pruning Potential:')
  console.log('  ' + '-'.repeat(70))
  
  const highPruning = results.filter(r => r.note.includes('Only needs'))
  const noPruning = results.filter(r => r.note.includes('no pruning'))
  
  if (highPruning.length > 0) {
    const avgHigh = highPruning.reduce((a, r) => a + r.speedup, 0) / highPruning.length
    console.log(`    High pruning potential (scoped patterns): ${avgHigh.toFixed(2)}x avg speedup`)
  }
  
  if (noPruning.length > 0) {
    const avgNone = noPruning.reduce((a, r) => a + r.speedup, 0) / noPruning.length
    console.log(`    No pruning possible (**/ at start):       ${avgNone.toFixed(2)}x avg speedup`)
  }
  
  // Pruning effectiveness assessment
  const scopedSpeedup = highPruning.length > 0 
    ? highPruning.reduce((a, r) => a + r.speedup, 0) / highPruning.length 
    : 0
  const nonScopedSpeedup = noPruning.length > 0 
    ? noPruning.reduce((a, r) => a + r.speedup, 0) / noPruning.length 
    : 0
  
  console.log('\n  ' + '='.repeat(70))
  console.log('  PRUNING EFFECTIVENESS')
  console.log('  ' + '='.repeat(70))
  
  if (scopedSpeedup > nonScopedSpeedup * 1.5) {
    console.log(`  \x1b[32mPruning is effective!\x1b[0m Scoped patterns are ${(scopedSpeedup/nonScopedSpeedup).toFixed(1)}x faster than non-scoped`)
  } else if (scopedSpeedup > nonScopedSpeedup) {
    console.log(`  \x1b[33mPruning has some effect.\x1b[0m Scoped patterns slightly faster`)
  } else {
    console.log(`  \x1b[31mPruning not showing expected benefit.\x1b[0m Need investigation`)
  }
  
  // Target check
  console.log('\n  Target: 20-50% fewer directories visited for scoped patterns')
  console.log(`  Expected benefit: src/**/*.ts should only traverse ~${((srcDirs/totalDirs)*100).toFixed(0)}% of directories`)
  console.log('  ' + '='.repeat(70))
  
  // Cleanup
  rmSync(fixtureDir, { recursive: true })
}

main().catch(console.error)
