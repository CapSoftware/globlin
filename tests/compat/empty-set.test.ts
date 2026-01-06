/**
 * Ported from vendor/glob/test/empty-set.ts
 *
 * Tests patterns that cannot match anything - should return empty results.
 * Also tests empty patterns (empty string and empty array).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { glob as globOriginal, globSync as globSyncOriginal } from 'glob'
import { createTestFixture, cleanupFixture, loadGloblin } from '../harness.js'

// Patterns that cannot match anything
const patterns = [
  '# comment',
  ' ',
  '\n',
  'just doesnt happen to match anything so this is a control',
]

describe('empty-set - patterns that cannot match anything', () => {
  let fixturePath: string
  let globlin: Awaited<ReturnType<typeof loadGloblin>>

  beforeAll(async () => {
    // Create a simple fixture - doesn't matter what files exist
    // since these patterns shouldn't match anything
    fixturePath = await createTestFixture('empty-set', {
      files: ['a.txt', 'b.js', 'c/d.ts', 'e/f/g.md'],
    })
    globlin = await loadGloblin()
  })

  afterAll(async () => {
    await cleanupFixture(fixturePath)
  })

  for (const pattern of patterns) {
    describe(`pattern: ${JSON.stringify(pattern)}`, () => {
      it('glob returns empty array', async () => {
        const results = await globOriginal(pattern, { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('globSync returns empty array', () => {
        const results = globSyncOriginal(pattern, { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('globlin returns empty array (async)', async () => {
        if (!globlin) {
          console.warn('Globlin not built, skipping')
          return
        }
        const results = await globlin.glob(pattern, { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('globlin returns empty array (sync)', () => {
        if (!globlin) {
          console.warn('Globlin not built, skipping')
          return
        }
        const results = globlin.globSync(pattern, { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('globlin matches glob behavior', async () => {
        if (!globlin) {
          console.warn('Globlin not built, skipping')
          return
        }
        const globResults = await globOriginal(pattern, { cwd: fixturePath })
        const globlinResults = await globlin.glob(pattern, { cwd: fixturePath })
        expect(globlinResults).toEqual(globResults)
      })
    })
  }

  // Additional edge cases for truly empty patterns
  describe('empty patterns', () => {
    describe('empty string pattern', () => {
      it('glob returns empty array', async () => {
        const results = await globOriginal('', { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('globSync returns empty array', () => {
        const results = globSyncOriginal('', { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('globlin returns empty array (async)', async () => {
        if (!globlin) {
          console.warn('Globlin not built, skipping')
          return
        }
        const results = await globlin.glob('', { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('globlin returns empty array (sync)', () => {
        if (!globlin) {
          console.warn('Globlin not built, skipping')
          return
        }
        const results = globlin.globSync('', { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('globlin matches glob behavior', async () => {
        if (!globlin) {
          console.warn('Globlin not built, skipping')
          return
        }
        const globResults = await globOriginal('', { cwd: fixturePath })
        const globlinResults = await globlin.glob('', { cwd: fixturePath })
        expect(globlinResults).toEqual(globResults)
      })
    })

    describe('empty array pattern', () => {
      it('glob returns empty array', async () => {
        const results = await globOriginal([], { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('globSync returns empty array', () => {
        const results = globSyncOriginal([], { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('globlin returns empty array (async)', async () => {
        if (!globlin) {
          console.warn('Globlin not built, skipping')
          return
        }
        const results = await globlin.glob([], { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('globlin returns empty array (sync)', () => {
        if (!globlin) {
          console.warn('Globlin not built, skipping')
          return
        }
        const results = globlin.globSync([], { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('globlin matches glob behavior', async () => {
        if (!globlin) {
          console.warn('Globlin not built, skipping')
          return
        }
        const globResults = await globOriginal([], { cwd: fixturePath })
        const globlinResults = await globlin.glob([], { cwd: fixturePath })
        expect(globlinResults).toEqual(globResults)
      })
    })

    describe('array with empty strings', () => {
      it('glob returns empty array for [""]', async () => {
        const results = await globOriginal([''], { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('globlin returns empty array for [""]', async () => {
        if (!globlin) {
          console.warn('Globlin not built, skipping')
          return
        }
        const results = await globlin.glob([''], { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('glob returns empty array for ["", ""]', async () => {
        const results = await globOriginal(['', ''], { cwd: fixturePath })
        expect(results).toEqual([])
      })

      it('globlin returns empty array for ["", ""]', async () => {
        if (!globlin) {
          console.warn('Globlin not built, skipping')
          return
        }
        const results = await globlin.glob(['', ''], { cwd: fixturePath })
        expect(results).toEqual([])
      })
    })

    describe('mixed empty and valid patterns', () => {
      it('glob ignores empty strings in array with valid patterns', async () => {
        const results = await globOriginal(['', '*.txt', ''], { cwd: fixturePath })
        expect(results).toEqual(['a.txt'])
      })

      it('globlin ignores empty strings in array with valid patterns', async () => {
        if (!globlin) {
          console.warn('Globlin not built, skipping')
          return
        }
        const results = await globlin.glob(['', '*.txt', ''], { cwd: fixturePath })
        expect(results).toEqual(['a.txt'])
      })

      it('globlin matches glob for mixed empty and valid patterns', async () => {
        if (!globlin) {
          console.warn('Globlin not built, skipping')
          return
        }
        const globResults = await globOriginal(['', '*.txt', ''], { cwd: fixturePath })
        const globlinResults = await globlin.glob(['', '*.txt', ''], { cwd: fixturePath })
        expect(globlinResults.sort()).toEqual(globResults.sort())
      })
    })
  })
})
