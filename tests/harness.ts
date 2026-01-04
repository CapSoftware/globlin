/**
 * Test harness for differential testing between globlin and glob.
 * 
 * All tests use REAL filesystem operations - no mocks or simulations.
 * Every test compares globlin results against glob results on identical fixtures.
 */

import * as fs from 'fs'
import * as path from 'path'
import { glob as globOriginal, globSync as globSyncOriginal } from 'glob'
import type { GlobOptions } from 'glob'

const fsp = fs.promises

/**
 * Result of comparing glob and globlin outputs
 */
export interface ComparisonResult {
  /** Results from glob */
  globResults: string[]
  /** Results from globlin */
  globlinResults: string[]
  /** Whether results match (order-independent) */
  match: boolean
  /** Files missing from globlin results */
  missing: string[]
  /** Extra files in globlin results */
  extra: string[]
  /** Time taken by glob in ms */
  globTime: number
  /** Time taken by globlin in ms */
  globlinTime: number
  /** Speedup factor (glob time / globlin time) */
  speedup: number
}

/**
 * Options for comparing glob results
 */
export interface CompareOptions {
  /** Whether result order must match (default: false) */
  ordered?: boolean
  /** Skip globlin if not available (for testing harness itself) */
  skipIfNoGloblin?: boolean
}

// Type for our globlin module
export interface GloblinModule {
  glob(pattern: string | string[], options?: Record<string, unknown>): Promise<string[]>
  globSync(pattern: string | string[], options?: Record<string, unknown>): string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Glob: new (pattern: string | string[], options?: Record<string, unknown>) => any
}

// Globlin imports - will be available after build
let globlinModule: GloblinModule | null = null
let globlinLoadAttempted = false

export async function loadGloblin(): Promise<GloblinModule> {
  if (globlinLoadAttempted && globlinModule) {
    return globlinModule
  }
  
  globlinLoadAttempted = true
  
  try {
    // Dynamic import to handle case where native module isn't built yet
    const mod = await import('../js/index.js')
    globlinModule = {
      glob: mod.glob || mod.default?.glob,
      globSync: mod.globSync || mod.default?.globSync,
      Glob: mod.Glob || mod.default?.Glob
    }
    return globlinModule
  } catch (err) {
    // Native module not built yet
    throw new Error(`Globlin native module not available. Run 'npm run build' first. Error: ${err}`)
  }
}

/**
 * Compare glob and globlin results for a given pattern and options.
 * Creates a real filesystem fixture, runs both implementations, and compares.
 */
export async function compareGlobResults(
  pattern: string | string[],
  options: GlobOptions & CompareOptions,
  fixturePath: string
): Promise<ComparisonResult> {
  const { ordered = false, skipIfNoGloblin = false, ...globOptions } = options
  const fullOptions = { ...globOptions, cwd: fixturePath }
  
  // Run glob - cast result to string[] (we're not using withFileTypes)
  const globStart = performance.now()
  const rawGlobResults = await globOriginal(pattern, fullOptions)
  const globResults = rawGlobResults as string[]
  const globTime = performance.now() - globStart
  
  // Try to run globlin
  const globlin = await loadGloblin()
  
  if (!globlin && skipIfNoGloblin) {
    return {
      globResults,
      globlinResults: [],
      match: false,
      missing: globResults,
      extra: [],
      globTime,
      globlinTime: 0,
      speedup: 0
    }
  }
  
  if (!globlin) {
    throw new Error(
      'Globlin native module not available. Run `npm run build` first.'
    )
  }
  
  const globlinStart = performance.now()
  const globlinResults = await globlin.glob(pattern, fullOptions)
  const globlinTime = performance.now() - globlinStart
  
  // Compare results
  const globSet = new Set(globResults)
  const globlinSet = new Set(globlinResults)
  
  const missing = globResults.filter((r: string) => !globlinSet.has(r))
  const extra = globlinResults.filter((r: string) => !globSet.has(r))
  
  let match = missing.length === 0 && extra.length === 0
  
  // Check order if required
  if (match && ordered) {
    match = globResults.length === globlinResults.length &&
      globResults.every((r: string, i: number) => r === globlinResults[i])
  }
  
  return {
    globResults,
    globlinResults,
    match,
    missing,
    extra,
    globTime,
    globlinTime,
    speedup: globlinTime > 0 ? globTime / globlinTime : 0
  }
}

/**
 * Compare sync glob and globlin results
 */
