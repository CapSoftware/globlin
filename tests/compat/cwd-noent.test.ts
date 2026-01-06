/**
 * Ported from vendor/glob/test/cwd-noent.ts
 *
 * Tests behavior when cwd is a non-existent directory.
 * Both glob and globlin should return empty results instead of throwing.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resolve } from 'path'
import { glob as globOriginal, globSync as globSyncOriginal, Glob as GlobOriginal } from 'glob'
import { loadGloblin } from '../harness.js'
import { tmpdir } from 'os'

describe('cwd-noent - non-existent cwd behavior', () => {
  let globlin: Awaited<ReturnType<typeof loadGloblin>>
  const nonExistentCwd = resolve(tmpdir(), 'globlin-test-does-not-exist-' + Date.now())

  beforeAll(async () => {
    globlin = await loadGloblin()
  })

  describe('glob original behavior', () => {
    it('walk returns empty array for non-existent cwd', async () => {
      const g = new GlobOriginal('**', { cwd: nonExistentCwd })
      const results = await g.walk()
      expect(results).toEqual([])
    })

    it('walkSync returns empty array for non-existent cwd', () => {
      const g = new GlobOriginal('**', { cwd: nonExistentCwd })
      const results = g.walkSync()
      expect(results).toEqual([])
    })

    it('stream returns empty for non-existent cwd', async () => {
      const g = new GlobOriginal('**', { cwd: nonExistentCwd })
      const s = g.stream()
      const results = await s.collect()
      expect(results.length).toBe(0)
    })

    it('streamSync returns empty for non-existent cwd', () => {
      const g = new GlobOriginal('**', { cwd: nonExistentCwd })
      const s = g.streamSync()
      const results: string[] = []
      s.on('data', (p: string) => results.push(p))
      return new Promise<void>(resolve => {
        s.on('end', () => {
          expect(results).toEqual([])
          resolve()
        })
      })
    })

    it('iterate returns no entries for non-existent cwd', async () => {
      const g = new GlobOriginal('**', { cwd: nonExistentCwd })
      const results: string[] = []
      for await (const p of g.iterate()) {
        results.push(p)
      }
      expect(results).toEqual([])
    })

    it('iterateSync returns no entries for non-existent cwd', () => {
      const g = new GlobOriginal('**', { cwd: nonExistentCwd })
      const results: string[] = []
      for (const p of g.iterateSync()) {
        results.push(p)
      }
      expect(results).toEqual([])
    })

    it('for await returns no entries for non-existent cwd', async () => {
      const g = new GlobOriginal('**', { cwd: nonExistentCwd })
      const results: string[] = []
      for await (const p of g) {
        results.push(p)
      }
      expect(results).toEqual([])
    })

    it('for of returns no entries for non-existent cwd', () => {
      const g = new GlobOriginal('**', { cwd: nonExistentCwd })
      const results: string[] = []
      for (const p of g) {
        results.push(p)
      }
      expect(results).toEqual([])
    })
  })

  describe('globlin behavior', () => {
    it('glob returns empty array for non-existent cwd (async)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('**', { cwd: nonExistentCwd })
      expect(results).toEqual([])
    })

    it('globSync returns empty array for non-existent cwd', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = globlin.globSync('**', { cwd: nonExistentCwd })
      expect(results).toEqual([])
    })

    it('Glob class walk returns empty for non-existent cwd', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const g = new globlin.Glob('**', { cwd: nonExistentCwd })
      const results = await g.walk()
      expect(results).toEqual([])
    })

    it('Glob class walkSync returns empty for non-existent cwd', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const g = new globlin.Glob('**', { cwd: nonExistentCwd })
      const results = g.walkSync()
      expect(results).toEqual([])
    })
  })

  describe('comparison tests', () => {
    it('globlin matches glob behavior for async', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('**', { cwd: nonExistentCwd })
      const globlinResults = await globlin.glob('**', { cwd: nonExistentCwd })
      expect(globlinResults).toEqual(globResults)
    })

    it('globlin matches glob behavior for sync', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = globSyncOriginal('**', { cwd: nonExistentCwd })
      const globlinResults = globlin.globSync('**', { cwd: nonExistentCwd })
      expect(globlinResults).toEqual(globResults)
    })
  })
})
