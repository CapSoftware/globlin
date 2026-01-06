/**
 * CI Benchmark runner for globlin
 *
 * This script runs benchmarks and outputs results in JSON format for CI comparison.
 * It measures glob, fast-glob, and globlin (when available) performance.
 *
 * Usage: npx tsx benches/bench-ci.ts [--output bench-results.json]
 */

import { globSync } from 'glob';
import fg from 'fast-glob';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const WARMUP_RUNS = 2;
const BENCHMARK_RUNS = 5;
const FIXTURES_BASE = join(__dirname, 'fixtures');

interface PatternResult {
  pattern: string;
  fixture: string;
  glob: {
    mean: number;
    min: number;
    max: number;
    stdDev: number;
    resultCount: number;
  };
  fastGlob: {
    mean: number;
    min: number;
    max: number;
    stdDev: number;
    resultCount: number;
  };
  globlin?: {
    mean: number;
    min: number;
    max: number;
    stdDev: number;
    resultCount: number;
  };
}

interface BenchmarkOutput {
  timestamp: string;
  nodeVersion: string;
  platform: string;
  fixtures: string[];
  patterns: PatternResult[];
  summary: {
    totalPatterns: number;
    avgGlobTime: number;
    avgFastGlobTime: number;
    avgGloblinTime?: number;
    avgSpeedupVsGlob?: number;
  };
}

function measureTime(fn: () => unknown): { time: number; result: unknown } {
  const start = performance.now();
  const result = fn();
  const time = performance.now() - start;
  return { time, result };
}

function calculateStats(times: number[]): { mean: number; min: number; max: number; stdDev: number } {
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const variance = times.reduce((acc, t) => acc + Math.pow(t - mean, 2), 0) / times.length;
  const stdDev = Math.sqrt(variance);
  return { mean, min, max, stdDev };
}

function runBenchmark(fn: () => unknown): { stats: ReturnType<typeof calculateStats>; resultCount: number } {
  for (let i = 0; i < WARMUP_RUNS; i++) {
    fn();
  }

  const times: number[] = [];
  let resultCount = 0;

  for (let i = 0; i < BENCHMARK_RUNS; i++) {
    const { time, result } = measureTime(fn);
    times.push(time);
    if (Array.isArray(result)) {
      resultCount = result.length;
    }
  }

  return { stats: calculateStats(times), resultCount };
}

const PATTERNS = [
  '*.txt',
  '*.js',
  '**/*',
  '**/*.js',
  '**/*.ts',
  'level0/**/*.js',
  '**/*.{js,ts}',
  '**/*[0-9].js',
  '**/file?.js',
  '**/level1/**/*.ts',
];

function loadGloblin(): ((pattern: string, options?: { cwd?: string }) => string[]) | null {
  try {
    // Try loading from the compiled JS module first (recommended)
    const globlinModule = require('../index.js');
    if (globlinModule && typeof globlinModule.globSync === 'function') {
      return globlinModule.globSync;
    }
  } catch {
    // Fallback to raw native module
    try {
      const nativeModule = require('../index.node');
      if (nativeModule && typeof nativeModule.globSync === 'function') {
        return nativeModule.globSync;
      }
    } catch {
      // Globlin not built yet
    }
  }
  return null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let outputFile = 'bench-results.json';

  const outputIdx = args.indexOf('--output');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    outputFile = args[outputIdx + 1];
  }

  // Include large fixture if environment variable is set (reduces CI time)
  const includeLarge = process.env.BENCH_LARGE === 'true';
  const fixtures = includeLarge ? ['small', 'medium', 'large'] : ['small', 'medium'];
  const globlinSync = loadGloblin();

  console.log('Running CI benchmarks...');
  console.log(`Globlin available: ${globlinSync ? 'yes' : 'no'}`);

  const results: PatternResult[] = [];

  for (const fixtureName of fixtures) {
    const fixture = join(FIXTURES_BASE, fixtureName);

    if (!existsSync(fixture)) {
      console.error(`Fixture not found: ${fixture}`);
      console.error('Run: node benches/setup-fixtures.js');
      process.exit(1);
    }

    console.log(`\nBenchmarking ${fixtureName}...`);

    for (const pattern of PATTERNS) {
      process.stdout.write(`  ${pattern}... `);

      const globResult = runBenchmark(() => globSync(pattern, { cwd: fixture }));
      const fgResult = runBenchmark(() => fg.sync(pattern, { cwd: fixture }));

      const patternResult: PatternResult = {
        pattern,
        fixture: fixtureName,
        glob: { ...globResult.stats, resultCount: globResult.resultCount },
        fastGlob: { ...fgResult.stats, resultCount: fgResult.resultCount },
      };

      if (globlinSync) {
        const globlinResult = runBenchmark(() => globlinSync(pattern, { cwd: fixture }));
        patternResult.globlin = { ...globlinResult.stats, resultCount: globlinResult.resultCount };
      }

      results.push(patternResult);
      console.log('done');
    }
  }

  const avgGlobTime = results.reduce((acc, r) => acc + r.glob.mean, 0) / results.length;
  const avgFastGlobTime = results.reduce((acc, r) => acc + r.fastGlob.mean, 0) / results.length;
  const avgGloblinTime = globlinSync
    ? results.reduce((acc, r) => acc + (r.globlin?.mean || 0), 0) / results.length
    : undefined;
  const avgSpeedupVsGlob = avgGloblinTime ? avgGlobTime / avgGloblinTime : undefined;

  const output: BenchmarkOutput = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    fixtures,
    patterns: results,
    summary: {
      totalPatterns: results.length,
      avgGlobTime,
      avgFastGlobTime,
      avgGloblinTime,
      avgSpeedupVsGlob,
    },
  };

  writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`\nResults written to ${outputFile}`);

  console.log('\nSummary:');
  console.log(`  Average glob time:      ${avgGlobTime.toFixed(2)}ms`);
  console.log(`  Average fast-glob time: ${avgFastGlobTime.toFixed(2)}ms`);
  if (avgGloblinTime !== undefined) {
    console.log(`  Average globlin time:   ${avgGloblinTime.toFixed(2)}ms`);
    console.log(`  Speedup vs glob:        ${avgSpeedupVsGlob?.toFixed(1)}x`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
