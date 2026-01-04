/**
 * Test utility functions for globlin.
 * 
 * Re-exports from harness.ts for cleaner imports.
 */

export {
  measureTime,
  measureTimeSync,
  compareTiming,
  compareTimingSync,
  setsEqual,
  shouldPreserveOrder,
  normalizePath,
  normalizePaths,
  loadGloblin,
  type TimingResult
} from './harness.js'

import * as path from 'path'

/**
 * Clean path results for cross-platform comparison.
 * Normalizes path separators and sorts results.
 */
export function cleanResults(results: string[]): string[] {
  return results
    .map(r => r.replace(/\/$/, '').replace(/\/+/g, '/'))
    .map(r => path.join(r))
    .sort(alphasort)
    .reduce((acc: string[], f) => {
      if (f !== acc[acc.length - 1]) acc.push(f)
      return acc
    }, [])
    .sort(alphasort)
    .map(f => {
      // Normalize Windows paths
      return process.platform !== 'win32'
        ? f
        : f.replace(/^[a-zA-Z]:\\\\/, '/').replace(/\\/g, '/')
    })
}

/**
 * Case-insensitive alphabetical sort
 */
export function alphasort(a: string, b: string): number {
  return a.toLowerCase().localeCompare(b.toLowerCase(), 'en')
}

/**
 * Wait for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delayMs?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 100 } = options
  
  let lastError: Error | undefined
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e as Error
      if (attempt < maxAttempts - 1) {
        await sleep(delayMs * Math.pow(2, attempt))
      }
    }
  }
  
  throw lastError
}

/**
 * Get memory usage in MB
 */
export function getMemoryUsageMB(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024
}

/**
 * Format a duration in milliseconds for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(2)}us`
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * Format a speedup factor for display
 */
export function formatSpeedup(speedup: number): string {
  if (speedup >= 10) {
    return `${Math.round(speedup)}x`
  }
  return `${speedup.toFixed(1)}x`
}
