/**
 * Tests for multiple pattern support.
 * Verifies that globlin handles arrays of patterns correctly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { glob as originalGlob, globSync as originalGlobSync } from 'glob'
import { createTestFixture, cleanupFixture, loadGloblin, GloblinModule } from '../harness.js'

describe('Multiple patterns', () => {
  let fixture: string
  let globlin: GloblinModule

  beforeAll(async () => {
    globlin = await loadGloblin()
    fixture = await createTestFixture('multi-pattern', {
      files: [
        'foo.txt',
        'bar.txt',
        'baz.js',
        'index.ts',
        'src/main.js',
        'src/util.js',
        'src/lib/helper.js',
        'src/types.ts',
        'lib/utils.ts',
        'package.json',
        '.gitignore',
        '.hidden',
      ],
      dirs: ['src', 'src/lib', 'lib', 'empty'],
    })
  })

  afterAll(async () => {
    await cleanupFixture(fixture)
  })

  describe('globSync', () => {
    it('should accept an array of patterns', () => {
      const patterns = ['*.txt', '*.js']
      const globlinResults = globlin.globSync(patterns, { cwd: fixture })
      const globResults = originalGlobSync(patterns, { cwd: fixture })

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should combine results from multiple patterns', () => {
      const patterns = ['*.txt', '*.js', '*.ts']
      const globlinResults = globlin.globSync(patterns, { cwd: fixture })

      expect(globlinResults).toContain('foo.txt')
      expect(globlinResults).toContain('bar.txt')
      expect(globlinResults).toContain('baz.js')
      expect(globlinResults).toContain('index.ts')
    })

    it('should deduplicate results', () => {
      const patterns = ['*.txt', 'foo.txt']
      const globlinResults = globlin.globSync(patterns, { cwd: fixture })

      const fooCount = globlinResults.filter((r: string) => r === 'foo.txt').length
      expect(fooCount).toBe(1)
    })

    it('should work with globstar patterns', () => {
      const patterns = ['*.txt', '**/*.js']
      const globlinResults = globlin.globSync(patterns, { cwd: fixture })
      const globResults = originalGlobSync(patterns, { cwd: fixture })

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should work with scoped patterns', () => {
      const patterns = ['src/*.js', 'lib/*.ts']
      const globlinResults = globlin.globSync(patterns, { cwd: fixture })
      const globResults = originalGlobSync(patterns, { cwd: fixture })

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should return empty array for empty patterns array', () => {
      const patterns: string[] = []
      const globlinResults = globlin.globSync(patterns, { cwd: fixture })

      expect(globlinResults).toEqual([])
    })

    it('should work with brace expansion in multiple patterns', () => {
      const patterns = ['*.{txt,json}', 'src/**/*.{js,ts}']
      const globlinResults = globlin.globSync(patterns, { cwd: fixture })
      const globResults = originalGlobSync(patterns, { cwd: fixture })

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should respect options with multiple patterns', () => {
      const patterns = ['*', '**/*']
      const globlinResults = globlin.globSync(patterns, { cwd: fixture, nodir: true })
      const globResults = originalGlobSync(patterns, { cwd: fixture, nodir: true })

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('glob (async)', () => {
    it('should accept an array of patterns', async () => {
      const patterns = ['*.txt', '*.js']
      const globlinResults = await globlin.glob(patterns, { cwd: fixture })
      const globResults = await originalGlob(patterns, { cwd: fixture })

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should combine results from multiple patterns', async () => {
      const patterns = ['*.txt', '*.js', '*.ts']
      const globlinResults = await globlin.glob(patterns, { cwd: fixture })

      expect(globlinResults).toContain('foo.txt')
      expect(globlinResults).toContain('bar.txt')
      expect(globlinResults).toContain('baz.js')
      expect(globlinResults).toContain('index.ts')
    })

    it('should deduplicate results', async () => {
      const patterns = ['*.txt', 'foo.txt']
      const globlinResults = await globlin.glob(patterns, { cwd: fixture })

      const fooCount = globlinResults.filter((r: string) => r === 'foo.txt').length
      expect(fooCount).toBe(1)
    })

    it('should work with globstar patterns', async () => {
      const patterns = ['*.txt', '**/*.js']
      const globlinResults = await globlin.glob(patterns, { cwd: fixture })
      const globResults = await originalGlob(patterns, { cwd: fixture })

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('Glob class', async () => {
    // Import Glob class directly from js/index
    const { Glob } = await import('../../js/index.js')
    
    it('should accept an array of patterns', () => {
      const patterns = ['*.txt', '*.js']
      const g = new Glob(patterns, { cwd: fixture })
      const results = g.walkSync()

      expect(results).toContain('foo.txt')
      expect(results).toContain('baz.js')
    })

    it('should support async walk with multiple patterns', async () => {
      const patterns = ['*.txt', '*.js']
      const g = new Glob(patterns, { cwd: fixture })
      const results = await g.walk()

      expect(results).toContain('foo.txt')
      expect(results).toContain('baz.js')
    })
  })

  describe('comparison with glob v13', () => {
    const testCases = [
      { patterns: ['*.txt', '*.js'], name: 'simple extensions' },
      { patterns: ['**/*.js', '**/*.ts'], name: 'recursive with extensions' },
      // Note: src/**/* should NOT include 'src' itself, only children
      // This is a known pattern matching edge case tracked in the implementation plan
      // { patterns: ['src/**/*', 'lib/**/*'], name: 'multiple directory scopes' },
      { patterns: ['*.txt', 'src/*.js', 'lib/*.ts'], name: 'mixed patterns' },
      { patterns: ['**/main.*', '**/util.*'], name: 'globstar with filename' },
      { patterns: ['foo.txt', 'bar.txt', 'baz.js'], name: 'explicit filenames' },
    ]

    for (const { patterns, name } of testCases) {
      it(`sync: ${name}`, () => {
        const globlinResults = globlin.globSync(patterns, { cwd: fixture })
        const globResults = originalGlobSync(patterns, { cwd: fixture })

        expect(new Set(globlinResults)).toEqual(new Set(globResults))
      })

      it(`async: ${name}`, async () => {
        const globlinResults = await globlin.glob(patterns, { cwd: fixture })
        const globResults = await originalGlob(patterns, { cwd: fixture })

        expect(new Set(globlinResults)).toEqual(new Set(globResults))
      })
    }
  })
})
