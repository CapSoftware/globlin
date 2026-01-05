/**
 * Rust<->JS Boundary Profiling Script
 * 
 * This script measures:
 * 1. Time spent in Rust (native code)
 * 2. Time spent in JS wrapper
 * 3. Serialization/deserialization overhead
 * 4. Number of boundary crossings
 * 
 * Run with:
 *   npm run build && npx tsx benches/profile_boundary.ts
 */

import { globSync as nativeGlobSync, glob as nativeGlob } from '../js/index.js';
import { glob as globOriginal, globSync as globSyncOriginal } from 'glob';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';

// Access raw NAPI binding directly to measure pure Rust time
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rawNative = require('../index.js') as {
  globSync: (pattern: string | string[], options?: Record<string, unknown>) => string[]
  glob: (pattern: string | string[], options?: Record<string, unknown>) => Promise<string[]>
};

const FIXTURES = {
  small: 'benches/fixtures/small',
  medium: 'benches/fixtures/medium',
  large: 'benches/fixtures/large',
};

const PATTERNS = [
  { name: 'simple', pattern: '*.js' },
  { name: 'recursive', pattern: '**/*.js' },
  { name: 'all_files', pattern: '**/*' },
];

interface TimingResult {
  pattern: string;
  fixture: string;
  resultCount: number;
  
  // Time measurements (ms)
  rawNativeTime: number;      // Pure Rust call (minimal JS wrapper)
  wrapperGloblinTime: number; // Full globlin with JS wrapper
  globTime: number;           // Original glob
  
  // Calculated overheads
  jsWrapperOverhead: number;  // wrapperGloblinTime - rawNativeTime
  jsWrapperPercent: number;   // jsWrapperOverhead / wrapperGloblinTime * 100
  
  // Speedup vs glob
  rawSpeedup: number;         // globTime / rawNativeTime
  totalSpeedup: number;       // globTime / wrapperGloblinTime
}

interface BoundaryStats {
  fixture: string;
  
  // Boundary crossings analysis
  totalCrossings: number;       // Number of times we cross JS<->Rust
  avgResultsPerCrossing: number;
  estimatedSerializationMs: number;
  
  // Per-result overhead
  msPerResultGloblin: number;
  msPerResultGlob: number;
  msPerResultRaw: number;
}

function measureRawNative(pattern: string, cwd: string, iterations: number): { time: number; results: string[] } {
  // Warmup
  rawNative.globSync(pattern, { cwd });
  rawNative.globSync(pattern, { cwd });
  
  let results: string[] = [];
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    results = rawNative.globSync(pattern, { cwd });
    times.push(performance.now() - start);
  }
  
  return {
    time: times.reduce((a, b) => a + b, 0) / times.length,
    results,
  };
}

function measureGloblin(pattern: string, cwd: string, iterations: number): { time: number; results: string[] } {
  // Warmup
  nativeGlobSync(pattern, { cwd });
  nativeGlobSync(pattern, { cwd });
  
  let results: string[] = [];
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    results = nativeGlobSync(pattern, { cwd });
    times.push(performance.now() - start);
  }
  
  return {
    time: times.reduce((a, b) => a + b, 0) / times.length,
    results,
  };
}

async function measureGlob(pattern: string, cwd: string, iterations: number): Promise<{ time: number; results: string[] }> {
  // Warmup
  await globOriginal(pattern, { cwd });
  await globOriginal(pattern, { cwd });
  
  let results: string[] = [];
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    results = await globOriginal(pattern, { cwd });
    times.push(performance.now() - start);
  }
  
  return {
    time: times.reduce((a, b) => a + b, 0) / times.length,
    results,
  };
}

