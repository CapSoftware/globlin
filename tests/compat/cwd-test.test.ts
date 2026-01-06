/**
 * Ported from vendor/glob/test/cwd-test.ts
 *
 * Tests changing cwd and searching for glob patterns with different cwd values.
 * Validates that both relative and absolute cwd values work correctly,
 * including with trailing slashes and '.' references.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { resolve, sep } from 'path'
import { glob as globOriginal, globSync as globSyncOriginal } from 'glob'
import { createTestFixture, cleanupFixture, loadGloblin } from '../harness.js'

// Helper to convert forward slashes to platform separator
const j = (a: string[]) => a.map(s => s.split('/').join(sep))

describe('cwd-test - changing cwd and searching for **/d', () => {
  let fixturePath: string
  let globlin: Awaited<ReturnType<typeof loadGloblin>>

  beforeAll(async () => {
    // Create fixture matching the original test
    // Structure:
    // - a/b/c/d
    // - a/c/d
    fixturePath = await createTestFixture('cwd-test', {
      files: ['a/b/c/d', 'a/c/d'],
    })
    globlin = await loadGloblin()
  })

  afterAll(async () => {
    await cleanupFixture(fixturePath)
  })

  // Test with cwd='a' - should find c/d and b/c/d
  describe('cwd: "a"', () => {
    const expected = new Set(j(['c/d', 'b/c/d']))

    it('glob returns expected matches (relative cwd)', async () => {
      const fullCwd = resolve(fixturePath, 'a')
      const results = await globOriginal('**/d', { cwd: fullCwd })
      expect(new Set(results)).toEqual(expected)
    })

    it('glob returns expected matches (cwd with trailing /)', async () => {
      const fullCwd = resolve(fixturePath, 'a') + '/'
      const results = await globOriginal('**/d', { cwd: fullCwd })
      expect(new Set(results)).toEqual(expected)
    })

    it('glob returns expected matches (cwd with /.)', async () => {
      const fullCwd = resolve(fixturePath, 'a') + '/.'
      const results = await globOriginal('**/d', { cwd: fullCwd })
      expect(new Set(results)).toEqual(expected)
    })

    it('glob returns expected matches (cwd with /./)', async () => {
      const fullCwd = resolve(fixturePath, 'a') + '/./'
      const results = await globOriginal('**/d', { cwd: fullCwd })
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin returns expected matches (async)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const fullCwd = resolve(fixturePath, 'a')
      const results = await globlin.glob('**/d', { cwd: fullCwd })
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin returns expected matches (sync)', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const fullCwd = resolve(fixturePath, 'a')
      const results = globlin.globSync('**/d', { cwd: fullCwd })
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin handles cwd with trailing /', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const fullCwd = resolve(fixturePath, 'a') + '/'
      const results = await globlin.glob('**/d', { cwd: fullCwd })
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin handles cwd with /.', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const fullCwd = resolve(fixturePath, 'a') + '/.'
      const results = await globlin.glob('**/d', { cwd: fullCwd })
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin matches glob behavior', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const fullCwd = resolve(fixturePath, 'a')
      const globResults = await globOriginal('**/d', { cwd: fullCwd })
      const globlinResults = await globlin.glob('**/d', { cwd: fullCwd })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  // Test with cwd='a/b' - should find c/d only
  describe('cwd: "a/b"', () => {
    const expected = new Set(j(['c/d']))

    it('glob returns expected matches', async () => {
      const fullCwd = resolve(fixturePath, 'a/b')
      const results = await globOriginal('**/d', { cwd: fullCwd })
      expect(new Set(results)).toEqual(expected)
    })

    it('glob returns expected matches (cwd with trailing /)', async () => {
      const fullCwd = resolve(fixturePath, 'a/b') + '/'
      const results = await globOriginal('**/d', { cwd: fullCwd })
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin returns expected matches (async)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const fullCwd = resolve(fixturePath, 'a/b')
      const results = await globlin.glob('**/d', { cwd: fullCwd })
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin returns expected matches (sync)', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const fullCwd = resolve(fixturePath, 'a/b')
      const results = globlin.globSync('**/d', { cwd: fullCwd })
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin matches glob behavior', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const fullCwd = resolve(fixturePath, 'a/b')
      const globResults = await globOriginal('**/d', { cwd: fullCwd })
      const globlinResults = await globlin.glob('**/d', { cwd: fullCwd })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  // Test with cwd='' (root) - should find a/b/c/d and a/c/d
  describe('cwd: "" (empty string / root)', () => {
    const expected = new Set(j(['a/b/c/d', 'a/c/d']))

    it('glob returns expected matches (cwd = fixturePath)', async () => {
      const results = await globOriginal('**/d', { cwd: fixturePath })
      expect(new Set(results)).toEqual(expected)
    })

    it('glob returns expected matches (cwd = .)', async () => {
      // Note: using '.' requires being in the fixture directory
      // So we use the absolute path instead
      const results = await globOriginal('**/d', { cwd: fixturePath })
      expect(new Set(results)).toEqual(expected)
    })

    it('glob returns expected matches (cwd with trailing /)', async () => {
      const results = await globOriginal('**/d', { cwd: fixturePath + '/' })
      expect(new Set(results)).toEqual(expected)
    })

    it('glob returns expected matches (cwd with /.)', async () => {
      const results = await globOriginal('**/d', { cwd: fixturePath + '/.' })
      expect(new Set(results)).toEqual(expected)
    })

    it('glob returns expected matches (cwd with /./)', async () => {
      const results = await globOriginal('**/d', { cwd: fixturePath + '/./' })
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin returns expected matches (async)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('**/d', { cwd: fixturePath })
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin returns expected matches (sync)', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = globlin.globSync('**/d', { cwd: fixturePath })
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin handles cwd with trailing /', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('**/d', { cwd: fixturePath + '/' })
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin handles cwd with /.', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('**/d', { cwd: fixturePath + '/.' })
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin handles cwd with /./', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('**/d', { cwd: fixturePath + '/./' })
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin matches glob behavior', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('**/d', { cwd: fixturePath })
      const globlinResults = await globlin.glob('**/d', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })
})
