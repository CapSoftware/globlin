import * as fs from 'fs';
import * as path from 'path';

const DIR = 'benches/fixtures/medium';
const WARMUP = 3;
const RUNS = 20;

function bench(name: string, fn: () => number) {
  for (let i = 0; i < WARMUP; i++) fn();
  const times: number[] = [];
  let count = 0;
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    count = fn();
    times.push(performance.now() - start);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`${name.padEnd(35)}: ${avg.toFixed(2)}ms (${count} entries)`);
}

console.log('\n=== Node.js readdir comparison ===\n');

// Just count entries in root
bench('readdirSync (names only)', () => {
  return fs.readdirSync(DIR).length;
});

bench('readdirSync (withFileTypes)', () => {
  return fs.readdirSync(DIR, { withFileTypes: true }).length;
});

// Full recursive walk
console.log('\n=== Full recursive walk ===\n');

function walkNames(dir: string): number {
  let count = 0;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    count++;
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        count += walkNames(fullPath);
      }
    } catch {}
  }
  return count;
}

function walkDirents(dir: string): number {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    count++;
    if (entry.isDirectory()) {
      count += walkDirents(path.join(dir, entry.name));
    }
  }
  return count;
}

bench('recursive walk (names + stat)', () => walkNames(DIR));
bench('recursive walk (withFileTypes)', () => walkDirents(DIR));

// This shows the ~2x difference that withFileTypes provides
console.log('\nKey insight: withFileTypes avoids stat() syscalls per file');