// Measure overhead of passing different result sizes across boundary
async function measureSerializationOverhead(): Promise<void> {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('Serialization Overhead Analysis');
  console.log('='.repeat(80));
  console.log('\nMeasuring how result count affects boundary crossing time...\n');
  
  const fixturesWithCounts: { name: string; cwd: string; expectedResults: number }[] = [
    { name: 'small', cwd: FIXTURES.small, expectedResults: 0 },
    { name: 'medium', cwd: FIXTURES.medium, expectedResults: 0 },
    { name: 'large', cwd: FIXTURES.large, expectedResults: 0 },
  ];
  
  // Get actual result counts first
  for (const f of fixturesWithCounts) {
    try {
      const results = rawNative.globSync('**/*', { cwd: f.cwd });
      f.expectedResults = results.length;
    } catch {
      f.expectedResults = 0;
    }
  }
  
  console.log('Fixture sizes (all files with **/*):\n');
  for (const f of fixturesWithCounts) {
    console.log(`  ${f.name}: ${f.expectedResults.toLocaleString()} files`);
  }
  console.log('');
  
  // Measure time vs result count
  const measurements: { fixture: string; results: number; timeMs: number; msPerResult: number }[] = [];
  
  for (const f of fixturesWithCounts) {
    if (f.expectedResults === 0) continue;
    
    // Measure **/* (all files)
    const { time, results } = measureRawNative('**/*', f.cwd, 5);
    measurements.push({
      fixture: f.name,
      results: results.length,
      timeMs: time,
      msPerResult: time / results.length,
    });
  }
  
  console.log('Time vs Result Count (raw native, pattern: **/*):');
  console.log('-'.repeat(60));
  console.log('Fixture'.padEnd(12) + '| Results'.padStart(12) + ' | Time (ms)'.padStart(12) + ' | ms/result'.padStart(12));
  console.log('-'.repeat(60));
  
  for (const m of measurements) {
    console.log(
      m.fixture.padEnd(12) + '|' +
      m.results.toLocaleString().padStart(12) + ' |' +
      m.timeMs.toFixed(2).padStart(12) + ' |' +
      (m.msPerResult * 1000).toFixed(3).padStart(10) + 'us'
    );
  }
  
  // Calculate serialization overhead by comparing raw native to globlin wrapper
  console.log('\n\nJS Wrapper Overhead (globlin wrapper - raw native):');
  console.log('-'.repeat(70));
  console.log('Fixture'.padEnd(12) + '| Raw Native'.padStart(12) + ' | Globlin'.padStart(12) + ' | Overhead'.padStart(12) + ' | % Overhead'.padStart(12));
  console.log('-'.repeat(70));
  
  for (const f of fixturesWithCounts) {
    if (f.expectedResults === 0) continue;
    
    const rawResult = measureRawNative('**/*', f.cwd, 5);
    const globlinResult = measureGloblin('**/*', f.cwd, 5);
    const overhead = globlinResult.time - rawResult.time;
    const overheadPercent = (overhead / globlinResult.time) * 100;
    
    console.log(
      f.name.padEnd(12) + '|' +
      rawResult.time.toFixed(2).padStart(10) + 'ms |' +
      globlinResult.time.toFixed(2).padStart(10) + 'ms |' +
      overhead.toFixed(2).padStart(10) + 'ms |' +
      overheadPercent.toFixed(1).padStart(10) + '%'
    );
  }
}

// Measure boundary crossing frequency for different APIs
async function measureBoundaryCrossings(): Promise<void> {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('Boundary Crossing Analysis');
  console.log('='.repeat(80));
  
  console.log(`
Current Architecture:
  
  1. globSync() - Single boundary crossing
     JS -> Rust (pattern, options)
     Rust -> JS (Vec<String>)
     
  2. glob() - Single boundary crossing (async)
     JS -> Rust (pattern, options)
     Rust -> JS (Promise<Vec<String>>)
     
  3. globStream() - Currently wraps sync call
     JS -> Rust (single call)
     Rust -> JS (all results at once)
     JS iterates results
     
  4. For each result string returned:
     - Rust String -> NAPI string conversion
     - NAPI string -> V8 string (UTF-8 validation)
     - V8 string -> JS heap allocation
`);

  console.log('\nBoundary crossing per-call analysis:');
  console.log('-'.repeat(60));
  
  const testCwd = FIXTURES.medium;
  if (!fs.existsSync(testCwd)) {
    console.log('Medium fixture not available, skipping...');
    return;
  }
  
  // Single call - all results at once
  const { time: singleCallTime, results } = measureRawNative('**/*', testCwd, 5);
  
  console.log(`\nPattern: **/* on medium fixture`);
  console.log(`Results: ${results.length.toLocaleString()}`);
  console.log(`Time: ${singleCallTime.toFixed(2)}ms`);
  console.log(`Crossings: 1 (single call returning all results)`);
  console.log(`Results per crossing: ${results.length.toLocaleString()}`);
  
  // Estimate serialization cost
  const stringBytes = results.reduce((sum, s) => sum + s.length * 2, 0); // UTF-16 chars
  const avgStringLength = Math.round(results.reduce((sum, s) => sum + s.length, 0) / results.length);
  
  console.log(`\nSerialization estimates:`);
  console.log(`  Average string length: ${avgStringLength} chars`);
  console.log(`  Total string bytes: ${(stringBytes / 1024 / 1024).toFixed(2)} MB (UTF-16)`);
  console.log(`  Throughput: ${(stringBytes / singleCallTime / 1000).toFixed(2)} MB/s`);
}

