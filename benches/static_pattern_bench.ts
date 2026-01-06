/**
 * Benchmark for static pattern fast path optimization.
 * 
 * Tests the performance improvement for patterns that resolve to a single file
 * path (no wildcards), which can be checked with stat() instead of walking.
 */

import { glob as globOriginal, globSync as globSyncOriginal } from 'glob';
import fastGlob from 'fast-glob';
import { globSync, glob } from '../js/index.ts';
import { createTestFixture, cleanupFixture } from '../tests/harness.ts';

interface BenchResult {
  pattern: string;
  glob: number;
  fastGlob: number;
  globlin: number;
  speedupVsGlob: number;
  speedupVsFastGlob: number;
  resultCount: number;
  resultsMatch: boolean;
}

async function runBench(
  pattern: string | string[],
  cwd: string,
  iterations: number = 20
): Promise<BenchResult> {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  const patternStr = patterns.join(', ');

  // Warmup
  for (let i = 0; i < 3; i++) {
    globSyncOriginal(patterns, { cwd });
    fastGlob.sync(patterns, { cwd });
    globSync(patterns, { cwd });
  }

  // Benchmark glob
  const globTimes: number[] = [];
  let globResults: string[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    globResults = globSyncOriginal(patterns, { cwd });
    globTimes.push(performance.now() - start);
  }
  const globTime = globTimes.reduce((a, b) => a + b) / globTimes.length;

  // Benchmark fast-glob
  const fgTimes: number[] = [];
  let fgResults: string[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fgResults = fastGlob.sync(patterns, { cwd });
    fgTimes.push(performance.now() - start);
  }
  const fgTime = fgTimes.reduce((a, b) => a + b) / fgTimes.length;

  // Benchmark globlin
  const globlinTimes: number[] = [];
  let globlinResults: string[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    globlinResults = globSync(patterns, { cwd });
    globlinTimes.push(performance.now() - start);
  }
  const globlinTime = globlinTimes.reduce((a, b) => a + b) / globlinTimes.length;

  // Verify results match
  const resultsMatch = 
    new Set(globResults).size === new Set(globlinResults).size &&
    globResults.every(r => globlinResults.includes(r));

  return {
    pattern: patternStr,
    glob: globTime,
    fastGlob: fgTime,
    globlin: globlinTime,
    speedupVsGlob: globTime / globlinTime,
    speedupVsFastGlob: fgTime / globlinTime,
    resultCount: globlinResults.length,
    resultsMatch
  };
}

async function main() {
  console.log('Static Pattern Benchmark - Fast Path Optimization Test\n');
  console.log('Creating test fixture...');

  // Create a realistic project structure
  const cwd = await createTestFixture('static-bench', {
    files: [
      'package.json',
      'tsconfig.json',
      'README.md',
      '.gitignore',
      '.env',
      'src/index.ts',
      'src/main.ts',
      'src/lib/utils.ts',
      'src/lib/helpers.ts',
      'src/components/App.tsx',
      'src/components/Button.tsx',
      'test/index.test.ts',
      'test/utils.test.ts',
      'dist/index.js',
      'dist/index.d.ts',
      'node_modules/.package-lock.json',
    ],
    dirs: [
      'src',
      'src/lib',
      'src/components',
      'test',
      'dist',
      'node_modules',
      '.git',
    ]
  });

  console.log(`Fixture created at: ${cwd}\n`);

  const results: BenchResult[] = [];

  // Static patterns (should use fast path)
  console.log('=== Static Patterns (Fast Path) ===');
  const staticPatterns: (string | string[])[] = [
    'package.json',
    'tsconfig.json',
    'src/index.ts',
    'src/lib/utils.ts',
    ['package.json', 'tsconfig.json'],
    ['package.json', 'src/index.ts', 'README.md'],
  ];

  for (const pattern of staticPatterns) {
    const result = await runBench(pattern, cwd);
    results.push(result);
    console.log(`Pattern: ${result.pattern}`);
    console.log(`  glob:      ${result.glob.toFixed(3)}ms (${result.resultCount} results)`);
    console.log(`  fast-glob: ${result.fastGlob.toFixed(3)}ms`);
    console.log(`  globlin:   ${result.globlin.toFixed(3)}ms`);
    console.log(`  Speedup vs glob: ${result.speedupVsGlob.toFixed(2)}x`);
    console.log(`  Speedup vs fast-glob: ${result.speedupVsFastGlob.toFixed(2)}x`);
    console.log(`  Results match: ${result.resultsMatch ? 'Yes' : 'NO!'}\n`);
  }

  // Dynamic patterns (should NOT use fast path)
  console.log('=== Dynamic Patterns (For Comparison) ===');
  const dynamicPatterns = [
    '*.json',
    'src/*.ts',
    '**/*.ts',
    'src/**/*.ts',
  ];

  for (const pattern of dynamicPatterns) {
    const result = await runBench(pattern, cwd);
    results.push(result);
    console.log(`Pattern: ${result.pattern}`);
    console.log(`  glob:      ${result.glob.toFixed(3)}ms (${result.resultCount} results)`);
    console.log(`  fast-glob: ${result.fastGlob.toFixed(3)}ms`);
    console.log(`  globlin:   ${result.globlin.toFixed(3)}ms`);
    console.log(`  Speedup vs glob: ${result.speedupVsGlob.toFixed(2)}x`);
    console.log(`  Speedup vs fast-glob: ${result.speedupVsFastGlob.toFixed(2)}x`);
    console.log(`  Results match: ${result.resultsMatch ? 'Yes' : 'NO!'}\n`);
  }

  // Summary
  console.log('=== Summary ===');
  const staticResults = results.filter(r => !r.pattern.includes('*'));
  const dynamicResults = results.filter(r => r.pattern.includes('*'));

  if (staticResults.length > 0) {
    const avgStaticSpeedup = staticResults.reduce((a, r) => a + r.speedupVsGlob, 0) / staticResults.length;
    const avgStaticVsFg = staticResults.reduce((a, r) => a + r.speedupVsFastGlob, 0) / staticResults.length;
    console.log(`Static patterns: ${avgStaticSpeedup.toFixed(2)}x faster than glob, ${avgStaticVsFg.toFixed(2)}x vs fast-glob`);
  }

  if (dynamicResults.length > 0) {
    const avgDynamicSpeedup = dynamicResults.reduce((a, r) => a + r.speedupVsGlob, 0) / dynamicResults.length;
    const avgDynamicVsFg = dynamicResults.reduce((a, r) => a + r.speedupVsFastGlob, 0) / dynamicResults.length;
    console.log(`Dynamic patterns: ${avgDynamicSpeedup.toFixed(2)}x faster than glob, ${avgDynamicVsFg.toFixed(2)}x vs fast-glob`);
  }

  // Cleanup
  await cleanupFixture(cwd);
  console.log('\nFixture cleaned up.');
}

main().catch(console.error);
