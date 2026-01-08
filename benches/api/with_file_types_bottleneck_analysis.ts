/**
 * Phase 7.7.2: withFileTypes API Bottleneck Analysis
 *
 * This benchmark script performs detailed profiling to identify exactly where
 * time is being spent when using withFileTypes: true.
 *
 * Key areas to analyze:
 * 1. PathScurry object creation overhead
 * 2. scurry.cwd.resolve() per-call cost
 * 3. Rust→JS data transfer for PathData objects
 * 4. stat() call overhead (when stat: true)
 * 5. Method binding and prototype chain cost
 */

import { globSync, glob, PathScurry, Path } from '../../js/index.js'
import * as originalGlob from 'glob'
import * as path from 'path'
import * as fs from 'fs'

// Check for fixture directories
const FIXTURES_BASE = path.join(process.cwd(), 'benches', 'fixtures')
const SMALL_FIXTURE = path.join(FIXTURES_BASE, 'small')
const MEDIUM_FIXTURE = path.join(FIXTURES_BASE, 'medium')

function ensureFixtures(): boolean {
  if (!fs.existsSync(SMALL_FIXTURE) || !fs.existsSync(MEDIUM_FIXTURE)) {
    console.log('Fixtures not found. Run: npm run bench:setup')
    return false
  }
  return true
}

