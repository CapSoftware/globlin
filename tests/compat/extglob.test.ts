/**
 * Extglob pattern tests
 * Tests for extglob syntax: +(pattern), *(pattern), ?(pattern), @(pattern), !(pattern)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestFixture, cleanupFixture, loadGloblin } from '../harness.js'

describe('Extglob Patterns', () => {
  let fixture: string
  let globlin: Awaited<ReturnType<typeof loadGloblin>> | null = null

  beforeAll(async () => {
    globlin = await loadGloblin()
    
    // Create a fixture with specific files for extglob testing
    fixture = await createTestFixture('extglob', {
      files: [
        'a.txt',
        'b.txt',
        'c.txt',
        'ab.txt',
        'abc.txt',
        'aaa.txt',
        'foo.js',
        'bar.js',
        'baz.js',
        'qux.ts',
        'src/lib/helper.js',
        'src/utils/tool.js',
        'src/other/file.js',
        'lib/core.js',
        'utils/extra.js',
        'symlink/deep/file.js',
      ],
    })
  })

  afterAll(async () => {
    await cleanupFixture(fixture)
  })

  describe('+(pattern) - one or more', () => {
    it('should match one occurrence', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = await globlin.glob('+(foo|bar).js', { cwd: fixture })
      expect(results.sort()).toEqual(['bar.js', 'foo.js'])
    })

    it('should not match zero occurrences', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = await globlin.glob('+(z).txt', { cwd: fixture })
      expect(results).toEqual([])
    })
  })

  describe('*(pattern) - zero or more', () => {
    it('should match zero occurrences', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = await globlin.glob('*(x)a.txt', { cwd: fixture })
      expect(results).toContain('a.txt')
    })

    it('should match multiple occurrences', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = await globlin.glob('*(a).txt', { cwd: fixture })
      expect(results).toContain('a.txt')
      expect(results).toContain('aaa.txt')
    })
  })

  describe('?(pattern) - zero or one', () => {
    it('should match zero occurrences', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = await globlin.glob('?(x)a.txt', { cwd: fixture })
      expect(results).toContain('a.txt')
    })

    it('should match one occurrence', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = await globlin.glob('?(a|b).txt', { cwd: fixture })
      expect(results.sort()).toEqual(['a.txt', 'b.txt'])
    })
  })

  describe('@(pattern) - exactly one', () => {
    it('should match exactly one alternative', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = await globlin.glob('@(foo|bar|baz).js', { cwd: fixture })
      expect(results.sort()).toEqual(['bar.js', 'baz.js', 'foo.js'])
    })

    it('should not match if no alternative matches', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = await globlin.glob('@(xyz).js', { cwd: fixture })
      expect(results).toEqual([])
    })
  })

  describe('!(pattern) - negation', () => {
    it('should match files that do not match the pattern', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      // !(foo|bar) matches any single path segment that is not exactly 'foo' or 'bar'
      // So 'foo.js' matches because the path segment 'foo.js' is not 'foo' or 'bar'
      const results = await globlin.glob('!(foo|bar)', { cwd: fixture })
      // Should match things that aren't exactly 'foo' or 'bar'
      expect(results).toContain('baz.js')
      expect(results).toContain('c.txt')
      expect(results).toContain('foo.js') // foo.js !== 'foo'
      expect(results).toContain('bar.js') // bar.js !== 'bar'
    })

    it('should exclude exact matches in paths', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      // src/!(lib)/*.js should NOT match src/lib/*.js
      const results = await globlin.glob('src/!(lib)/*.js', { cwd: fixture })
      expect(results).toContain('src/utils/tool.js')
      expect(results).toContain('src/other/file.js')
      expect(results).not.toContain('src/lib/helper.js')
    })
  })

  describe('Extglob with paths', () => {
    it('should work with directory patterns', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = await globlin.glob('src/+(lib|utils)/*.js', { cwd: fixture })
      expect(results.sort()).toEqual([
        'src/lib/helper.js',
        'src/utils/tool.js',
      ])
    })

    it('should work with negation in paths', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = await globlin.glob('src/!(symlink)/*.js', { cwd: fixture })
      expect(results).toContain('src/lib/helper.js')
      expect(results).toContain('src/utils/tool.js')
      expect(results).toContain('src/other/file.js')
    })
  })

  describe('noext option', () => {
    it('should treat extglob as literal when noext is true', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      // With noext, +(a|b) should be treated literally
      const results = await globlin.glob('+(a|b).txt', { cwd: fixture, noext: true })
      // Should not match any files since the literal pattern doesn't exist
      expect(results).toEqual([])
    })
  })
})
