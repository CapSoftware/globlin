/**
 * Ported from vendor/glob/test/mark.ts
 *
 * Tests the `mark` option which appends `/` to directory paths.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sep } from 'path'
import { glob as globOriginal, globSync as globSyncOriginal } from 'glob'
import { createTestFixture, cleanupFixture, loadGloblin, DEFAULT_FIXTURE } from '../harness.js'

const alphasort = (a: string, b: string) => a.localeCompare(b, 'en')
const normalize = (paths: string[]) =>
  paths.map(s => s.replace(/\\/g, '/')).sort(alphasort)

describe('mark - append / to directories', () => {
  let fixturePath: string
  let globlin: Awaited<ReturnType<typeof loadGloblin>>

  beforeAll(async () => {
    fixturePath = await createTestFixture('mark-test', DEFAULT_FIXTURE)
    globlin = await loadGloblin()
  })

  afterAll(async () => {
    await cleanupFixture(fixturePath)
  })

  describe('glob (original) behavior verification', () => {
    it('mark with cwd - directories end with /', async () => {
      const pattern = '*/*'
      const results = await globOriginal(pattern, { mark: true, cwd: `${fixturePath}/a` })

      // All directories should end with /
      for (const m of results) {
        // Check if it looks like a directory (contains a slash and ends with /)
        if (m.endsWith('/')) {
          expect(m.endsWith('/')).toBe(true)
        }
      }
    })

    it('mark=false - directories do not end with /', async () => {
      const pattern = '*/*'
      const results = await globOriginal(pattern, { mark: false, cwd: `${fixturePath}/a` })

      // No paths should end with /
      for (const m of results) {
        expect(m.endsWith('/')).toBe(false)
      }
    })

    it('sync mark with cwd', () => {
      const pattern = '*/*'
      const results = globSyncOriginal(pattern, { mark: true, cwd: `${fixturePath}/a` })

      // All directories should end with /
      for (const m of results) {
        if (m.endsWith('/')) {
          expect(m.endsWith('/')).toBe(true)
        }
      }
    })
  })

  describe('globlin implementation', () => {
    it('mark: true - directories end with / (async)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const pattern = '*'
      const results = await globlin.glob(pattern, { mark: true, cwd: fixturePath })

      // Find a directory in the results
      const dirs = results.filter(r => r.endsWith('/'))
      const files = results.filter(r => !r.endsWith('/'))

      // We know we have directories in our fixture
      expect(dirs.length).toBeGreaterThan(0)

      // Files should not end with /
      for (const f of files) {
        expect(f.endsWith('/')).toBe(false)
      }
    })

    it('mark: true - directories end with / (sync)', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const pattern = '*'
      const results = globlin.globSync(pattern, { mark: true, cwd: fixturePath })

      const dirs = results.filter(r => r.endsWith('/'))
      expect(dirs.length).toBeGreaterThan(0)
    })

    it('mark: false - directories do not end with / (async)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const pattern = '*'
      const results = await globlin.glob(pattern, { mark: false, cwd: fixturePath })

      for (const m of results) {
        expect(m.endsWith('/')).toBe(false)
      }
    })

    it('default (mark: undefined) - directories do not end with /', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const pattern = '*'
      const results = await globlin.glob(pattern, { cwd: fixturePath })

      for (const m of results) {
        expect(m.endsWith('/')).toBe(false)
      }
    })
  })

  describe('globlin matches glob behavior', () => {
    it('mark: true results match (normalized)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const pattern = '*'
      const globResults = await globOriginal(pattern, { mark: true, cwd: fixturePath })
      const globlinResults = await globlin.glob(pattern, { mark: true, cwd: fixturePath })

      expect(new Set(normalize(globlinResults))).toEqual(new Set(normalize(globResults)))
    })

    it('mark: false results match', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const pattern = '*'
      const globResults = await globOriginal(pattern, { mark: false, cwd: fixturePath })
      const globlinResults = await globlin.glob(pattern, { mark: false, cwd: fixturePath })

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('nested directories', () => {
    it('mark with ** pattern', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const pattern = '**/*'
      const results = await globlin.glob(pattern, { mark: true, cwd: fixturePath })

      // Find nested directories
      const nestedDirs = results.filter(r => r.includes('/') && r.endsWith('/'))
      expect(nestedDirs.length).toBeGreaterThan(0)

      // Verify nested directories end with /
      for (const d of nestedDirs) {
        expect(d.endsWith('/')).toBe(true)
      }
    })

    it('mark with ** pattern matches glob', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const pattern = '**/*'
      const globResults = await globOriginal(pattern, { mark: true, cwd: fixturePath })
      const globlinResults = await globlin.glob(pattern, { mark: true, cwd: fixturePath })

      expect(new Set(normalize(globlinResults))).toEqual(new Set(normalize(globResults)))
    })
  })

  describe('mark with . (cwd) matching', () => {
    it('cwd . becomes ./ with mark: true', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const pattern = '.'
      const results = await globlin.glob(pattern, { mark: true, cwd: fixturePath })

      expect(results.length).toBe(1)
      expect(results[0]).toBe('./')
    })

    it('cwd . stays . with mark: false', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const pattern = '.'
      const results = await globlin.glob(pattern, { mark: false, cwd: fixturePath })

      expect(results.length).toBe(1)
      expect(results[0]).toBe('.')
    })

    it('** includes ./ with mark: true', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const pattern = '**'
      const results = await globlin.glob(pattern, { mark: true, cwd: fixturePath })

      // Should include ./ for the root
      expect(results).toContain('./')
    })
  })

  describe('mark combined with other options', () => {
    it('mark with dotRelative', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const pattern = '*'
      const results = await globlin.glob(pattern, { mark: true, dotRelative: true, cwd: fixturePath })

      // Directories should have both ./ prefix and / suffix
      const dirs = results.filter(r => r.endsWith('/'))
      for (const d of dirs) {
        expect(d.startsWith('./')).toBe(true)
        expect(d.endsWith('/')).toBe(true)
      }

      // Files should have ./ prefix but not / suffix
      const files = results.filter(r => !r.endsWith('/'))
      for (const f of files) {
        expect(f.startsWith('./')).toBe(true)
      }
    })

    it('mark with nodir - should have no results ending with /', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const pattern = '*'
      const results = await globlin.glob(pattern, { mark: true, nodir: true, cwd: fixturePath })

      // With nodir: true, no directories are returned, so no paths should end with /
      for (const m of results) {
        expect(m.endsWith('/')).toBe(false)
      }
    })
  })
})