export function compareGlobResultsSync(
  pattern: string | string[],
  options: GlobOptions & CompareOptions,
  fixturePath: string
): ComparisonResult {
  const { ordered = false, skipIfNoGloblin = false, ...globOptions } = options
  const fullOptions = { ...globOptions, cwd: fixturePath }
  
  // Run glob - cast result to string[]
  const globStart = performance.now()
  const rawGlobResults = globSyncOriginal(pattern, fullOptions)
  const globResults = rawGlobResults as string[]
  const globTime = performance.now() - globStart
  
  // For sync, we need pre-loaded module
  let globlinResults: string[] = []
  let globlinTime = 0
  
  if (globlinModule) {
    const globlinStart = performance.now()
    globlinResults = globlinModule.globSync(pattern, fullOptions)
    globlinTime = performance.now() - globlinStart
  } else if (!skipIfNoGloblin) {
    throw new Error(
      'Globlin native module not available. Run `npm run build` first, or call loadGloblin() first.'
    )
  }
  
  // Compare results
  const globSet = new Set(globResults)
  const globlinSet = new Set(globlinResults)
  
  const missing = globResults.filter((r: string) => !globlinSet.has(r))
  const extra = globlinResults.filter((r: string) => !globSet.has(r))
  
  let match = missing.length === 0 && extra.length === 0
  
  if (match && ordered) {
    match = globResults.length === globlinResults.length &&
      globResults.every((r: string, i: number) => r === globlinResults[i])
  }
  
  return {
    globResults,
    globlinResults,
    match,
    missing,
    extra,
    globTime,
    globlinTime,
    speedup: globlinTime > 0 ? globTime / globlinTime : 0
  }
}

/**
 * Assert that glob and globlin produce identical results
 */
export function assertResultsMatch(result: ComparisonResult): void {
  if (!result.match) {
    const details: string[] = []
    
    if (result.missing.length > 0) {
      details.push(`Missing from globlin (${result.missing.length}):`)
      details.push(...result.missing.slice(0, 10).map((f: string) => `  - ${f}`))
      if (result.missing.length > 10) {
        details.push(`  ... and ${result.missing.length - 10} more`)
      }
    }
    
    if (result.extra.length > 0) {
      details.push(`Extra in globlin (${result.extra.length}):`)
      details.push(...result.extra.slice(0, 10).map((f: string) => `  - ${f}`))
      if (result.extra.length > 10) {
        details.push(`  ... and ${result.extra.length - 10} more`)
      }
    }
    
    throw new Error(
      `Results mismatch: glob found ${result.globResults.length}, ` +
      `globlin found ${result.globlinResults.length}\n${details.join('\n')}`
    )
  }
}

/**
 * Assert minimum performance speedup
 */
export function assertSpeedup(result: ComparisonResult, minSpeedup: number): void {
  if (result.speedup < minSpeedup) {
    throw new Error(
      `Performance target not met: expected ${minSpeedup}x speedup, ` +
      `got ${result.speedup.toFixed(2)}x\n` +
      `glob: ${result.globTime.toFixed(2)}ms, ` +
      `globlin: ${result.globlinTime.toFixed(2)}ms`
    )
  }
}

/**
 * Run a complete differential test
 */
export async function runDifferentialTest(
  pattern: string | string[],
  options: GlobOptions,
  fixturePath: string,
  expectedSpeedup?: number
): Promise<ComparisonResult> {
  const result = await compareGlobResults(pattern, options, fixturePath)
  
  assertResultsMatch(result)
  
  if (expectedSpeedup !== undefined) {
    assertSpeedup(result, expectedSpeedup)
  }
  
  return result
}

// ----- Fixture Management -----

const FIXTURES_ROOT = path.join(__dirname, 'fixtures')

/**
 * Standard test fixture file structure
 */
export interface FixtureConfig {
  /** File paths to create (relative to fixture root) */
  files?: string[]
  /** Directory paths to create (relative to fixture root) */
  dirs?: string[]
  /** Symlinks to create: [linkPath, target] pairs */
  symlinks?: Array<[string, string]>
  /** File contents (if not specified, files contain their own path) */
  contents?: Record<string, string>
}

/**
 * Default test fixture matching glob's test setup
 */
export const DEFAULT_FIXTURE: FixtureConfig = {
  files: [
    'a/.abcdef/x/y/z/a',
    'a/abcdef/g/h',
    'a/abcfed/g/h',
    'a/b/c/d',
    'a/bc/e/f',
    'a/c/d/c/b',
    'a/cb/e/f',
    'a/x/.y/b',
    'a/z/.y/b',
  ],
  symlinks: process.platform !== 'win32' 
    ? [['a/symlink/a/b/c', '../..']]
    : [],
}

/**
 * Create a test fixture with real files on disk
 */
