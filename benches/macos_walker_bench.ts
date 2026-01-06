#!/usr/bin/env npx tsx
/**
 * Benchmark macOS-specific walker performance
 * 
 * Tests getattrlistbulk vs standard readdir/walkdir performance on macOS.
 */

import { glob, globSync } from '../index.js'
import * as origGlob from 'glob'
import * as path from 'path'
import * as fs from 'fs'

const WARMUP_RUNS = 3
const BENCHMARK_RUNS = 10

async function measureTime(fn: () => Promise<any> | any): Promise<number> {
  const start = performance.now()
  await fn()
  return performance.now() - start
}

async function benchmark(
  name: string,
  fn: () => Promise<any> | any,
  warmup = WARMUP_RUNS,
  runs = BENCHMARK_RUNS
): Promise<{ median: number; min: number; max: number; results: any }> {
  let results: any
  
  // Warmup
  for (let i = 0; i < warmup; i++) {
    results = await fn()
  }
  
  // Benchmark
  const times: number[] = []
  for (let i = 0; i < runs; i++) {
    times.push(await measureTime(fn))
  }
  
  times.sort((a, b) => a - b)
  return {
    median: times[Math.floor(times.length / 2)],
    min: times[0],
    max: times[times.length - 1],
    results
  }
}

async function main() {
  const fixtureBase = process.argv[2] || 'benches/fixtures/medium'
  const fixturePath = path.resolve(fixtureBase)
  
  if (!fs.existsSync(fixturePath)) {
    console.error(`Fixture not found: ${fixturePath}`)
    console.error('Run: node benches/setup-fixtures.js')
    process.exit(1)
  }
  
  // Count files in fixture
  const countResult = await origGlob.glob('**/*', { cwd: fixturePath })
  console.log(`\n🍎 macOS Walker Benchmark`)
  console.log(`Fixture: ${fixturePath}`)
  console.log(`Files: ${countResult.length.toLocaleString()}`)
  console.log(`Warmup: ${WARMUP_RUNS}, Benchmark runs: ${BENCHMARK_RUNS}`)
  console.log('='.repeat(70))
  
  const patterns = [
    '**/*',
    '**/*.js',
    '*.js',
    'level0/**/*.js',
    '**/*.{js,ts}',
  ]
  
  const results: any[] = []
  
  for (const pattern of patterns) {
    console.log(`\nPattern: ${pattern}`)
    console.log('-'.repeat(50))
    
    // Test glob (reference)
    const globResult = await benchmark(`glob`, async () => 
      origGlob.glob(pattern, { cwd: fixturePath })
    )
    
    // Test globlin with default settings (serial walkdir)
    const globlinDefaultResult = await benchmark(`globlin (default)`, async () => 
      glob(pattern, { cwd: fixturePath })
    )
    
    // Test globlin with useNativeIO (macOS getattrlistbulk)
    const globlinNativeResult = await benchmark(`globlin (useNativeIO)`, async () => 
      glob(pattern, { cwd: fixturePath, useNativeIO: true })
    )
    
    // Calculate speedups
    const defaultSpeedup = globResult.median / globlinDefaultResult.median
    const nativeSpeedup = globResult.median / globlinNativeResult.median
    const nativeVsDefault = globlinDefaultResult.median / globlinNativeResult.median
    
    console.log(`  glob:                ${globResult.median.toFixed(2)}ms (${Array.isArray(globResult.results) ? globResult.results.length : 0} results)`)
    console.log(`  globlin (default):   ${globlinDefaultResult.median.toFixed(2)}ms (${defaultSpeedup.toFixed(2)}x vs glob)`)
    console.log(`  globlin (nativeIO):  ${globlinNativeResult.median.toFixed(2)}ms (${nativeSpeedup.toFixed(2)}x vs glob, ${nativeVsDefault.toFixed(2)}x vs default)`)
    
    results.push({
      pattern,
      glob: globResult.median,
      globlinDefault: globlinDefaultResult.median,
      globlinNative: globlinNativeResult.median,
      defaultSpeedup,
      nativeSpeedup,
      nativeVsDefault,
      resultCount: Array.isArray(globlinDefaultResult.results) ? globlinDefaultResult.results.length : 0
    })
  }
  
  // Summary table
  console.log('\n\n📊 Summary')
  console.log('='.repeat(70))
  console.log(`${'Pattern'.padEnd(25)} | ${'Results'.padStart(8)} | ${'Default'.padStart(10)} | ${'Native'.padStart(10)} | ${'Native/Def'.padStart(10)}`)
  console.log('-'.repeat(70))
  
  for (const r of results) {
    console.log(
      `${r.pattern.padEnd(25)} | ${r.resultCount.toString().padStart(8)} | ${(r.defaultSpeedup.toFixed(2) + 'x').padStart(10)} | ${(r.nativeSpeedup.toFixed(2) + 'x').padStart(10)} | ${(r.nativeVsDefault.toFixed(2) + 'x').padStart(10)}`
    )
  }
  
  // Calculate averages
  const avgDefaultSpeedup = results.reduce((a, r) => a + r.defaultSpeedup, 0) / results.length
  const avgNativeSpeedup = results.reduce((a, r) => a + r.nativeSpeedup, 0) / results.length
  const avgNativeVsDefault = results.reduce((a, r) => a + r.nativeVsDefault, 0) / results.length
  
  console.log('-'.repeat(70))
  console.log(
    `${'AVERAGE'.padEnd(25)} | ${'-'.padStart(8)} | ${(avgDefaultSpeedup.toFixed(2) + 'x').padStart(10)} | ${(avgNativeSpeedup.toFixed(2) + 'x').padStart(10)} | ${(avgNativeVsDefault.toFixed(2) + 'x').padStart(10)}`
  )
  
  console.log('\n✅ Benchmark complete')
  console.log(`   Default vs glob: ${avgDefaultSpeedup.toFixed(2)}x`)
  console.log(`   Native vs glob:  ${avgNativeSpeedup.toFixed(2)}x`)
  console.log(`   Native vs Default: ${avgNativeVsDefault.toFixed(2)}x`)
}

main().catch(console.error)
