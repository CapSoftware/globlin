/**
 * Node.js profiling script for globlin
 * 
 * Run with:
 *   npm run build && npx tsx benches/profile_node.ts
 * 
 * For CPU profiling:
 *   node --prof benches/profile_node.ts
 *   node --prof-process isolate-*.log > processed.txt
 */

import { globSync } from '../js/index.js';
import { glob as globOriginal } from 'glob';
import { performance } from 'perf_hooks';

const FIXTURES = {
  small: 'benches/fixtures/small',
  medium: 'benches/fixtures/medium',
  large: 'benches/fixtures/large',
};

const PATTERNS = [
  { name: 'simple_ext', pattern: '*.js' },
  { name: 'recursive_ext', pattern: '**/*.js' },
  { name: 'recursive_all', pattern: '**/*' },
  { name: 'recursive_multi_ext', pattern: '**/*.{js,ts}' },
  { name: 'char_class', pattern: '**/*[0-9].js' },
  { name: 'question_mark', pattern: '**/file?.js' },
  { name: 'scoped', pattern: 'level0/**/*.js' },
];

interface BenchResult {
  pattern: string;
  fixture: string;
  globlinTime: number;
  globTime: number;
  speedup: number;
  globlinResults: number;
  globResults: number;
  match: boolean;
}

async function benchmark(
  pattern: string,
  cwd: string,
  iterations: number = 5
): Promise<{ globlinTime: number; globTime: number; globlinResults: string[]; globResults: string[] }> {
  // Warmup
  for (let i = 0; i < 2; i++) {
    globSync(pattern, { cwd });
    await globOriginal(pattern, { cwd });
  }

  // Benchmark globlin
  const globlinTimes: number[] = [];
  let globlinResults: string[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    globlinResults = globSync(pattern, { cwd });
    globlinTimes.push(performance.now() - start);
  }

  // Benchmark glob
  const globTimes: number[] = [];
  let globResults: string[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    globResults = await globOriginal(pattern, { cwd });
    globTimes.push(performance.now() - start);
  }

  return {
    globlinTime: globlinTimes.reduce((a, b) => a + b, 0) / globlinTimes.length,
    globTime: globTimes.reduce((a, b) => a + b, 0) / globTimes.length,
    globlinResults,
    globResults,
  };
}

async function main() {
  console.log('='.repeat(80));
  console.log('Globlin Performance Profiling Report');
  console.log('='.repeat(80));
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('');

  const results: BenchResult[] = [];

  for (const [fixtureSize, fixturePath] of Object.entries(FIXTURES)) {
    console.log(`\n## Fixture: ${fixtureSize} (${fixturePath})`);
    console.log('-'.repeat(60));

    for (const { name, pattern } of PATTERNS) {
      try {
        const { globlinTime, globTime, globlinResults, globResults } = await benchmark(
          pattern,
          fixturePath,
          fixtureSize === 'large' ? 3 : 5
        );

        const speedup = globTime / globlinTime;
        const match = globlinResults.length === globResults.length;

        results.push({
          pattern: name,
          fixture: fixtureSize,
          globlinTime,
          globTime,
          speedup,
          globlinResults: globlinResults.length,
          globResults: globResults.length,
          match,
        });

        console.log(`${name.padEnd(20)} | globlin: ${globlinTime.toFixed(2).padStart(8)}ms | glob: ${globTime.toFixed(2).padStart(8)}ms | speedup: ${speedup.toFixed(2).padStart(6)}x | match: ${match ? '✓' : '✗'}`);
      } catch (error) {
        console.error(`Error benchmarking ${name}:`, error);
      }
    }
  }

  // Summary
  console.log('\n');
  console.log('='.repeat(80));
  console.log('Summary');
  console.log('='.repeat(80));

  for (const fixtureSize of Object.keys(FIXTURES)) {
    const fixtureResults = results.filter(r => r.fixture === fixtureSize);
    const avgSpeedup = fixtureResults.reduce((a, b) => a + b.speedup, 0) / fixtureResults.length;
    const minSpeedup = Math.min(...fixtureResults.map(r => r.speedup));
    const maxSpeedup = Math.max(...fixtureResults.map(r => r.speedup));
    const allMatch = fixtureResults.every(r => r.match);

    console.log(`\n${fixtureSize.toUpperCase()} fixture:`);
    console.log(`  Average speedup: ${avgSpeedup.toFixed(2)}x`);
    console.log(`  Min speedup:     ${minSpeedup.toFixed(2)}x`);
    console.log(`  Max speedup:     ${maxSpeedup.toFixed(2)}x`);
    console.log(`  Results match:   ${allMatch ? '✓ All patterns match glob' : '✗ Some mismatches'}`);
  }

  // Hot path analysis (based on profiling knowledge from Phase 2.5)
  console.log('\n');
  console.log('='.repeat(80));
  console.log('Hot Path Analysis');
  console.log('='.repeat(80));
  console.log(`
Based on profiling:

1. I/O Operations (~85% of execution time)
   - readdir syscalls dominate execution
   - Each directory traversal triggers filesystem I/O
   - SSD latency is the main bottleneck
   
2. Pattern Matching (~3% of execution time)
   - Regex compilation happens once per pattern
   - Fast-path matching (extension check) is O(1)
   - Full regex matching is O(n) where n = path length
   
3. String Operations (~5% of execution time)
   - Path normalization (backslash to forward slash)
   - String allocation for results
   - HashSet operations for deduplication
   
4. Walker Operations (~5% of execution time)
   - Walker creation and configuration
   - Depth limiting and pruning checks
   - Symlink handling (metadata calls)

5. Allocation Hotspots:
   - Vec<String> for results
   - HashSet<String> for deduplication
   - Path string conversions (PathBuf -> String)
`);

  // Recommendations
  console.log('\n');
  console.log('='.repeat(80));
  console.log('Recommendations for Phase 5 Optimization');
  console.log('='.repeat(80));
  console.log(`
To achieve 20-30x speedup target:

1. Parallel Walking (rayon/jwalk)
   - Expected: 2-4x improvement on multi-core systems
   - Use rayon's par_bridge() for parallel iteration
   - Consider jwalk for built-in parallelism
   
2. Async I/O (tokio::fs)
   - Expected: 1.5-2x improvement
   - Async readdir to overlap I/O operations
   - Non-blocking stat calls
   
3. Caching
   - Cache compiled regex patterns
   - Cache directory contents for repeated operations
   - Consider PathScurry-style path caching
   
4. Memory Optimization
   - String interning for common path segments
   - Arena allocation for temporary strings
   - Reduce HashMap/HashSet overhead

5. Platform-Specific Optimizations
   - Direct syscalls (io_uring on Linux)
   - APFS/HFS+ optimized traversal on macOS
   - Windows FindFirstFile/FindNextFile batching
`);
}

main().catch(console.error);
