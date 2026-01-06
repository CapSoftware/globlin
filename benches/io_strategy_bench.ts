import { globSync } from '../js/index.js'
import { globSync as globOriginal } from 'glob'
import fg from 'fast-glob'

const WARMUP = 3
const RUNS = 10
const CWD = 'benches/fixtures/medium'
const PATTERN = '**/*.js'

function bench(name: string, fn: () => unknown) {
  for (let i = 0; i < WARMUP; i++) fn()
  const times: number[] = []
  let count = 0
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now()
    const result = fn()
    times.push(performance.now() - start)
    if (Array.isArray(result)) count = result.length
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  console.log(`${name.padEnd(25)}: ${avg.toFixed(2)}ms (${count} results)`)
  return avg
}

console.log('\n=== I/O Strategy Comparison ===\n')
console.log(`Pattern: ${PATTERN}`)
console.log(`Fixture: ${CWD}\n`)

// Baseline
const globTime = bench('glob (baseline)', () => globOriginal(PATTERN, { cwd: CWD }))
const fgTime = bench('fast-glob', () => fg.sync(PATTERN, { cwd: CWD }))

// Standard globlin
const stdTime = bench('globlin (standard)', () => globSync(PATTERN, { cwd: CWD }))

// With native I/O
const nativeTime = bench('globlin (useNativeIO)', () =>
  globSync(PATTERN, { cwd: CWD, useNativeIO: true })
)

// With GCD
const gcdTime = bench('globlin (useGcd)', () => globSync(PATTERN, { cwd: CWD, useGcd: true }))

// With parallel
const parallelTime = bench('globlin (parallel)', () =>
  globSync(PATTERN, { cwd: CWD, parallel: true })
)

// With cache (run twice to see cache effect)
bench('globlin (cache) - cold', () => globSync(PATTERN, { cwd: CWD, cache: true }))
const cacheTime = bench('globlin (cache) - warm', () =>
  globSync(PATTERN, { cwd: CWD, cache: true })
)

// Combo: native + GCD
const comboTime = bench('globlin (native+gcd)', () =>
  globSync(PATTERN, { cwd: CWD, useNativeIO: true, useGcd: true })
)

console.log('\n=== Speedups vs glob ===\n')
console.log(`fast-glob:             ${(globTime / fgTime).toFixed(2)}x`)
console.log(`globlin (standard):    ${(globTime / stdTime).toFixed(2)}x`)
console.log(`globlin (useNativeIO): ${(globTime / nativeTime).toFixed(2)}x`)
console.log(`globlin (useGcd):      ${(globTime / gcdTime).toFixed(2)}x`)
console.log(`globlin (parallel):    ${(globTime / parallelTime).toFixed(2)}x`)
console.log(`globlin (cache warm):  ${(globTime / cacheTime).toFixed(2)}x`)
console.log(`globlin (native+gcd):  ${(globTime / comboTime).toFixed(2)}x`)
