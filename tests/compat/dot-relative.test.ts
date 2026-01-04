/**
 * Ported from vendor/glob/test/dot-relative.ts
 *
 * Tests the `dotRelative` option which prepends `./` to relative paths.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sep } from 'path'
import { glob as globOriginal, globSync as globSyncOriginal, Glob as GlobOriginal } from 'glob'
import { createTestFixture, cleanupFixture, loadGloblin, DEFAULT_FIXTURE } from '../harness.js'

describe('dot-relative - prepend ./ to relative paths', () => {
  let fixturePath: string
  let globlin: Awaited<ReturnType<typeof loadGloblin>>

  const pattern = 'a/b/**'

  beforeAll(async () => {
    fixturePath = await createTestFixture('dot-relative-test', DEFAULT_FIXTURE)
    globlin = await loadGloblin()
  })

  afterAll(async () => {
    await cleanupFixture(fixturePath)
  })

  describe('glob (original) behavior verification', () => {
    it('emits relative matches prefixed with ./ when dotRelative: true', async () => {
      const g = new GlobOriginal(pattern, { cwd: fixturePath, dotRelative: true })
      const results = await g.walk()

      expect(results.length).toBeGreaterThan(0)
      for (const m of results) {
        expect(m.startsWith('.' + sep)).toBe(true)
      }
    })

    it('returns ./ prefixed matches synchronously when dotRelative: true', () => {
      const g = new GlobOriginal(pattern, { cwd: fixturePath, dotRelative: true })
      const results = g.walkSync()

      expect(results.length).toBeGreaterThan(0)
      for (const m of results) {
        expect(m.startsWith('.' + sep)).toBe(true)
      }
    })

    it('does not prefix with ./ unless dotRelative is true', async () => {
      const g = new GlobOriginal(pattern, { cwd: fixturePath })
      const results = await g.walk()

      expect(results.length).toBeGreaterThan(0)
      for (const m of results) {
        expect(m.startsWith('.' + sep)).toBe(false)
      }
    })
  })

  describe('globlin implementation', () => {
    it('emits relative matches prefixed with ./ when dotRelative: true (async)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob(pattern, { cwd: fixturePath, dotRelative: true })

      expect(results.length).toBeGreaterThan(0)
      for (const m of results) {
        expect(m.startsWith('./')).toBe(true)
      }
    })

    it('emits relative matches prefixed with ./ when dotRelative: true (sync)', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = globlin.globSync(pattern, { cwd: fixturePath, dotRelative: true })

      expect(results.length).toBeGreaterThan(0)
      for (const m of results) {
        expect(m.startsWith('./')).toBe(true)
      }
    })

    it('does not prefix with ./ when dotRelative: false (async)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob(pattern, { cwd: fixturePath })

      expect(results.length).toBeGreaterThan(0)
      for (const m of results) {
        expect(m.startsWith('./')).toBe(false)
      }
    })

    it('does not prefix with ./ when dotRelative: false (sync)', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = globlin.globSync(pattern, { cwd: fixturePath })

      expect(results.length).toBeGreaterThan(0)
      for (const m of results) {
        expect(m.startsWith('./')).toBe(false)
      }
    })
  })

  describe('globlin matches glob behavior', () => {
    it('relative results with dotRelative: true match (normalized)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal(pattern, { cwd: fixturePath, dotRelative: true })
      const globlinResults = await globlin.glob(pattern, { cwd: fixturePath, dotRelative: true })

      // Normalize paths for comparison (handle different path separators)
      const normalize = (paths: string[]) =>
        new Set(paths.map(p => p.replace(/\\/g, '/')))

      expect(normalize(globlinResults)).toEqual(normalize(globResults))
    })

    it('relative results without dotRelative match', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal(pattern, { cwd: fixturePath })
      const globlinResults = await globlin.glob(pattern, { cwd: fixturePath })

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('edge cases', () => {
    it('works with simple patterns', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('a/b/c/d', { cwd: fixturePath, dotRelative: true })
      expect(results.length).toBe(1)
      expect(results[0]).toBe('./a/b/c/d')
    })

    it('works with ** pattern', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('**/*.txt', { cwd: fixturePath, dotRelative: true })
      for (const m of results) {
        expect(m.startsWith('./')).toBe(true)
      }
    })

    it('does not apply to absolute paths', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      // With absolute: true, paths should not get ./ prefix
      const results = await globlin.glob(pattern, { cwd: fixturePath, absolute: true, dotRelative: true })
      for (const m of results) {
        // Absolute paths should not start with ./
        expect(m.startsWith('./')).toBe(false)
      }
    })
  })
})
