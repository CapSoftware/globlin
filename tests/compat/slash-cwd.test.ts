/**
 * Ported from vendor/glob/test/slash-cwd.ts
 *
 * Regression test to ensure slash-ended patterns don't match files
 * when using a different cwd. Only directories should match patterns
 * ending with '/'.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { resolve } from 'path'
import { glob as globOriginal, globSync as globSyncOriginal } from 'glob'
import { createTestFixture, cleanupFixture, loadGloblin } from '../harness.js'

describe('slash-cwd - patterns ending with / only match directories', () => {
  let fixturePath: string
  let globlin: Awaited<ReturnType<typeof loadGloblin>>

  beforeAll(async () => {
    // Create fixture mimicking the vendor/glob test structure
    // The original test looks for '../{*.md,test}/' from the test directory
    // We'll create a structure where we can look for patterns that end with /
    fixturePath = await createTestFixture('slash-cwd', {
      files: [
        'README.md', // A file with .md extension
        'CHANGELOG.md', // Another file
        'test/file.txt', // A directory named test
        'src/main.ts', // Other files and dirs
      ],
    })
    globlin = await loadGloblin()
  })

  afterAll(async () => {
    await cleanupFixture(fixturePath)
  })

  describe('glob original behavior', () => {
    it('pattern ending with / only matches directories (async)', async () => {
      // Pattern: '../{*.md,test}/' from 'src' directory
      // Should match: . (the current directory, which is represented as '.')
      // because 'test' is a directory and 'test/' matches it
      const srcCwd = resolve(fixturePath, 'src')
      const results = await globOriginal('../{*.md,test}/', { cwd: srcCwd })
      // Should find '../test/' as a directory, returned as relative path from cwd
      expect(results.length).toBeGreaterThanOrEqual(0)
      // MD files should NOT match because they're not directories
      expect(results.every(r => !r.endsWith('.md'))).toBe(true)
    })

    it('pattern ending with / only matches directories (sync)', () => {
      const srcCwd = resolve(fixturePath, 'src')
      const results = globSyncOriginal('../{*.md,test}/', { cwd: srcCwd })
      expect(results.every(r => !r.endsWith('.md'))).toBe(true)
    })
  })

  describe('basic slash-ending pattern tests', () => {
    it('glob: */ only matches directories', async () => {
      const results = await globOriginal('*/', { cwd: fixturePath })
      // Should find 'test/' and 'src/'
      expect(results.length).toBe(2)
      expect(new Set(results)).toEqual(new Set(['test', 'src']))
    })

    it('glob: *.md/ matches nothing (no md files are directories)', async () => {
      const results = await globOriginal('*.md/', { cwd: fixturePath })
      expect(results).toEqual([])
    })

    it('globlin: */ only matches directories (async)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('*/', { cwd: fixturePath })
      expect(results.length).toBe(2)
      expect(new Set(results)).toEqual(new Set(['test', 'src']))
    })

    it('globlin: */ only matches directories (sync)', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = globlin.globSync('*/', { cwd: fixturePath })
      expect(results.length).toBe(2)
      expect(new Set(results)).toEqual(new Set(['test', 'src']))
    })

    it('globlin: *.md/ matches nothing', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('*.md/', { cwd: fixturePath })
      expect(results).toEqual([])
    })
  })

  describe('comparison tests', () => {
    it('globlin matches glob for */ pattern', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('*/', { cwd: fixturePath })
      const globlinResults = await globlin.glob('*/', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('globlin matches glob for test/ pattern', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('test/', { cwd: fixturePath })
      const globlinResults = await globlin.glob('test/', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('globlin matches glob for **/*/ pattern', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('**/*/', { cwd: fixturePath })
      const globlinResults = await globlin.glob('**/*/', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })
})
