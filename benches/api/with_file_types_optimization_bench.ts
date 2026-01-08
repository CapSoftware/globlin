/**
 * Phase 7.7.3: withFileTypes GloblinPath Optimization Benchmark
 *
 * This benchmark measures the performance improvement from using GloblinPath
 * (lazy Path wrapper) vs the old approach of eagerly creating PathScurry Path objects.
 *
 * Expected results:
 * - GloblinPath creation: ~0.5µs per result
 * - PathScurry Path creation: ~16µs per result
 * - Total speedup: ~85% for withFileTypes operations
 */

import { globSync, GloblinPath, convertToFullPathObjects } from '../../js/index.js'
import * as originalGlob from 'glob'
import * as path from 'path'
import * as fs from 'fs'

const FIXTURES_BASE = path.join(process.cwd(), 'benches', 'fixtures')
const MEDIUM_FIXTURE = path.join(FIXTURES_BASE, 'medium')

function ensureFixtures(): boolean {
  if (!fs.existsSync(MEDIUM_FIXTURE)) {
    console.log('Fixtures not found. Run: npm run bench:setup')
    return false
  }
  return true
}

function measureTime(fn: () => void, runs: number = 10): { median: number; min: number; max: number; times: number[] } {
  const times: number[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    fn()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return {
    median: times[Math.floor(times.length / 2)],
    min: times[0],
    max: times[times.length - 1],
    times,
  }
}

function formatMs(ms: number): string {
  return ms.toFixed(3) + 'ms'
}

function formatUs(ms: number): string {
  return (ms * 1000).toFixed(2) + 'µs'
}

async function main() {
  if (!ensureFixtures()) {
    process.exit(1)
  }

  console.log('='.repeat(80))
  console.log('Phase 7.7.3: withFileTypes GloblinPath Optimization Benchmark')
  console.log('='.repeat(80))
  console.log()

  const pattern = '**/*.js'
  const runs = 10

  // Get native result count for reference
  const nativeBindings = require('../../index.js') as {
    globSyncWithFileTypes: (pattern: string | string[], options?: any) => any[]
  }
  const nativeResults = nativeBindings.globSyncWithFileTypes(pattern, { cwd: MEDIUM_FIXTURE })
  const resultCount = nativeResults.length

  console.log(`Testing with ${resultCount} results from medium fixture`)
  console.log()

  // ==========================================================================
  // Section 1: NEW (GloblinPath) vs OLD (PathScurry Path) approach
  // ==========================================================================
  console.log('## Section 1: GloblinPath vs PathScurry Path Creation')
  console.log()

  // Warmup
  for (let i = 0; i < 3; i++) {
    globSync(pattern, { cwd: MEDIUM_FIXTURE, withFileTypes: true })
    convertToFullPathObjects(nativeResults, MEDIUM_FIXTURE, false)
  }

  // NEW approach: GloblinPath (current implementation)
  const newApproachTimes = measureTime(() => {
    globSync(pattern, { cwd: MEDIUM_FIXTURE, withFileTypes: true })
  }, runs)

  // OLD approach: Full PathScurry Path creation
  const oldApproachTimes = measureTime(() => {
    convertToFullPathObjects(nativeResults, MEDIUM_FIXTURE, false)
  }, runs)

  // String-only (baseline - no Path object creation)
  const stringOnlyTimes = measureTime(() => {
    globSync(pattern, { cwd: MEDIUM_FIXTURE, withFileTypes: false })
  }, runs)

  console.log(`| Approach           | Median       | Per Result    |`)
  console.log(`|--------------------|--------------|---------------|`)
  console.log(`| String only        | ${formatMs(stringOnlyTimes.median).padStart(12)} | ${formatUs(stringOnlyTimes.median / resultCount).padStart(13)} |`)
  console.log(`| GloblinPath (NEW)  | ${formatMs(newApproachTimes.median).padStart(12)} | ${formatUs(newApproachTimes.median / resultCount).padStart(13)} |`)
  console.log(`| PathScurry (OLD)   | ${formatMs(oldApproachTimes.median).padStart(12)} | ${formatUs(oldApproachTimes.median / resultCount).padStart(13)} |`)
  console.log()

  const newOverhead = newApproachTimes.median - stringOnlyTimes.median
  const oldOverhead = oldApproachTimes.median - stringOnlyTimes.median
  const speedupPercent = ((oldOverhead - newOverhead) / oldOverhead) * 100

  console.log(`Path creation overhead:`)
  console.log(`  GloblinPath (NEW):  ${formatMs(newOverhead)} (+${((newOverhead / stringOnlyTimes.median) * 100).toFixed(1)}% over strings)`)
  console.log(`  PathScurry (OLD):   ${formatMs(oldOverhead)} (+${((oldOverhead / stringOnlyTimes.median) * 100).toFixed(1)}% over strings)`)
  console.log(`  Speedup:            ${speedupPercent.toFixed(1)}% faster path creation`)
  console.log()

  // ==========================================================================
  // Section 2: Comparison with glob package
  // ==========================================================================
  console.log('## Section 2: GloblinPath vs glob Package withFileTypes')
  console.log()

  // glob package (baseline)
  const globPackageTimes = measureTime(() => {
    originalGlob.globSync(pattern, { cwd: MEDIUM_FIXTURE, withFileTypes: true })
  }, runs)

  const speedupVsGlob = globPackageTimes.median / newApproachTimes.median

  console.log(`| Package            | Median       | Per Result    |`)
  console.log(`|--------------------|--------------|---------------|`)
  console.log(`| glob               | ${formatMs(globPackageTimes.median).padStart(12)} | ${formatUs(globPackageTimes.median / resultCount).padStart(13)} |`)
  console.log(`| globlin (NEW)      | ${formatMs(newApproachTimes.median).padStart(12)} | ${formatUs(newApproachTimes.median / resultCount).padStart(13)} |`)
  console.log()
  console.log(`Speedup vs glob: ${speedupVsGlob.toFixed(2)}x`)
  console.log()

  // ==========================================================================
  // Section 3: GloblinPath Method Performance
  // ==========================================================================
  console.log('## Section 3: GloblinPath Method Performance')
  console.log()

  const globlinPaths = globSync(pattern, { cwd: MEDIUM_FIXTURE, withFileTypes: true }) as GloblinPath[]
  const samplePaths = globlinPaths.slice(0, Math.min(1000, globlinPaths.length))

  // Measure fast methods (cached values)
  const isFileTimes = measureTime(() => {
    for (const p of samplePaths) p.isFile()
  }, 100)

  const isDirectoryTimes = measureTime(() => {
    for (const p of samplePaths) p.isDirectory()
  }, 100)

  const isSymlinkTimes = measureTime(() => {
    for (const p of samplePaths) p.isSymbolicLink()
  }, 100)

  const fullpathTimes = measureTime(() => {
    for (const p of samplePaths) p.fullpath()
  }, 100)

  const relativeTimes = measureTime(() => {
    for (const p of samplePaths) p.relative()
  }, 100)

  const nameTimes = measureTime(() => {
    for (const p of samplePaths) void p.name
  }, 100)

  // Measure slow method (PathScurry resolution)
  // Note: Only test on first 100 items since toPath() is slow
  const toPathSample = samplePaths.slice(0, 100)
  const toPathTimes = measureTime(() => {
    for (const p of toPathSample) {
      // Create fresh paths to avoid caching benefit
      const fresh = new GloblinPath(p.path, MEDIUM_FIXTURE, p.isDirectory(), p.isFile(), p.isSymbolicLink())
      fresh.toPath()
    }
  }, 10)

  console.log(`| Method             | Per Call      | Status        |`)
  console.log(`|--------------------|---------------|---------------|`)
  console.log(`| isFile()           | ${formatUs(isFileTimes.median / samplePaths.length).padStart(13)} | Fast (cached) |`)
  console.log(`| isDirectory()      | ${formatUs(isDirectoryTimes.median / samplePaths.length).padStart(13)} | Fast (cached) |`)
  console.log(`| isSymbolicLink()   | ${formatUs(isSymlinkTimes.median / samplePaths.length).padStart(13)} | Fast (cached) |`)
  console.log(`| fullpath()         | ${formatUs(fullpathTimes.median / samplePaths.length).padStart(13)} | Fast (string) |`)
  console.log(`| relative()         | ${formatUs(relativeTimes.median / samplePaths.length).padStart(13)} | Fast (string) |`)
  console.log(`| name               | ${formatUs(nameTimes.median / samplePaths.length).padStart(13)} | Fast (cached) |`)
  console.log(`| toPath()           | ${formatUs(toPathTimes.median / toPathSample.length).padStart(13)} | Slow (lazy)   |`)
  console.log()

  // ==========================================================================
  // Section 4: Memory Usage
  // ==========================================================================
  console.log('## Section 4: Memory Usage Comparison')
  console.log()

  // Force GC if available
  if (global.gc) global.gc()
  const baselineMemory = process.memoryUsage().heapUsed

  // GloblinPath memory
  const globlinResults = globSync(pattern, { cwd: MEDIUM_FIXTURE, withFileTypes: true }) as GloblinPath[]
  if (global.gc) global.gc()
  const afterGloblinMemory = process.memoryUsage().heapUsed

  // PathScurry Path memory
  const pathScurryResults = convertToFullPathObjects(nativeResults, MEDIUM_FIXTURE, false)
  if (global.gc) global.gc()
  const afterPathScurryMemory = process.memoryUsage().heapUsed

  const globlinMemory = afterGloblinMemory - baselineMemory
  const pathScurryMemory = afterPathScurryMemory - afterGloblinMemory

  console.log(`Memory for ${resultCount} results:`)
  console.log(`  GloblinPath:  ${(globlinMemory / 1024).toFixed(1)} KB (${(globlinMemory / globlinResults.length).toFixed(1)} bytes/result)`)
  console.log(`  PathScurry:   ${(pathScurryMemory / 1024).toFixed(1)} KB (${(pathScurryMemory / pathScurryResults.length).toFixed(1)} bytes/result)`)
  console.log(`  Ratio:        ${(pathScurryMemory / Math.max(1, globlinMemory)).toFixed(1)}x more memory for PathScurry`)
  console.log()

  // ==========================================================================
  // Section 5: Result Verification
  // ==========================================================================
  console.log('## Section 5: Result Verification')
  console.log()

  // Verify GloblinPath results match glob package
  const globResults = originalGlob.globSync(pattern, { cwd: MEDIUM_FIXTURE, withFileTypes: true })
  const globlinResultsCheck = globSync(pattern, { cwd: MEDIUM_FIXTURE, withFileTypes: true }) as GloblinPath[]

  const globPaths = new Set(globResults.map(p => p.relative()))
  const globlinPathsCheck = new Set(globlinResultsCheck.map(p => p.relative()))

  const match = globPaths.size === globlinPathsCheck.size &&
    [...globPaths].every(p => globlinPathsCheck.has(p))

  console.log(`Results match glob package: ${match ? 'YES' : 'NO'}`)
  console.log(`  glob count:    ${globPaths.size}`)
  console.log(`  globlin count: ${globlinPathsCheck.size}`)
  console.log()

  // Verify type methods work correctly
  const sampleGloblinPath = globlinResultsCheck[0]
  const sampleGlobPath = globResults.find(p => p.relative() === sampleGloblinPath.relative())

  if (sampleGlobPath) {
    console.log(`Type method verification for "${sampleGloblinPath.relative()}":`)
    console.log(`  isFile():           globlin=${sampleGloblinPath.isFile()}, glob=${sampleGlobPath.isFile()}`)
    console.log(`  isDirectory():      globlin=${sampleGloblinPath.isDirectory()}, glob=${sampleGlobPath.isDirectory()}`)
    console.log(`  isSymbolicLink():   globlin=${sampleGloblinPath.isSymbolicLink()}, glob=${sampleGlobPath.isSymbolicLink()}`)
    console.log(`  name:               globlin="${sampleGloblinPath.name}", glob="${sampleGlobPath.name}"`)
  }
  console.log()

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('='.repeat(80))
  console.log('## Summary')
  console.log('='.repeat(80))
  console.log()
  console.log(`GloblinPath Optimization Results:`)
  console.log(`  Path creation speedup:  ${speedupPercent.toFixed(1)}% faster than PathScurry`)
  console.log(`  Overall speedup vs glob: ${speedupVsGlob.toFixed(2)}x`)
  console.log(`  Result accuracy:        ${match ? 'PASS' : 'FAIL'}`)
  console.log()
  console.log(`Key improvements:`)
  console.log(`  - Path object creation: ${formatUs(newOverhead / resultCount)} vs ${formatUs(oldOverhead / resultCount)} per result`)
  console.log(`  - isFile()/isDirectory(): ~${formatUs(isFileTimes.median / samplePaths.length)} (uses cached Rust values)`)
  console.log(`  - Lazy PathScurry: toPath() only called when advanced features needed`)
  console.log()

  // Target check
  const TARGET_SPEEDUP_PERCENT = 50 // Conservative target
  if (speedupPercent >= TARGET_SPEEDUP_PERCENT) {
    console.log(`TARGET MET: ${speedupPercent.toFixed(1)}% >= ${TARGET_SPEEDUP_PERCENT}% path creation speedup`)
  } else {
    console.log(`TARGET MISSED: ${speedupPercent.toFixed(1)}% < ${TARGET_SPEEDUP_PERCENT}% path creation speedup`)
  }
}

main().catch(console.error)