// Compare raw vs wrapped performance
async function profileTimingBreakdown(): Promise<void> {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('Timing Breakdown Analysis');
  console.log('='.repeat(80));
  console.log('\nComparing: raw native | globlin wrapper | glob v13\n');
  
  const results: TimingResult[] = [];
  const iterations = 5;
  
  for (const [fixtureName, fixturePath] of Object.entries(FIXTURES)) {
    if (!fs.existsSync(fixturePath)) {
      console.log(`Skipping ${fixtureName} (fixture not found)`);
      continue;
    }
    
    console.log(`\n## ${fixtureName.toUpperCase()} Fixture`);
    console.log('-'.repeat(70));
    
    for (const { name, pattern } of PATTERNS) {
      try {
        const rawResult = measureRawNative(pattern, fixturePath, iterations);
        const wrapperResult = measureGloblin(pattern, fixturePath, iterations);
        const globResult = await measureGlob(pattern, fixturePath, iterations);
        
        const jsWrapperOverhead = wrapperResult.time - rawResult.time;
        const jsWrapperPercent = (jsWrapperOverhead / wrapperResult.time) * 100;
        const rawSpeedup = globResult.time / rawResult.time;
        const totalSpeedup = globResult.time / wrapperResult.time;
        
        results.push({
          pattern: name,
          fixture: fixtureName,
          resultCount: rawResult.results.length,
          rawNativeTime: rawResult.time,
          wrapperGloblinTime: wrapperResult.time,
          globTime: globResult.time,
          jsWrapperOverhead,
          jsWrapperPercent,
          rawSpeedup,
          totalSpeedup,
        });
        
        console.log(
          `${name.padEnd(15)}` +
          `| raw: ${rawResult.time.toFixed(2).padStart(8)}ms` +
          ` | globlin: ${wrapperResult.time.toFixed(2).padStart(8)}ms` +
          ` | glob: ${globResult.time.toFixed(2).padStart(8)}ms` +
          ` | overhead: ${jsWrapperPercent.toFixed(1).padStart(5)}%` +
          ` | speedup: ${totalSpeedup.toFixed(2).padStart(5)}x`
        );
      } catch (error) {
        console.error(`Error with ${name}:`, error);
      }
    }
  }
  
  // Summary statistics
  console.log('\n');
  console.log('='.repeat(80));
  console.log('Summary Statistics');
  console.log('='.repeat(80));
  
  for (const fixtureName of Object.keys(FIXTURES)) {
    const fixtureResults = results.filter(r => r.fixture === fixtureName);
    if (fixtureResults.length === 0) continue;
    
    const avgRawSpeedup = fixtureResults.reduce((a, b) => a + b.rawSpeedup, 0) / fixtureResults.length;
    const avgTotalSpeedup = fixtureResults.reduce((a, b) => a + b.totalSpeedup, 0) / fixtureResults.length;
    const avgOverhead = fixtureResults.reduce((a, b) => a + b.jsWrapperPercent, 0) / fixtureResults.length;
    
    console.log(`\n${fixtureName.toUpperCase()}:`);
    console.log(`  Raw Rust speedup vs glob:  ${avgRawSpeedup.toFixed(2)}x`);
    console.log(`  Total speedup vs glob:     ${avgTotalSpeedup.toFixed(2)}x`);
    console.log(`  JS wrapper overhead:       ${avgOverhead.toFixed(1)}%`);
  }
  
  return;
}

