/**
 * Property-based tests for globlin using fast-check.
 *
 * These tests use random pattern generation to find edge cases
 * through 1000+ test iterations.
 *
 * All tests use REAL filesystem operations - no mocks or simulations.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fc from 'fast-check'
import * as fs from 'fs'
import * as path from 'path'
import { globSync as globOriginal, glob as globOriginalAsync } from 'glob'
import { loadGloblin, type GloblinModule, normalizePath } from './harness.js'
import { createRandomFixture, createLargeFixture } from './fixtures.js'

const fsp = fs.promises

let globlin: GloblinModule

const isWindows = process.platform === 'win32'

describe('Property-based tests', () => {
  let testFixture: string
  let largeFixture: string

  beforeAll(async () => {
    globlin = await loadGloblin()
    testFixture = await createRandomFixture({
      fileCount: 100,
      depth: 4,
      extensions: ['js', 'ts', 'tsx', 'json', 'md', 'txt'],
      includeDotFiles: true,
      includeSymlinks: !isWindows,
    })
    largeFixture = await createLargeFixture(500)
  }, 60000)

  afterAll(async () => {
    if (testFixture) {
      await fsp.rm(testFixture, { recursive: true, force: true })
    }
    if (largeFixture) {
      await fsp.rm(largeFixture, { recursive: true, force: true })
    }
  })

  function setsEqual(a: Set<string>, b: Set<string>): boolean {
    // Normalize paths for cross-platform comparison
    const normalizedA = new Set([...a].map(normalizePath))
    const normalizedB = new Set([...b].map(normalizePath))
    if (normalizedA.size !== normalizedB.size) return false
    for (const item of normalizedA) {
      if (!normalizedB.has(item)) return false
    }
    return true
  }

  describe('Pattern equivalence', () => {
    it('simple extension patterns always match glob', () => {
      fc.assert(
        fc.property(fc.constantFrom('js', 'ts', 'tsx', 'json', 'md', 'txt'), ext => {
          const pattern = `*.${ext}`
          const globResults = globOriginal(pattern, { cwd: testFixture })
          const globlinResults = globlin.globSync(pattern, { cwd: testFixture })
          return setsEqual(new Set(globResults), new Set(globlinResults))
        }),
        { numRuns: 50 }
      )
    })

    it('recursive extension patterns always match glob', () => {
      fc.assert(
        fc.property(fc.constantFrom('js', 'ts', 'tsx', 'json', 'md', 'txt'), ext => {
          const pattern = `**/*.${ext}`
          const globResults = globOriginal(pattern, { cwd: testFixture })
          const globlinResults = globlin.globSync(pattern, { cwd: testFixture })
          return setsEqual(new Set(globResults), new Set(globlinResults))
        }),
        { numRuns: 50 }
      )
    })

    it('wildcard patterns always match glob', () => {
      fc.assert(
        fc.property(fc.constantFrom('*', '**', '**/*'), pattern => {
          const globResults = globOriginal(pattern, { cwd: testFixture })
          const globlinResults = globlin.globSync(pattern, { cwd: testFixture })
          return setsEqual(new Set(globResults), new Set(globlinResults))
        }),
        { numRuns: 25 }
      )
    })

    it('generated patterns with prefix path should match glob', () => {
      fc.assert(
        fc.property(
          fc.record({
            prefix: fc.constantFrom('dir0_', 'dir1_', 'dir2_'),
            middle: fc.constantFrom('*', '**'),
            ext: fc.constantFrom('.js', '.ts', '.txt'),
          }),
          ({ prefix, middle, ext }) => {
            const pattern = `${prefix}*/${middle}/*${ext}`.replace(/\/+/g, '/')

            if (!pattern || pattern === '/') return true

            try {
              const globResults = globOriginal(pattern, { cwd: testFixture })
              const globlinResults = globlin.globSync(pattern, { cwd: testFixture })
              return setsEqual(new Set(globResults), new Set(globlinResults))
            } catch {
              return true
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Options equivalence', () => {
    it('dot option produces same results', () => {
      fc.assert(
        fc.property(fc.boolean(), fc.constantFrom('**/*', '*', '**/*.js'), (dot, pattern) => {
          const opts = { cwd: testFixture, dot }
          const globResults = globOriginal(pattern, opts)
          const globlinResults = globlin.globSync(pattern, opts)
          return setsEqual(new Set(globResults), new Set(globlinResults))
        }),
        { numRuns: 50 }
      )
    })

    it('nodir option produces same results', () => {
      fc.assert(
        fc.property(fc.boolean(), fc.constantFrom('**/*', '*', '**/*.js'), (nodir, pattern) => {
          const opts = { cwd: testFixture, nodir }
          const globResults = globOriginal(pattern, opts)
          const globlinResults = globlin.globSync(pattern, opts)
          return setsEqual(new Set(globResults), new Set(globlinResults))
        }),
        { numRuns: 50 }
      )
    })

    it('maxDepth option produces same results', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }),
          fc.constantFrom('**/*', '**/*.js', '**'),
          (maxDepth, pattern) => {
            const opts = { cwd: testFixture, maxDepth }
            const globResults = globOriginal(pattern, opts)
            const globlinResults = globlin.globSync(pattern, opts)
            return setsEqual(new Set(globResults), new Set(globlinResults))
          }
        ),
        { numRuns: 50 }
      )
    })

    it('combined options produce same results', () => {
      fc.assert(
        fc.property(
          fc.record({
            dot: fc.boolean(),
            nodir: fc.boolean(),
            maxDepth: fc.option(fc.integer({ min: 0, max: 4 })),
          }),
          options => {
            const pattern = '**/*'
            const opts = {
              cwd: testFixture,
              ...options,
              maxDepth: options.maxDepth ?? undefined,
            }
            const globResults = globOriginal(pattern, opts)
            const globlinResults = globlin.globSync(pattern, opts)
            return setsEqual(new Set(globResults), new Set(globlinResults))
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Pattern parsing robustness', () => {
    it('pattern parsing should never crash', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 100 }), pattern => {
          try {
            const result = globlin.globSync(pattern, { cwd: testFixture })
            return Array.isArray(result)
          } catch (e) {
            return e instanceof Error
          }
        }),
        { numRuns: 500 }
      )
    })

    it('patterns with special characters should not crash', () => {
      const specialChars = [
        '*',
        '?',
        '[',
        ']',
        '{',
        '}',
        '(',
        ')',
        '!',
        '@',
        '+',
        '|',
        '/',
        '.',
        '-',
        '_',
        'a',
        'b',
        '0',
        '1',
      ]
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(...specialChars), { minLength: 1, maxLength: 20 }),
          chars => {
            const pattern = chars.join('')
            try {
              const result = globlin.globSync(pattern, { cwd: testFixture })
              return Array.isArray(result)
            } catch (e) {
              return e instanceof Error
            }
          }
        ),
        { numRuns: 500 }
      )
    })

    it('deeply nested patterns should not crash or hang', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 20 }), depth => {
          const pattern = Array(depth).fill('*').join('/')
          try {
            const start = Date.now()
            const result = globlin.globSync(pattern, { cwd: testFixture })
            const elapsed = Date.now() - start
            return Array.isArray(result) && elapsed < 5000
          } catch (e) {
            return e instanceof Error
          }
        }),
        { numRuns: 50 }
      )
    })

    it('brace expansion patterns should not crash', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom('js', 'ts', 'tsx', 'json', 'md'), {
            minLength: 1,
            maxLength: 5,
          }),
          extensions => {
            const pattern = `**/*.{${extensions.join(',')}}`
            try {
              const result = globlin.globSync(pattern, { cwd: testFixture })
              return Array.isArray(result)
            } catch (e) {
              return e instanceof Error
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Multi-pattern handling', () => {
    it('array patterns should return union of results', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom('*.js', '*.ts', '*.json', '*.md'), {
            minLength: 1,
            maxLength: 4,
          }),
          patterns => {
            const globResults = globOriginal(patterns, { cwd: testFixture })
            const globlinResults = globlin.globSync(patterns, { cwd: testFixture })
            return setsEqual(new Set(globResults), new Set(globlinResults))
          }
        ),
        { numRuns: 50 }
      )
    })

    it('recursive array patterns should match glob', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom('**/*.js', '**/*.ts', '**/*.json'), {
            minLength: 1,
            maxLength: 3,
          }),
          patterns => {
            const globResults = globOriginal(patterns, { cwd: testFixture })
            const globlinResults = globlin.globSync(patterns, { cwd: testFixture })
            return setsEqual(new Set(globResults), new Set(globlinResults))
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  describe('Async/sync equivalence', () => {
    it('async and sync should return same results', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom('**/*.js', '**/*.ts', '*', '**/*'), async pattern => {
          const syncResults = globlin.globSync(pattern, { cwd: testFixture })
          const asyncResults = await globlin.glob(pattern, { cwd: testFixture })
          return setsEqual(new Set(syncResults), new Set(asyncResults))
        }),
        { numRuns: 50 }
      )
    })

    it('async should match glob async', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom('**/*.js', '*.ts', '**/*'), async pattern => {
          const globResults = await globOriginalAsync(pattern, { cwd: testFixture })
          const globlinResults = await globlin.glob(pattern, { cwd: testFixture })
          return setsEqual(new Set(globResults), new Set(globlinResults))
        }),
        { numRuns: 30 }
      )
    })
  })

  describe('Performance invariants', () => {
    it('should never be more than 5x slower than glob', () => {
      fc.assert(
        fc.property(fc.constantFrom('**/*.js', '**/*', '*.txt'), pattern => {
          const iterations = 3
          let globTotalTime = 0
          let globlinTotalTime = 0

          for (let i = 0; i < iterations; i++) {
            const start1 = performance.now()
            globOriginal(pattern, { cwd: largeFixture })
            globTotalTime += performance.now() - start1

            const start2 = performance.now()
            globlin.globSync(pattern, { cwd: largeFixture })
            globlinTotalTime += performance.now() - start2
          }

          const avgGlobTime = globTotalTime / iterations
          const avgGloblinTime = globlinTotalTime / iterations

          return avgGloblinTime < avgGlobTime * 5
        }),
        { numRuns: 20 }
      )
    })

    it('should complete within reasonable time bounds', () => {
      fc.assert(
        fc.property(fc.constantFrom('**/*', '**/*.js', '*', '*/*'), pattern => {
          const start = performance.now()
          const results = globlin.globSync(pattern, { cwd: largeFixture })
          const elapsed = performance.now() - start

          return Array.isArray(results) && elapsed < 10000
        }),
        { numRuns: 20 }
      )
    })
  })

  describe('Result consistency', () => {
    it('same pattern should return same results', () => {
      fc.assert(
        fc.property(fc.constantFrom('**/*.js', '**/*', '*'), pattern => {
          const results1 = globlin.globSync(pattern, { cwd: testFixture })
          const results2 = globlin.globSync(pattern, { cwd: testFixture })
          return setsEqual(new Set(results1), new Set(results2))
        }),
        { numRuns: 30 }
      )
    })

    it('results should be valid paths', () => {
      fc.assert(
        fc.property(fc.constantFrom('**/*', '**/*.js', '*'), pattern => {
          const results = globlin.globSync(pattern, { cwd: testFixture })
          return results.every((result: string) => {
            const fullPath = path.join(testFixture, result)
            try {
              return fs.existsSync(fullPath) || result === '.'
            } catch {
              return false
            }
          })
        }),
        { numRuns: 20 }
      )
    })
  })

  describe('Glob class consistency', () => {
    it('Glob class should return same results as globSync', () => {
      fc.assert(
        fc.property(fc.constantFrom('**/*.js', '**/*', '*.ts'), pattern => {
          const directResults = globlin.globSync(pattern, { cwd: testFixture })
          const g = new globlin.Glob(pattern, { cwd: testFixture })
          const classResults = g.walkSync()
          return setsEqual(new Set(directResults), new Set(classResults))
        }),
        { numRuns: 30 }
      )
    })
  })
})