// Timing utility
function measureTime(fn: () => void, runs: number = 5): { median: number; min: number; max: number; times: number[] } {
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

async function measureTimeAsync(fn: () => Promise<void>, runs: number = 5): Promise<{ median: number; min: number; max: number }> {
  const times: number[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    await fn()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  return {
    median: times[Math.floor(times.length / 2)],
    min: times[0],
    max: times[times.length - 1],
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

  console.log('=' .repeat(80))
  console.log('Phase 7.7.2: withFileTypes Bottleneck Analysis')
  console.log('=' .repeat(80))
  console.log()

  const pattern = '**/*.js'
  const runs = 5

  // ==========================================================================
  // Section 1: PathScurry Creation Overhead
  // ==========================================================================
  console.log('## Section 1: PathScurry Creation Overhead')
  console.log()

  // Measure PathScurry instantiation alone
  const scurryCreationTimes = measureTime(() => {
    const scurry = new PathScurry(MEDIUM_FIXTURE)
    void scurry // Prevent optimization
  }, 100)

  console.log(`PathScurry creation (100 runs):`)
  console.log(`  Median: ${formatUs(scurryCreationTimes.median)}`)
  console.log(`  Min: ${formatUs(scurryCreationTimes.min)}`)
  console.log(`  Max: ${formatUs(scurryCreationTimes.max)}`)
  console.log()

  // ==========================================================================
  // Section 2: scurry.cwd.resolve() Per-Call Cost
  // ==========================================================================
  console.log('## Section 2: scurry.cwd.resolve() Per-Call Cost')
  console.log()

  // Get sample paths
  const samplePaths = globSync(pattern, { cwd: MEDIUM_FIXTURE })
  const sampleCount = Math.min(samplePaths.length, 10000)
  const testPaths = samplePaths.slice(0, sampleCount)

  console.log(`Testing with ${testPaths.length} paths from medium fixture`)
  console.log()

  // Measure scurry.cwd.resolve() in isolation
  const scurry = new PathScurry(MEDIUM_FIXTURE)
  const resolveOnlyTimes = measureTime(() => {
    for (const p of testPaths) {
      scurry.cwd.resolve(p)
    }
  }, runs)

  const perResolveTime = resolveOnlyTimes.median / testPaths.length
  console.log(`scurry.cwd.resolve() (${testPaths.length} paths):`)
  console.log(`  Total: ${formatMs(resolveOnlyTimes.median)}`)
  console.log(`  Per path: ${formatUs(perResolveTime)}`)
  console.log()

  // ==========================================================================
  // Section 3: Rust→JS Data Transfer Overhead
  // ==========================================================================
  console.log('## Section 3: Rust→JS Data Transfer for PathData')
  console.log()

  // Measure string results (minimal overhead)
  const stringResultsTimes = measureTime(() => {
    globSync(pattern, { cwd: MEDIUM_FIXTURE })
  }, runs)

  // Measure native withFileTypes (transfers PathData objects)
  // We can't directly measure this, so we infer from difference
  const nativeBindings = require('../../index.js') as {
    globSyncWithFileTypes: (pattern: string | string[], options?: any) => any[]
  }

  const nativeWithFileTypesTimes = measureTime(() => {
    nativeBindings.globSyncWithFileTypes(pattern, { cwd: MEDIUM_FIXTURE })
  }, runs)

  console.log(`String results (native globSync):`)
  console.log(`  Median: ${formatMs(stringResultsTimes.median)}`)
  console.log()

  console.log(`PathData[] results (native globSyncWithFileTypes):`)
  console.log(`  Median: ${formatMs(nativeWithFileTypesTimes.median)}`)
  console.log()

  const nativeOverhead = nativeWithFileTypesTimes.median - stringResultsTimes.median
  console.log(`Native PathData overhead:`)
  console.log(`  Total: ${formatMs(nativeOverhead)}`)
  console.log(`  Percentage: ${((nativeOverhead / stringResultsTimes.median) * 100).toFixed(1)}%`)
  console.log()

  // ==========================================================================
  // Section 4: Full withFileTypes Pipeline Breakdown
  // ==========================================================================
  console.log('## Section 4: Full withFileTypes Pipeline Breakdown')
  console.log()

  // Measure complete globlin withFileTypes
  const globlinWithFileTypesTimes = measureTime(() => {
    globSync(pattern, { cwd: MEDIUM_FIXTURE, withFileTypes: true })
  }, runs)

  // Measure complete glob withFileTypes for comparison
  const globWithFileTypesTimes = measureTime(() => {
    originalGlob.globSync(pattern, { cwd: MEDIUM_FIXTURE, withFileTypes: true })
  }, runs)

  const pathObjectConversionTime = globlinWithFileTypesTimes.median - nativeWithFileTypesTimes.median

  console.log(`Pipeline breakdown (globlin withFileTypes):`)
  console.log(`  1. Native Rust walk + match: ${formatMs(stringResultsTimes.median)}`)
  console.log(`  2. Native PathData creation: ${formatMs(nativeOverhead)}`)
  console.log(`  3. PathScurry conversion:    ${formatMs(pathObjectConversionTime)} (${((pathObjectConversionTime / globlinWithFileTypesTimes.median) * 100).toFixed(1)}%)`)
  console.log(`  ---`)
  console.log(`  Total globlin:               ${formatMs(globlinWithFileTypesTimes.median)}`)
  console.log(`  Total glob:                  ${formatMs(globWithFileTypesTimes.median)}`)
  console.log(`  Speedup:                     ${(globWithFileTypesTimes.median / globlinWithFileTypesTimes.median).toFixed(2)}x`)
  console.log()

  // ==========================================================================
  // Section 5: Per-Component Analysis
  // ==========================================================================
  console.log('## Section 5: Per-Component Overhead Analysis')
  console.log()

  const resultCount = testPaths.length

  console.log(`Per-result overhead breakdown:`)
  console.log(`  Native Rust walk:        ${formatUs(stringResultsTimes.median / resultCount)}`)
  console.log(`  Native PathData:         ${formatUs(nativeOverhead / resultCount)}`)
  console.log(`  PathScurry resolve:      ${formatUs(pathObjectConversionTime / resultCount)}`)
  console.log(`  ---`)
  console.log(`  Total per result:        ${formatUs(globlinWithFileTypesTimes.median / resultCount)}`)
  console.log()

  // ==========================================================================
  // Section 6: stat: true Impact
  // ==========================================================================
  console.log('## Section 6: stat: true Impact')
  console.log()

  const withoutStatTimes = measureTime(() => {
    globSync(pattern, { cwd: MEDIUM_FIXTURE, withFileTypes: true, stat: false })
  }, runs)

  const withStatTimes = measureTime(() => {
    globSync(pattern, { cwd: MEDIUM_FIXTURE, withFileTypes: true, stat: true })
  }, runs)

  const statOverhead = withStatTimes.median - withoutStatTimes.median

  console.log(`stat: false: ${formatMs(withoutStatTimes.median)}`)
  console.log(`stat: true:  ${formatMs(withStatTimes.median)}`)
  console.log(`Overhead:    ${formatMs(statOverhead)} (+${((statOverhead / withoutStatTimes.median) * 100).toFixed(1)}%)`)
  console.log(`Per result:  ${formatUs(statOverhead / resultCount)}`)
  console.log()

  // ==========================================================================
  // Section 7: Path Method Call Overhead (once created)
  // ==========================================================================
  console.log('## Section 7: Path Method Call Overhead')
  console.log()

  // Get some Path objects
  const pathObjects = globSync(pattern, {
    cwd: MEDIUM_FIXTURE,
    withFileTypes: true,
    stat: true,
  }) as unknown as Path[]

  const samplePathObjs = pathObjects.slice(0, Math.min(1000, pathObjects.length))

  // Measure method calls
  const isFileTimes = measureTime(() => {
    for (const p of samplePathObjs) {
      p.isFile()
    }
  }, 10)

  const isDirectoryTimes = measureTime(() => {
    for (const p of samplePathObjs) {
      p.isDirectory()
    }
  }, 10)

  const fullpathTimes = measureTime(() => {
    for (const p of samplePathObjs) {
      p.fullpath()
    }
  }, 10)

  const relativeTimes = measureTime(() => {
    for (const p of samplePathObjs) {
      p.relative()
    }
  }, 10)

  console.log(`Method call overhead (${samplePathObjs.length} calls each):`)
  console.log(`  isFile():      ${formatUs(isFileTimes.median / samplePathObjs.length)} per call`)
  console.log(`  isDirectory(): ${formatUs(isDirectoryTimes.median / samplePathObjs.length)} per call`)
  console.log(`  fullpath():    ${formatUs(fullpathTimes.median / samplePathObjs.length)} per call`)
  console.log(`  relative():    ${formatUs(relativeTimes.median / samplePathObjs.length)} per call`)
  console.log()

  // ==========================================================================
  // Section 8: Memory Analysis
  // ==========================================================================
  console.log('## Section 8: Memory Analysis')
  console.log()

  // Force GC if available
  if (global.gc) {
    global.gc()
  }

  const baselineMemory = process.memoryUsage().heapUsed

  // Allocate string results
  const stringResults = globSync(pattern, { cwd: MEDIUM_FIXTURE })
  const afterStringMemory = process.memoryUsage().heapUsed

  if (global.gc) {
    global.gc()
  }

  // Allocate Path results
  const pathResults = globSync(pattern, { cwd: MEDIUM_FIXTURE, withFileTypes: true })
  const afterPathMemory = process.memoryUsage().heapUsed

  const stringMemory = afterStringMemory - baselineMemory
  const pathMemory = afterPathMemory - afterStringMemory

  console.log(`Memory usage for ${stringResults.length} results:`)
  console.log(`  String results: ${(stringMemory / 1024).toFixed(1)} KB (${(stringMemory / stringResults.length).toFixed(1)} bytes/result)`)
  console.log(`  Path objects:   ${(pathMemory / 1024).toFixed(1)} KB (${(pathMemory / pathResults.length).toFixed(1)} bytes/result)`)
  console.log(`  Ratio:          ${(pathMemory / stringMemory).toFixed(1)}x more memory`)
  console.log()

  // ==========================================================================
  // Section 9: Alternative Approaches Analysis
  // ==========================================================================
  console.log('## Section 9: Alternative Approaches Analysis')
  console.log()

  // Approach 1: Lazy Path creation (simulate with a wrapper)
  console.log('### Approach 1: Lazy Path Creation')

  interface LazyPath {
    path: string
    isDirectory: boolean
    isFile: boolean
    isSymlink: boolean
    _resolved?: Path
    resolve: () => Path
    fullpath: () => string
    relative: () => string
  }

  const lazyApproachTimes = measureTime(() => {
    const data = nativeBindings.globSyncWithFileTypes(pattern, { cwd: MEDIUM_FIXTURE })
    const scurryInstance = new PathScurry(MEDIUM_FIXTURE)
    const lazyResults: LazyPath[] = data.map((d: any) => ({
      path: d.path,
      isDirectory: d.isDirectory,
      isFile: d.isFile,
      isSymlink: d.isSymlink,
      _resolved: undefined as Path | undefined,
      resolve() {
        if (!this._resolved) {
          this._resolved = scurryInstance.cwd.resolve(this.path)
        }
        return this._resolved
      },
      fullpath() {
        return path.join(MEDIUM_FIXTURE, this.path)
      },
      relative() {
        return this.path
      },
    }))
    void lazyResults
  }, runs)

  console.log(`  Creation time: ${formatMs(lazyApproachTimes.median)}`)
  console.log(`  vs Current:    ${formatMs(globlinWithFileTypesTimes.median)}`)
  console.log(`  Savings:       ${formatMs(globlinWithFileTypesTimes.median - lazyApproachTimes.median)} (${(((globlinWithFileTypesTimes.median - lazyApproachTimes.median) / globlinWithFileTypesTimes.median) * 100).toFixed(1)}%)`)
  console.log()

  // Approach 2: Use Rust metadata directly without PathScurry
  console.log('### Approach 2: Simple Object (no PathScurry)')

  const simpleObjectTimes = measureTime(() => {
    const data = nativeBindings.globSyncWithFileTypes(pattern, { cwd: MEDIUM_FIXTURE })
    const simpleResults = data.map((d: any) => ({
      path: d.path,
      fullpath: path.join(MEDIUM_FIXTURE, d.path),
      isFile: d.isFile,
      isDirectory: d.isDirectory,
      isSymbolicLink: d.isSymlink,
    }))
    void simpleResults
  }, runs)

  console.log(`  Creation time: ${formatMs(simpleObjectTimes.median)}`)
  console.log(`  vs Current:    ${formatMs(globlinWithFileTypesTimes.median)}`)
  console.log(`  Savings:       ${formatMs(globlinWithFileTypesTimes.median - simpleObjectTimes.median)} (${(((globlinWithFileTypesTimes.median - simpleObjectTimes.median) / globlinWithFileTypesTimes.median) * 100).toFixed(1)}%)`)
  console.log()

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('=' .repeat(80))
  console.log('## Summary: Bottleneck Identification')
  console.log('=' .repeat(80))
  console.log()

  const totalTime = globlinWithFileTypesTimes.median
  const rustWalkTime = stringResultsTimes.median
  const nativePathDataTime = nativeOverhead
  const pathScurryTime = pathObjectConversionTime

  console.log(`Time breakdown for ${resultCount} results:`)
  console.log()
  console.log(`| Component              | Time        | Percentage | Per Result |`)
  console.log(`|------------------------|-------------|------------|------------|`)
  console.log(`| Rust walk + match      | ${formatMs(rustWalkTime).padStart(10)} | ${((rustWalkTime / totalTime) * 100).toFixed(1).padStart(9)}% | ${formatUs(rustWalkTime / resultCount).padStart(9)} |`)
  console.log(`| Native PathData        | ${formatMs(nativePathDataTime).padStart(10)} | ${((nativePathDataTime / totalTime) * 100).toFixed(1).padStart(9)}% | ${formatUs(nativePathDataTime / resultCount).padStart(9)} |`)
  console.log(`| PathScurry conversion  | ${formatMs(pathScurryTime).padStart(10)} | ${((pathScurryTime / totalTime) * 100).toFixed(1).padStart(9)}% | ${formatUs(pathScurryTime / resultCount).padStart(9)} |`)
  console.log(`|------------------------|-------------|------------|------------|`)
  console.log(`| Total                  | ${formatMs(totalTime).padStart(10)} | ${((totalTime / totalTime) * 100).toFixed(1).padStart(9)}% | ${formatUs(totalTime / resultCount).padStart(9)} |`)
  console.log()

  console.log('**PRIMARY BOTTLENECK: PathScurry conversion**')
  console.log()
  console.log(`The PathScurry conversion step (scurry.cwd.resolve() per result)`)
  console.log(`accounts for ${((pathScurryTime / totalTime) * 100).toFixed(1)}% of total execution time.`)
  console.log()
  console.log('Optimization recommendations:')
  console.log('1. Lazy Path creation: Only create Path objects when accessed')
  console.log('2. Simple object return: Return plain objects with file metadata')
  console.log('3. PathScurry batch API: Investigate if PathScurry has batch resolution')
  console.log('4. Native Path objects: Implement Path-like interface in Rust/NAPI')
  console.log()
}

main().catch(console.error)
