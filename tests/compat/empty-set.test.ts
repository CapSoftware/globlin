/**
 * Ported from vendor/glob/test/empty-set.ts
 * 
 * Tests patterns that cannot match anything - should return empty results.
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
      files: [
        'a.txt',
        'b.js',
        'c/d.ts',
        'e/f/g.md',
      ],
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
})
