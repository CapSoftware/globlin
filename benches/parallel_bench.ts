/**
 * Parallel vs Serial Benchmark Suite
 *
 * Compares globlin's serial and parallel walking modes across different
 * fixture sizes and patterns to measure the effectiveness of parallel I/O.
 *
 * Run with: npm run bench:parallel
 *
 * Fixtures must be generated first: npm run bench:setup
 */

import { globSync } from '../js/index.js';
import { existsSync } from 'fs';
import { join } from 'path';

// Configuration
const WARMUP_RUNS = 3;
const BENCHMARK_RUNS = 10;
const FIXTURES_BASE = join(import.meta.dirname ?? __dirname, 'fixtures');

interface BenchResult {
  name: string;
  times: number[];
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  resultCount: number;
}

interface PatternResult {
  pattern: string;
  fixture: string;
  serial: BenchResult;
  parallel: BenchResult;
  speedup: number;
  resultsMatch: boolean;
}

interface FixtureSummary {
  name: string;
  fileCount: number;
  patternResults: PatternResult[];
  averageSpeedup: number;
  minSpeedup: number;
  maxSpeedup: number;
}

function measureSync(fn: () => unknown): { time: number; result: unknown } {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  return { time: end - start, result };
}

function calculateStats(times: number[]): {
  mean: number;
  min: number;
  max: number;
  stdDev: number;
} {
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const variance =
    times.reduce((acc, t) => acc + (t - mean) ** 2, 0) / times.length;
  const stdDev = Math.sqrt(variance);
  return { mean, min, max, stdDev };
}

function runBenchmark(name: string, fn: () => unknown): BenchResult {
  // Warmup
  for (let i = 0; i < WARMUP_RUNS; i++) {
    fn();
  }

  // Benchmark runs
  const times: number[] = [];
  let resultCount = 0;

  for (let i = 0; i < BENCHMARK_RUNS; i++) {
    const { time, result } = measureSync(fn);
    times.push(time);
    if (Array.isArray(result)) {
      resultCount = result.length;
    }
  }

  const stats = calculateStats(times);

  return {
    name,
    times,
    ...stats,
    resultCount,
  };
}

function formatTime(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(1)}us`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatSpeedup(speedup: number): string {
  if (speedup >= 1) {
    return `${speedup.toFixed(2)}x faster`;
  }
  return `${(1 / speedup).toFixed(2)}x slower`;
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

// Patterns to test
const PATTERNS = [
  { name: 'simple', pattern: '*.js', description: 'Simple extension at root' },
  { name: 'recursive-ext', pattern: '**/*.js', description: 'Recursive extension match' },
  { name: 'all-files', pattern: '**/*', description: 'All files recursively' },
  { name: 'scoped', pattern: 'level0/**/*.js', description: 'Scoped recursive' },
  { name: 'deep-scoped', pattern: 'level0/level1/**/*.js', description: 'Deep scoped' },
  { name: 'brace', pattern: '**/*.{js,ts}', description: 'Brace expansion' },
  { name: 'multi-level', pattern: '**/level*/**/*.js', description: 'Multi-level wildcard' },
];

async function benchmarkFixture(fixtureName: string): Promise<FixtureSummary> {
  const fixture = join(FIXTURES_BASE, fixtureName);

  if (!existsSync(fixture)) {
    console.error(`Fixture not found: ${fixture}`);
    console.error('Run: npm run bench:setup');
    process.exit(1);
  }

  // Count files for reporting
  const allFiles = globSync('**/*', { cwd: fixture, nodir: true });
  const fileCount = allFiles.length;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  PARALLEL vs SERIAL BENCHMARK - ${fixtureName} (${fileCount.toLocaleString()} files)`);
  console.log('='.repeat(70));

  const patternResults: PatternResult[] = [];

  for (const { name, pattern, description } of PATTERNS) {
    console.log(`\n  Pattern: ${pattern} (${description})`);
    console.log('  ' + '-'.repeat(66));

    // Run serial benchmark
    const serialResult = runBenchmark('serial', () =>
      globSync(pattern, { cwd: fixture, parallel: false })
    );

    // Run parallel benchmark
    const parallelResult = runBenchmark('parallel', () =>
      globSync(pattern, { cwd: fixture, parallel: true })
    );

    // Verify results match
    const serialSet = new Set(
      globSync(pattern, { cwd: fixture, parallel: false })
    );
    const parallelSet = new Set(
      globSync(pattern, { cwd: fixture, parallel: true })
    );
    const resultsMatch = setsEqual(serialSet, parallelSet);

    // Calculate speedup (parallel vs serial)
    const speedup = serialResult.mean / parallelResult.mean;

    // Print results
    console.log(
      `  serial:   ${formatTime(serialResult.mean).padEnd(12)} (${serialResult.resultCount} results, stdDev: ${formatTime(serialResult.stdDev)})`
    );
    console.log(
      `  parallel: ${formatTime(parallelResult.mean).padEnd(12)} (${parallelResult.resultCount} results, stdDev: ${formatTime(parallelResult.stdDev)})`
    );
    console.log();
    console.log(`  parallel vs serial: ${formatSpeedup(speedup)}`);

    if (!resultsMatch) {
      console.log(
        `  WARNING: Results mismatch! serial=${serialSet.size}, parallel=${parallelSet.size}`
      );
    }

    patternResults.push({
      pattern,
      fixture: fixtureName,
      serial: serialResult,
      parallel: parallelResult,
      speedup,
      resultsMatch,
    });
  }

  // Calculate summary statistics
  const speedups = patternResults.map((r) => r.speedup);
  const averageSpeedup =
    speedups.reduce((a, b) => a + b, 0) / speedups.length;
  const minSpeedup = Math.min(...speedups);
  const maxSpeedup = Math.max(...speedups);

  return {
    name: fixtureName,
    fileCount,
    patternResults,
    averageSpeedup,
    minSpeedup,
    maxSpeedup,
  };
}