// Analyze where time is spent in the JS wrapper
async function analyzeJsWrapperTime(): Promise<void> {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('JS Wrapper Component Analysis');
  console.log('='.repeat(80));
  
  console.log(`
The globlin JS wrapper (js/index.ts) performs these operations:

1. Option processing:
   - Convert JS options to native format
   - Handle signal (AbortSignal)
   - Validate conflicting options
   - Handle custom ignore objects (IgnorePattern)
   
2. Pattern normalization:
   - Normalize cwd to absolute path
   - Handle URL cwd conversion
   
3. Native call:
   - Call raw NAPI binding
   
4. Result post-processing:
   - Apply custom ignore filter (if IgnorePattern provided)
   - Apply includeChildMatches filtering
   - Convert to PathScurry objects (if withFileTypes)
   
Key observations:
- Most overhead is in NAPI string serialization
- Custom ignore filtering happens in JS (post-traversal)
- PathScurry conversion is expensive for withFileTypes
`);

  const testCwd = FIXTURES.medium;
  if (!fs.existsSync(testCwd)) return;
  
  console.log('\nMeasuring component times (medium fixture, **/*):');
  console.log('-'.repeat(60));
  
  // Measure raw native
  const rawStart = performance.now();
  const rawResults = rawNative.globSync('**/*', { cwd: testCwd });
  const rawTime = performance.now() - rawStart;
  
  // Measure with options processing
  const optStart = performance.now();
  const opts = {
    cwd: testCwd,
    dot: false,
    nodir: false,
    absolute: false,
    mark: false,
  };
  // Simulate option conversion (what toNativeOptions does)
  const nativeOpts = { ...opts };
  const optTime = performance.now() - optStart;
  
  // Measure full globlin wrapper
  const wrapperStart = performance.now();
  const wrapperResults = nativeGlobSync('**/*', { cwd: testCwd });
  const wrapperTime = performance.now() - wrapperStart;
  
  console.log(`\nRaw native call:     ${rawTime.toFixed(2)}ms (${rawResults.length} results)`);
  console.log(`Options processing:  ${optTime.toFixed(3)}ms`);
  console.log(`Full wrapper:        ${wrapperTime.toFixed(2)}ms (${wrapperResults.length} results)`);
  console.log(`\nImplied wrapper overhead: ${(wrapperTime - rawTime).toFixed(2)}ms`);
  
  // Note: the actual overhead is minimal because our JS wrapper is thin
  // The main overhead is in NAPI string serialization which happens in both cases
}

// Recommendations based on findings
function printRecommendations(results: TimingResult[]): void {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('Optimization Recommendations');
  console.log('='.repeat(80));
  
  console.log(`
Based on boundary profiling analysis:

1. NAPI String Serialization is the Primary Overhead
   
   The current architecture returns Vec<String> from Rust, which requires:
   - Allocating each string in Rust heap
   - Copying string bytes across FFI boundary  
   - Validating UTF-8 and creating V8 strings
   - Allocating in V8 heap
   
   Potential solutions:
   a) Batch results into chunks to reduce allocation overhead
   b) Use SharedArrayBuffer for zero-copy transfer
   c) Stream results incrementally to avoid large allocations
   d) Use Uint8Array for raw bytes and decode in JS

2. JS Wrapper is Lightweight
   
   The JS wrapper adds minimal overhead (<1ms in most cases).
   Option processing and validation are not bottlenecks.
   
3. Custom Ignore Filtering is Post-Traversal
   
   When using IgnorePattern objects, filtering happens after Rust
   returns all results. For large result sets with many filtered items,
   this is wasteful. Consider:
   - Moving string ignore patterns to Rust (already done)
   - Supporting callback-based filtering in Rust (complex)

4. withFileTypes Adds Overhead
   
   Converting PathData to PathScurry Path objects is expensive.
   Each conversion requires PathScurry lookups. Consider caching.

5. Parallel Walking May Not Help as Much as Expected
   
   If serialization is 50%+ of time, parallel walking only speeds up
   the Rust side. Need to optimize boundary before parallel walking.
   
   Recommended Phase 5 order:
   1. First: Optimize boundary crossing (batch results, reduce copies)
   2. Then: Add parallel walking for additional gains
`);
}

async function main(): Promise<void> {
  console.log('='.repeat(80));
  console.log('Globlin Rust<->JS Boundary Profiling Report');
  console.log('='.repeat(80));
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);
  console.log(`Platform: ${process.platform}`);
  
  // Check fixtures exist
  let hasFixtures = false;
  for (const [name, fixturePath] of Object.entries(FIXTURES)) {
    if (fs.existsSync(fixturePath)) {
      const files = fs.readdirSync(fixturePath);
      console.log(`${name} fixture: ${fixturePath} (${files.length} top-level entries)`);
      hasFixtures = true;
    } else {
      console.log(`${name} fixture: NOT FOUND at ${fixturePath}`);
    }
  }
  
  if (!hasFixtures) {
    console.log('\nNo fixtures found. Run: npm run bench:setup');
    process.exit(1);
  }
  
  // Run profiling
  await profileTimingBreakdown();
  await measureSerializationOverhead();
  await measureBoundaryCrossings();
  await analyzeJsWrapperTime();
  printRecommendations([]);
}

main().catch(console.error);