export async function createTestFixture(
  name: string,
  config: FixtureConfig = DEFAULT_FIXTURE
): Promise<string> {
  const fixtureDir = path.join(FIXTURES_ROOT, name, `run-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  
  // Create fixture root
  await fsp.mkdir(fixtureDir, { recursive: true })
  
  // Create directories first
  if (config.dirs) {
    for (const dir of config.dirs) {
      await fsp.mkdir(path.join(fixtureDir, dir), { recursive: true })
    }
  }
  
  // Create files
  if (config.files) {
    for (const file of config.files) {
      const filePath = path.join(fixtureDir, file)
      await fsp.mkdir(path.dirname(filePath), { recursive: true })
      const content = config.contents?.[file] ?? file
      await fsp.writeFile(filePath, content)
    }
  }
  
  // Create symlinks
  if (config.symlinks) {
    for (const [linkPath, target] of config.symlinks) {
      const fullLinkPath = path.join(fixtureDir, linkPath)
      await fsp.mkdir(path.dirname(fullLinkPath), { recursive: true })
      try {
        await fsp.symlink(target, fullLinkPath)
      } catch {
        // Symlink creation may fail on Windows without admin rights
        console.warn(`Could not create symlink: ${linkPath} -> ${target}`)
      }
    }
  }
  
  return fixtureDir
}

/**
 * Create a large test fixture for benchmarking
 */
export async function createLargeFixture(
  fileCount: number,
  options: {
    maxDepth?: number
    extensions?: string[]
    name?: string
  } = {}
): Promise<string> {
  const { maxDepth = 5, extensions = ['js', 'ts', 'txt'], name = `large-${fileCount}` } = options
  const fixtureDir = path.join(FIXTURES_ROOT, name, `run-${Date.now()}`)
  
  await fsp.mkdir(fixtureDir, { recursive: true })
  
  for (let i = 0; i < fileCount; i++) {
    const depth = i % maxDepth
    const ext = extensions[i % extensions.length]
    const dirParts = Array.from({ length: depth }, (_, j) => `level${j}`)
    const filePath = path.join(fixtureDir, ...dirParts, `file${i}.${ext}`)
    
    await fsp.mkdir(path.dirname(filePath), { recursive: true })
    await fsp.writeFile(filePath, `// File ${i}\n`)
  }
  
  return fixtureDir
}

/**
 * Clean up a test fixture
 */
export async function cleanupFixture(fixturePath: string): Promise<void> {
  try {
    await fsp.rm(fixturePath, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Clean up all fixtures in a category
 */
export async function cleanupAllFixtures(name?: string): Promise<void> {
  const targetDir = name ? path.join(FIXTURES_ROOT, name) : FIXTURES_ROOT
  try {
    await fsp.rm(targetDir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

// ----- Utility Functions -----

/**
 * Measure execution time of an async function
 */
export async function measureTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; time: number }> {
  const start = performance.now()
  const result = await fn()
  const time = performance.now() - start
  return { result, time }
}

/**
 * Measure execution time of a sync function
 */
export function measureTimeSync<T>(
  fn: () => T
): { result: T; time: number } {
  const start = performance.now()
  const result = fn()
  const time = performance.now() - start
  return { result, time }
}

/**
 * Result of timing comparison between glob and globlin
 */
export interface TimingResult {
  globTime: number
  globlinTime: number
  speedup: number
}

/**
 * Compare execution timing between glob and globlin.
 * Useful for quick performance comparisons without full result comparison.
 */
export async function compareTiming(
  pattern: string | string[],
  options: GlobOptions,
  fixtureRoot: string
): Promise<TimingResult> {
  const fullOptions = { ...options, cwd: fixtureRoot }
  
  const { time: globTime } = await measureTime(() =>
    globOriginal(pattern, fullOptions) as Promise<string[]>
  )
  
  const globlin = await loadGloblin()
  if (!globlin) {
    throw new Error('Globlin native module not available. Run `npm run build` first.')
  }
  
  const { time: globlinTime } = await measureTime(() =>
    globlin.glob(pattern, fullOptions)
  )
  
  return {
    globTime,
    globlinTime,
    speedup: globlinTime > 0 ? globTime / globlinTime : 0
  }
}

/**
 * Sync version of compareTiming
 */
export function compareTimingSync(
  pattern: string | string[],
  options: GlobOptions,
  fixtureRoot: string
): TimingResult {
  const fullOptions = { ...options, cwd: fixtureRoot }
  
  const { time: globTime } = measureTimeSync(() =>
    globSyncOriginal(pattern, fullOptions) as string[]
  )
  
  if (!globlinModule) {
    throw new Error('Globlin native module not available. Run `npm run build` first, or call loadGloblin() first.')
  }
  
  const { time: globlinTime } = measureTimeSync(() =>
    globlinModule!.globSync(pattern, fullOptions)
  )
  
  return {
    globTime,
    globlinTime,
    speedup: globlinTime > 0 ? globTime / globlinTime : 0
  }
}

/**
 * Check if two sets are equal
 */
export function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

/**
 * Determine if result order should be preserved for these options
 */
export function shouldPreserveOrder(_options: GlobOptions): boolean {
  // Most glob operations don't guarantee order, but some do
  // For now, we default to order-independent comparison
  return false
}

/**
 * Normalize path separators for cross-platform comparison
 */
export function normalizePath(p: string): string {
  return p.split(path.sep).join('/')
}

/**
 * Normalize an array of paths
 */
export function normalizePaths(paths: string[]): string[] {
  return paths.map(normalizePath).sort()
}


