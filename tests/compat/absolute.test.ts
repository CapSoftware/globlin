/**
 * Ported from vendor/glob/test/absolute.ts
 *
 * Tests the `absolute` option which returns absolute paths instead of relative paths.
 * Also tests the `posix` option which ensures forward slashes on all platforms.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { isAbsolute, resolve } from 'path'
import { glob as globOriginal, globSync as globSyncOriginal, Glob as GlobOriginal } from 'glob'
import { createTestFixture, cleanupFixture, loadGloblin, DEFAULT_FIXTURE } from '../harness.js'

describe('absolute - absolute path output option', () => {
  let fixturePath: string
  let globlin: Awaited<ReturnType<typeof loadGloblin>>

  // The pattern used in the original test
  const pattern = 'a/b/**'

  // Expected results from bash-results.ts
  const expectedRelative = ['a/b', 'a/b/c', 'a/b/c/d']

  beforeAll(async () => {
    // Create fixture matching the default glob test fixture
    fixturePath = await createTestFixture('absolute-test', DEFAULT_FIXTURE)
    globlin = await loadGloblin()
  })

  afterAll(async () => {
    await cleanupFixture(fixturePath)
  })

  describe('glob (original) behavior verification', () => {
    it('returns relative paths by default', async () => {
      const results = await globOriginal(pattern, { cwd: fixturePath })
      expect(results.length).toBe(expectedRelative.length)
      for (const m of results) {
        expect(isAbsolute(m)).toBe(false)
      }
    })

    it('returns absolute paths with absolute: true', async () => {
      const results = await globOriginal(pattern, { cwd: fixturePath, absolute: true })
      expect(results.length).toBe(expectedRelative.length)
      for (const m of results) {
        expect(isAbsolute(m)).toBe(true)
      }
    })

    it('returns POSIX-style absolute paths with absolute: true, posix: true', async () => {
      const results = await globOriginal(pattern, { cwd: fixturePath, absolute: true, posix: true })
      expect(results.length).toBe(expectedRelative.length)
      for (const m of results) {
        expect(m.startsWith('/')).toBe(true)
        expect(m).not.toContain('\\')
      }
    })

    it('Glob class returns absolute paths with absolute: true (async)', async () => {
      const g = new GlobOriginal(pattern, { cwd: fixturePath, absolute: true, posix: true })
      const results = await g.walk()
      expect(results.length).toBe(expectedRelative.length)
      for (const m of results) {
        expect(m.startsWith('/')).toBe(true)
      }
    })

    it('Glob class returns absolute paths with absolute: true (sync)', () => {
      const g = new GlobOriginal(pattern, { cwd: fixturePath, absolute: true })
      const results = g.walkSync()
      expect(results.length).toBe(expectedRelative.length)
      for (const m of results) {
        expect(isAbsolute(m)).toBe(true)
      }
    })
  })

  describe('globlin implementation', () => {
    it('returns relative paths by default (async)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob(pattern, { cwd: fixturePath })
      expect(results.length).toBe(expectedRelative.length)
      for (const m of results) {
        expect(isAbsolute(m)).toBe(false)
      }
    })

    it('returns relative paths by default (sync)', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = globlin.globSync(pattern, { cwd: fixturePath })
      expect(results.length).toBe(expectedRelative.length)
      for (const m of results) {
        expect(isAbsolute(m)).toBe(false)
      }
    })

    it('returns absolute paths with absolute: true (async)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob(pattern, { cwd: fixturePath, absolute: true })
      expect(results.length).toBe(expectedRelative.length)
      for (const m of results) {
        expect(isAbsolute(m)).toBe(true)
      }
    })

    it('returns absolute paths with absolute: true (sync)', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = globlin.globSync(pattern, { cwd: fixturePath, absolute: true })
      expect(results.length).toBe(expectedRelative.length)
      for (const m of results) {
        expect(isAbsolute(m)).toBe(true)
      }
    })

    it('returns POSIX-style absolute paths with absolute: true, posix: true (async)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob(pattern, { cwd: fixturePath, absolute: true, posix: true })
      expect(results.length).toBe(expectedRelative.length)
      for (const m of results) {
        expect(m.startsWith('/')).toBe(true)
        expect(m).not.toContain('\\')
      }
    })

    it('returns POSIX-style absolute paths with absolute: true, posix: true (sync)', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = globlin.globSync(pattern, { cwd: fixturePath, absolute: true, posix: true })
      expect(results.length).toBe(expectedRelative.length)
      for (const m of results) {
        expect(m.startsWith('/')).toBe(true)
        expect(m).not.toContain('\\')
      }
    })
  })

  describe('globlin matches glob behavior', () => {
    it('relative results match', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal(pattern, { cwd: fixturePath })
      const globlinResults = await globlin.glob(pattern, { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('absolute results match (paths point to same files)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal(pattern, { cwd: fixturePath, absolute: true })
      const globlinResults = await globlin.glob(pattern, { cwd: fixturePath, absolute: true })

      // Both should have the same count
      expect(globlinResults.length).toBe(globResults.length)

      // Both should produce absolute paths
      for (const m of globResults) {
        expect(isAbsolute(m)).toBe(true)
      }
      for (const m of globlinResults) {
        expect(isAbsolute(m)).toBe(true)
      }

      // Normalize both sets to compare (handle potential path differences)
      const normalizeSet = (paths: string[]) => new Set(paths.map(p => p.replace(/\\/g, '/')))

      expect(normalizeSet(globlinResults)).toEqual(normalizeSet(globResults))
    })

    it('posix absolute results match', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal(pattern, {
        cwd: fixturePath,
        absolute: true,
        posix: true,
      })
      const globlinResults = await globlin.glob(pattern, {
        cwd: fixturePath,
        absolute: true,
        posix: true,
      })

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('edge cases', () => {
    it('works with simple patterns', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('a/b/c/d', { cwd: fixturePath, absolute: true })
      expect(results.length).toBe(1)
      expect(isAbsolute(results[0])).toBe(true)
      expect(results[0]).toContain('a')
      expect(results[0]).toContain('b')
      expect(results[0]).toContain('c')
      expect(results[0]).toContain('d')
    })

    it('works with ** only pattern', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('**', { cwd: resolve(fixturePath, 'a/b'), absolute: true })
      // Should return: . (a/b), c, c/d
      expect(results.length).toBeGreaterThanOrEqual(3)
      for (const m of results) {
        expect(isAbsolute(m)).toBe(true)
      }
    })

    it('works with cwd trailing slash', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob(pattern, { cwd: fixturePath + '/', absolute: true })
      expect(results.length).toBe(expectedRelative.length)
      for (const m of results) {
        expect(isAbsolute(m)).toBe(true)
      }
    })
  })
})