function printSummary(summaries: FixtureSummary[]): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  SUMMARY: PARALLEL vs SERIAL PERFORMANCE');
  console.log('='.repeat(70));

  // Summary per fixture
  console.log('\n  By Fixture:');
  console.log('  ' + '-'.repeat(66));
  console.log(
    `  ${'Fixture'.padEnd(12)} | ${'Files'.padEnd(10)} | ${'Avg Speedup'.padEnd(14)} | ${'Min'.padEnd(10)} | ${'Max'.padEnd(10)}`
  );
  console.log('  ' + '-'.repeat(66));

  for (const summary of summaries) {
    console.log(
      `  ${summary.name.padEnd(12)} | ${summary.fileCount.toLocaleString().padEnd(10)} | ${summary.averageSpeedup.toFixed(2).padEnd(14)}x | ${summary.minSpeedup.toFixed(2).padEnd(10)}x | ${summary.maxSpeedup.toFixed(2)}x`
    );
  }

  // Overall summary
  const allSpeedups = summaries.flatMap((s) =>
    s.patternResults.map((r) => r.speedup)
  );
  const overallAvg =
    allSpeedups.reduce((a, b) => a + b, 0) / allSpeedups.length;
  const overallMin = Math.min(...allSpeedups);
  const overallMax = Math.max(...allSpeedups);

  console.log('  ' + '-'.repeat(66));
  console.log(
    `  ${'Overall'.padEnd(12)} | ${'-'.padEnd(10)} | ${overallAvg.toFixed(2).padEnd(14)}x | ${overallMin.toFixed(2).padEnd(10)}x | ${overallMax.toFixed(2)}x`
  );

  // Pattern breakdown
  console.log('\n  By Pattern (across all fixtures):');
  console.log('  ' + '-'.repeat(66));

  const patternMap = new Map<string, number[]>();
  for (const summary of summaries) {
    for (const result of summary.patternResults) {
      const speedups = patternMap.get(result.pattern) || [];
      speedups.push(result.speedup);
      patternMap.set(result.pattern, speedups);
    }
  }

  console.log(
    `  ${'Pattern'.padEnd(25)} | ${'Avg Speedup'.padEnd(14)} | ${'Best'.padEnd(10)} | ${'Worst'.padEnd(10)}`
  );
  console.log('  ' + '-'.repeat(66));

  for (const [pattern, speedups] of patternMap.entries()) {
    const avg = speedups.reduce((a, b) => a + b, 0) / speedups.length;
    const best = Math.max(...speedups);
    const worst = Math.min(...speedups);
    console.log(
      `  ${pattern.padEnd(25)} | ${avg.toFixed(2).padEnd(14)}x | ${best.toFixed(2).padEnd(10)}x | ${worst.toFixed(2)}x`
    );
  }

  // Analysis
  console.log('\n  Analysis:');
  console.log('  ' + '-'.repeat(66));

  if (overallAvg > 1.5) {
    console.log('  - Parallel mode provides significant speedup (>1.5x)');
    console.log('  - Recommended for: HDDs, network drives, large directories');
  } else if (overallAvg > 1.0) {
    console.log('  - Parallel mode provides modest speedup (1.0-1.5x)');
    console.log('  - May benefit: HDDs, network drives');
  } else {
    console.log('  - Parallel mode is slower on this hardware (<1.0x)');
    console.log('  - Serial mode (default) is recommended for SSDs');
  }

  // Check for result mismatches
  const mismatches = summaries.flatMap((s) =>
    s.patternResults.filter((r) => !r.resultsMatch)
  );
  if (mismatches.length > 0) {
    console.log(`\n  WARNING: ${mismatches.length} result mismatches detected!`);
    for (const m of mismatches) {
      console.log(`    - ${m.pattern} on ${m.fixture}`);
    }
  } else {
    console.log('\n  All results match between serial and parallel modes.');
  }
}

async function main(): Promise<void> {
  console.log('\n  GLOBLIN PARALLEL vs SERIAL BENCHMARK');
  console.log('  ' + '='.repeat(66));
  console.log(`  Warmup runs: ${WARMUP_RUNS}`);
  console.log(`  Benchmark runs: ${BENCHMARK_RUNS}`);

  // Determine which fixtures to run
  const args = process.argv.slice(2);
  let fixtures = ['small', 'medium'];

  if (args.includes('--all') || args.includes('-a')) {
    fixtures = ['small', 'medium', 'large'];
  } else if (args.includes('--large') || args.includes('-l')) {
    fixtures = ['large'];
  } else if (args.includes('--medium') || args.includes('-m')) {
    fixtures = ['medium'];
  } else if (args.includes('--small') || args.includes('-s')) {
    fixtures = ['small'];
  }

  const summaries: FixtureSummary[] = [];

  for (const fixture of fixtures) {
    const summary = await benchmarkFixture(fixture);
    summaries.push(summary);
  }

  printSummary(summaries);

  // JSON output for CI
  if (args.includes('--json')) {
    console.log('\nJSON Output:');
    console.log(
      JSON.stringify(
        {
          summaries,
          timestamp: new Date().toISOString(),
          platform: process.platform,
          arch: process.arch,
          node: process.version,
        },
        null,
        2
      )
    );
  }
}

main().catch(console.error);
