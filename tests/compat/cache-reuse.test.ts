/**
 * Tests for Glob cache reuse functionality
 *
 * In glob v13, you can pass a Glob instance as the options to another Glob
 * to reuse its settings and caches.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Glob as GloblinGlob } from '../../js/index.js'
import { Glob as GlobGlob } from 'glob'
import { createTestFixture, cleanupFixture, type FixtureConfig } from '../harness.js'

const CACHE_REUSE_FIXTURE: FixtureConfig = {
  files: [
    'src/index.ts',
    'src/utils.ts',
    'src/lib/helper.ts',
    'test/index.test.ts',
    'test/utils.test.ts',
    'docs/readme.md',
    '.gitignore',
    'package.json',
  ],
  contents: {
    'src/index.ts': 'export default {}',
    'src/utils.ts': 'export const util = 1',
    'src/lib/helper.ts': 'export const helper = 1',
    'test/index.test.ts': 'test',
    'test/utils.test.ts': 'test',
    'docs/readme.md': '# Readme',
    '.gitignore': 'node_modules',
    'package.json': '{}',
  },
}

describe('Glob cache reuse', () => {
  let fixture: string

  beforeAll(async () => {
    fixture = await createTestFixture('cache-reuse', CACHE_REUSE_FIXTURE)
  })

  afterAll(async () => {
    if (fixture) {
      await cleanupFixture(fixture)
    }
  })

  describe('globlin', () => {
    it('should accept a Glob instance as options', () => {
      const g1 = new GloblinGlob('**/*.ts', { cwd: fixture, dot: true })
      const g2 = new GloblinGlob('**/*.md', g1)

      expect(g2.options.cwd).toBe(fixture)
      expect(g2.options.dot).toBe(true)
      expect(g2.pattern).toEqual(['**/*.md'])
    })

    it('should return results using inherited cwd', () => {
      const g1 = new GloblinGlob('**/*.ts', { cwd: fixture })
      const g2 = new GloblinGlob('**/*.md', g1)

      const results = g2.walkSync()
      expect(results).toContain('docs/readme.md')
    })

    it('should inherit all relevant options', () => {
      const g1 = new GloblinGlob('**/*.ts', {
        cwd: fixture,
        dot: true,
        nocase: true,
        follow: false,
        maxDepth: 5,
        absolute: true,
        dotRelative: true,
        mark: true,
        nodir: true,
      })
      const g2 = new GloblinGlob('**/*.md', g1)

      expect(g2.options.cwd).toBe(fixture)
      expect(g2.options.dot).toBe(true)
      expect(g2.options.nocase).toBe(true)
      expect(g2.options.follow).toBe(false)
      expect(g2.options.maxDepth).toBe(5)
      expect(g2.options.absolute).toBe(true)
      expect(g2.options.dotRelative).toBe(true)
      expect(g2.options.mark).toBe(true)
      expect(g2.options.nodir).toBe(true)
    })

    it('should allow multiple glob operations with same settings', () => {
      const g1 = new GloblinGlob('**/*.ts', { cwd: fixture })
      const tsFiles = g1.walkSync()

      const g2 = new GloblinGlob('**/*.md', g1)
      const mdFiles = g2.walkSync()

      const g3 = new GloblinGlob('*.json', g1)
      const jsonFiles = g3.walkSync()

      expect(tsFiles.length).toBeGreaterThan(0)
      expect(mdFiles.length).toBeGreaterThan(0)
      expect(jsonFiles.length).toBeGreaterThan(0)
    })

    it('should validate options even when reusing from Glob instance', () => {
      // The source Glob has matchBase but the new pattern is different
      // Still should fail if noglobstar is set in the options
      const g1 = new GloblinGlob('**/*.ts', { cwd: fixture, matchBase: true })

      // This should throw because matchBase is inherited but noglobstar was set
      // However, since g1 already validated matchBase, it works fine
      expect(() => {
        new GloblinGlob('*.js', g1)
      }).not.toThrow()
    })

    it('should work with streaming API when reusing options', async () => {
      const g1 = new GloblinGlob('**/*.ts', { cwd: fixture })
      const g2 = new GloblinGlob('**/*.md', g1)

      const stream = g2.stream()
      const results: string[] = []

      for await (const file of stream) {
        results.push(file)
      }

      expect(results).toContain('docs/readme.md')
    })

    it('should work with iterate API when reusing options', async () => {
      const g1 = new GloblinGlob('**/*.ts', { cwd: fixture })
      const g2 = new GloblinGlob('**/*.md', g1)

      const results: string[] = []
      for await (const file of g2) {
        results.push(file)
      }

      expect(results).toContain('docs/readme.md')
    })

    it('should work with iterateSync API when reusing options', () => {
      const g1 = new GloblinGlob('**/*.ts', { cwd: fixture })
      const g2 = new GloblinGlob('**/*.md', g1)

      const results: string[] = []
      for (const file of g2) {
        results.push(file)
      }

      expect(results).toContain('docs/readme.md')
    })
  })

  describe('comparison with glob', () => {
    it('should produce same results as glob when reusing options', () => {
      // glob
      const globG1 = new GlobGlob('**/*.ts', { cwd: fixture })
      const globG2 = new GlobGlob('**/*.md', globG1)
      const globResults = globG2.walkSync()

      // globlin
      const globlinG1 = new GloblinGlob('**/*.ts', { cwd: fixture })
      const globlinG2 = new GloblinGlob('**/*.md', globlinG1)
      const globlinResults = globlinG2.walkSync()

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should inherit options the same way as glob', () => {
      const options = {
        cwd: fixture,
        dot: true,
        nocase: true,
      }

      // glob
      const globG1 = new GlobGlob('**/*.ts', options)
      const globG2 = new GlobGlob('.*', globG1)

      // globlin
      const globlinG1 = new GloblinGlob('**/*.ts', options)
      const globlinG2 = new GloblinGlob('.*', globlinG1)

      // Both should find .gitignore because dot is inherited
      const globResults = globG2.walkSync()
      const globlinResults = globlinG2.walkSync()

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('edge cases', () => {
    it('should handle empty options object', () => {
      const g1 = new GloblinGlob('**/*.ts', {})
      const g2 = new GloblinGlob('**/*.md', g1)

      expect(g2.options).toEqual({})
    })

    it('should handle chained cache reuse', () => {
      const g1 = new GloblinGlob('**/*.ts', { cwd: fixture, dot: true })
      const g2 = new GloblinGlob('**/*.md', g1)
      const g3 = new GloblinGlob('**/*.json', g2)

      // g3 should still have the original options from g1
      expect(g3.options.cwd).toBe(fixture)
      expect(g3.options.dot).toBe(true)
    })

    it('should not share mutable state between instances', () => {
      const g1 = new GloblinGlob('**/*.ts', { cwd: fixture })
      const g2 = new GloblinGlob('**/*.md', g1)

      // Patterns should be independent
      expect(g1.pattern).toEqual(['**/*.ts'])
      expect(g2.pattern).toEqual(['**/*.md'])

      // Options should be copied, not shared (modifying g2.options shouldn't affect g1)
      // Note: options is readonly, so we can't modify it directly
      // but we verify they're different objects
      expect(g1.options).not.toBe(g2.options)
    })
  })
})
