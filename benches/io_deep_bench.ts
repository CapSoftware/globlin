import { globSync } from '../js/index.js';
import { globSync as globOriginal } from 'glob';
import fg from 'fast-glob';

const WARMUP = 3;
const RUNS = 10;

function bench(name: string, fn: () => unknown) {
  for (let i = 0; i < WARMUP; i++) fn();
  const times: number[] = [];
  let count = 0;
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    const result = fn();
    times.push(performance.now() - start);
    if (Array.isArray(result)) count = result.length;
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  console.log(`${name.padEnd(25)}: ${avg.toFixed(2)}ms (min: ${min.toFixed(2)}ms, ${count} results)`);
  return avg;
}

// Test on LARGE fixture to see if parallelism helps with scale
console.log('\n=== LARGE Fixture (100K files) ===\n');

const LARGE_CWD = 'benches/fixtures/large';
const PATTERN = '**/*.js';

console.log(`Pattern: ${PATTERN}\n`);

const gL = bench('glob', () => globOriginal(PATTERN, { cwd: LARGE_CWD }));
const fgL = bench('fast-glob', () => fg.sync(PATTERN, { cwd: LARGE_CWD }));
const stdL = bench('globlin (standard)', () => globSync(PATTERN, { cwd: LARGE_CWD }));
const parallelL = bench('globlin (parallel)', () => globSync(PATTERN, { cwd: LARGE_CWD, parallel: true }));
const cacheL = bench('globlin (cache warm)', () => globSync(PATTERN, { cwd: LARGE_CWD, cache: true }));

console.log(`\nSpeedups: std=${(gL/stdL).toFixed(2)}x parallel=${(gL/parallelL).toFixed(2)}x cache=${(gL/cacheL).toFixed(2)}x`);

// Now test with simple pattern (should be faster since less matching)
console.log('\n\n=== Simple Pattern: *.js (root only) ===\n');

const SIMPLE = '*.js';
console.log(`Pattern: ${SIMPLE}\n`);

const gS = bench('glob', () => globOriginal(SIMPLE, { cwd: LARGE_CWD }));
const fgS = bench('fast-glob', () => fg.sync(SIMPLE, { cwd: LARGE_CWD }));
const stdS = bench('globlin (standard)', () => globSync(SIMPLE, { cwd: LARGE_CWD }));

console.log(`\nSpeedup: ${(gS/stdS).toFixed(2)}x (should be very fast - no recursion)`);

// Test scoped pattern - should benefit from walk_root optimization
console.log('\n\n=== Scoped Pattern: src/**/*.js ===\n');

// First create a "src" directory in the fixture if it doesn't exist
const SCOPED = 'level0/**/*.ts';
console.log(`Pattern: ${SCOPED}\n`);

const gSc = bench('glob', () => globOriginal(SCOPED, { cwd: LARGE_CWD }));
const fgSc = bench('fast-glob', () => fg.sync(SCOPED, { cwd: LARGE_CWD }));
const stdSc = bench('globlin (standard)', () => globSync(SCOPED, { cwd: LARGE_CWD }));

console.log(`\nSpeedup: ${(gSc/stdSc).toFixed(2)}x`);
