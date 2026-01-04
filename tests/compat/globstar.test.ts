/**
 * Tests for basic globstar patterns.
 *
 * This file tests the core globstar functionality covering patterns like:
 * double-star slash star.ext - matches files at any depth
 * prefix/double-star/star.ext - matches within a directory
 * double-star - matches all files and directories
 * double-star/name - matches files/dirs named 'name' at any depth
 *
 * Based on patterns from vendor/glob/test/bash-results.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sep } from 'path'
import { glob as globOriginal, globSync as globSyncOriginal } from 'glob'
import { createTestFixture, cleanupFixture, loadGloblin } from '../harness.js'

// Helper to convert forward slashes to platform separator
const j = (a: string[]) => a.map(s => s.split('/').join(sep))

describe('globstar - basic ** pattern tests', () => {
  let fixturePath: string
  let globlin: Awaited<ReturnType<typeof loadGloblin>>

  beforeAll(async () => {
    // Create fixture with various file types at different depths
    fixturePath = await createTestFixture('globstar', {
      files: [
        // Root level files
        'file.txt',
        'file.js',
        'file.ts',
        // One level deep
        'src/index.ts',
        'src/utils.ts',
        'src/style.css',
        'lib/main.js',
        'lib/helper.js',
        // Two levels deep
        'src/components/Button.tsx',
        'src/components/Modal.tsx',
        'src/utils/string.ts',
        'src/utils/array.ts',
        'lib/core/base.js',
        // Three levels deep
        'src/components/ui/Input.tsx',
        'src/components/ui/Select.tsx',
        // Different extensions
        'docs/readme.md',
        'docs/api/overview.md',
        'config/settings.json',
        'config/env/dev.json',
      ],
    })
    globlin = await loadGloblin()
  })

  afterAll(async () => {
    await cleanupFixture(fixturePath)
  })

  describe('**/*.ts - match all .ts files at any depth', () => {
    it('glob returns expected matches', async () => {
      const results = await globOriginal('**/*.ts', { cwd: fixturePath })
      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => r.endsWith('.ts'))).toBe(true)
    })

    it('globlin returns expected matches (async)', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = await globlin.glob('**/*.ts', { cwd: fixturePath })
      expect(results.length).toBeGreaterThan(0)
      expect(results.every((r: string) => r.endsWith('.ts'))).toBe(true)
    })

    it('globlin returns expected matches (sync)', () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const results = globlin.globSync('**/*.ts', { cwd: fixturePath })
      expect(results.length).toBeGreaterThan(0)
      expect(results.every((r: string) => r.endsWith('.ts'))).toBe(true)
    })

    it('globlin matches glob behavior', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('**/*.ts', { cwd: fixturePath })
      const globlinResults = await globlin.glob('**/*.ts', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('**/*.js - match all .js files at any depth', () => {
    it('glob returns expected matches', async () => {
      const results = await globOriginal('**/*.js', { cwd: fixturePath })
      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => r.endsWith('.js'))).toBe(true)
    })

    it('globlin matches glob behavior', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('**/*.js', { cwd: fixturePath })
      const globlinResults = await globlin.glob('**/*.js', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('src/**/*.ts - match .ts files within src/', () => {
    it('glob returns expected matches', async () => {
      const results = await globOriginal('src/**/*.ts', { cwd: fixturePath })
      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => r.startsWith('src' + sep) && r.endsWith('.ts'))).toBe(true)
    })

    it('globlin matches glob behavior', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('src/**/*.ts', { cwd: fixturePath })
      const globlinResults = await globlin.glob('src/**/*.ts', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('src/** - match all files and dirs in src/', () => {
    it('glob returns expected matches', async () => {
      const results = await globOriginal('src/**', { cwd: fixturePath })
      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => r === 'src' || r.startsWith('src' + sep))).toBe(true)
    })

    it('globlin matches glob behavior', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('src/**', { cwd: fixturePath })
      const globlinResults = await globlin.glob('src/**', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('**/*.md - match all markdown files', () => {
    it('glob returns expected matches', async () => {
      const results = await globOriginal('**/*.md', { cwd: fixturePath })
      expect(results.length).toBe(2) // readme.md and overview.md
      expect(results.every(r => r.endsWith('.md'))).toBe(true)
    })

    it('globlin matches glob behavior', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('**/*.md', { cwd: fixturePath })
      const globlinResults = await globlin.glob('**/*.md', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('**/*.json - match all JSON files', () => {
    it('glob returns expected matches', async () => {
      const results = await globOriginal('**/*.json', { cwd: fixturePath })
      expect(results.length).toBe(2) // settings.json and dev.json
      expect(results.every(r => r.endsWith('.json'))).toBe(true)
    })

    it('globlin matches glob behavior', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('**/*.json', { cwd: fixturePath })
      const globlinResults = await globlin.glob('**/*.json', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('**/components/**/*.tsx - nested globstar', () => {
    it('glob returns expected matches', async () => {
      const results = await globOriginal('**/components/**/*.tsx', { cwd: fixturePath })
      expect(results.length).toBe(4) // Button, Modal, Input, Select
      expect(results.every(r => r.includes('components') && r.endsWith('.tsx'))).toBe(true)
    })

    it('globlin matches glob behavior', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('**/components/**/*.tsx', { cwd: fixturePath })
      const globlinResults = await globlin.glob('**/components/**/*.tsx', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('./**/g pattern (from bash-results)', () => {
    let bashFixturePath: string

    beforeAll(async () => {
      // Create fixture matching bash-results.ts test case
      bashFixturePath = await createTestFixture('globstar-bash', {
        files: [
          'a/abcdef/g/h',
          'a/abcfed/g/h',
          'a/b/c/d',
          'a/bc/e/f',
          'a/c/d/c/b',
          'a/cb/e/f',
        ],
      })
    })

    afterAll(async () => {
      await cleanupFixture(bashFixturePath)
    })

    it('glob returns expected matches', async () => {
      const results = await globOriginal('./**/g', { cwd: bashFixturePath })
      const expected = new Set(j(['a/abcdef/g', 'a/abcfed/g']))
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin matches glob behavior', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('./**/g', { cwd: bashFixturePath })
      const globlinResults = await globlin.glob('./**/g', { cwd: bashFixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('a/b/** pattern (from bash-results)', () => {
    let bashFixturePath: string

    beforeAll(async () => {
      bashFixturePath = await createTestFixture('globstar-ab', {
        files: [
          'a/b/c/d',
        ],
      })
    })

    afterAll(async () => {
      await cleanupFixture(bashFixturePath)
    })

    it('glob returns expected matches', async () => {
      const results = await globOriginal('a/b/**', { cwd: bashFixturePath })
      // Should match: a/b, a/b/c, a/b/c/d
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.every(r => r === 'a' + sep + 'b' || r.startsWith('a' + sep + 'b' + sep))).toBe(true)
    })

    it('globlin matches glob behavior', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('a/b/**', { cwd: bashFixturePath })
      const globlinResults = await globlin.glob('a/b/**', { cwd: bashFixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('*/*/*/f pattern (from bash-results)', () => {
    let bashFixturePath: string

    beforeAll(async () => {
      bashFixturePath = await createTestFixture('globstar-fff', {
        files: [
          'a/bc/e/f',
          'a/cb/e/f',
          'a/b/c/d',
        ],
      })
    })

    afterAll(async () => {
      await cleanupFixture(bashFixturePath)
    })

    it('glob returns expected matches', async () => {
      const results = await globOriginal('*/*/*/f', { cwd: bashFixturePath })
      const expected = new Set(j(['a/bc/e/f', 'a/cb/e/f']))
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin matches glob behavior', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('*/*/*/f', { cwd: bashFixturePath })
      const globlinResults = await globlin.glob('*/*/*/f', { cwd: bashFixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('./**/f pattern (from bash-results)', () => {
    let bashFixturePath: string

    beforeAll(async () => {
      bashFixturePath = await createTestFixture('globstar-f', {
        files: [
          'a/bc/e/f',
          'a/cb/e/f',
          'a/b/c/d',
        ],
      })
    })

    afterAll(async () => {
      await cleanupFixture(bashFixturePath)
    })

    it('glob returns expected matches', async () => {
      const results = await globOriginal('./**/f', { cwd: bashFixturePath })
      const expected = new Set(j(['a/bc/e/f', 'a/cb/e/f']))
      expect(new Set(results)).toEqual(expected)
    })

    it('globlin matches glob behavior', async () => {
      if (!globlin) {
        console.warn('Globlin not built, skipping')
        return
      }
      const globResults = await globOriginal('./**/f', { cwd: bashFixturePath })
      const globlinResults = await globlin.glob('./**/f', { cwd: bashFixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('edge cases', () => {
    it('** alone matches everything', async () => {
      const globResults = await globOriginal('**', { cwd: fixturePath })
      expect(globResults.length).toBeGreaterThan(0)
      
      if (!globlin) {
        console.warn('Globlin not built, skipping comparison')
        return
      }
      const globlinResults = await globlin.glob('**', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('**/* matches all files', async () => {
      const globResults = await globOriginal('**/*', { cwd: fixturePath })
      expect(globResults.length).toBeGreaterThan(0)
      
      if (!globlin) {
        console.warn('Globlin not built, skipping comparison')
        return
      }
      const globlinResults = await globlin.glob('**/*', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('handles multiple ** in pattern', async () => {
      const globResults = await globOriginal('**/**/*.ts', { cwd: fixturePath })
      expect(globResults.length).toBeGreaterThan(0)
      expect(globResults.every(r => r.endsWith('.ts'))).toBe(true)
      
      if (!globlin) {
        console.warn('Globlin not built, skipping comparison')
        return
      }
      const globlinResults = await globlin.glob('**/**/*.ts', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('handles trailing /** correctly', async () => {
      const globResults = await globOriginal('src/components/**', { cwd: fixturePath })
      expect(globResults.length).toBeGreaterThan(0)
      
      if (!globlin) {
        console.warn('Globlin not built, skipping comparison')
        return
      }
      const globlinResults = await globlin.glob('src/components/**', { cwd: fixturePath })
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })
})
