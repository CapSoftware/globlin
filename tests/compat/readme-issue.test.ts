/**
 * Ported from vendor/glob/test/readme-issue.ts
 *
 * Tests a regression issue from the README examples.
 * The pattern 'README?(.*)' with nocase and mark should work correctly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { glob as globOriginal, globSync as globSyncOriginal } from 'glob'
import { createTestFixture, cleanupFixture, loadGloblin } from '../harness.js'

describe('readme-issue - README pattern with extglob', () => {
  let fixturePath: string
  let globlin: Awaited<ReturnType<typeof loadGloblin>>

  beforeAll(async () => {
    // Create fixture matching the original test
    fixturePath = await createTestFixture('readme-issue', {
      files: [
        'package.json',
        'README', // Note: no extension
        'README.md', // With extension
        'README.txt', // Different extension
      ],
    })
    globlin = await loadGloblin()
  })

  afterAll(async () => {
    await cleanupFixture(fixturePath)
  })

  describe('glob original behavior', () => {
    it('README?(.* ) matches README with nocase and mark (async)', async () => {
      const results = await globOriginal('README?(.*)', {
        cwd: fixturePath,
        nocase: true,
        mark: true,
      })
      // Should match 'README' (the file without extension)
      // The ?(.*) is an extglob meaning zero or one of (.*)
      expect(results).toContain('README')
    })

    it('README?(.* ) matches README with nocase and mark (sync)', () => {
      const results = globSyncOriginal('README?(.*)', {
        cwd: fixturePath,
        nocase: true,
        mark: true,
      })
      expect(results).toContain('README')
    })
  })

  describe('globlin behavior', () => {
    it('README?(.* ) matches README with nocase and mark (async)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('README?(.*)', {
        cwd: fixturePath,
        nocase: true,
        mark: true,
      })
      expect(results).toContain('README')
    })

    it('README?(.* ) matches README with nocase and mark (sync)', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = globlin.globSync('README?(.*)', {
        cwd: fixturePath,
        nocase: true,
        mark: true,
      })
      expect(results).toContain('README')
    })
  })

  describe('comparison tests', () => {
    it('globlin matches glob for README?(.* )', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const opts = { cwd: fixturePath, nocase: true, mark: true }
      const globResults = await globOriginal('README?(.*)', opts)
      const globlinResults = await globlin.glob('README?(.*)', opts)
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('additional extglob cases', () => {
    it('README* matches all README files', async () => {
      const results = await globOriginal('README*', { cwd: fixturePath })
      expect(results.length).toBe(3) // README, README.md, README.txt
    })

    it('globlin README* matches all README files', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('README*', { cwd: fixturePath })
      expect(results.length).toBe(3)
    })

    it('README.* matches only README with extensions', async () => {
      const results = await globOriginal('README.*', { cwd: fixturePath })
      expect(results.length).toBe(2) // README.md, README.txt
    })

    it('globlin README.* matches only README with extensions', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('README.*', { cwd: fixturePath })
      expect(results.length).toBe(2)
    })
  })
})
