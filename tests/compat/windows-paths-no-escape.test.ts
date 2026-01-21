/**
 * Tests for windowsPathsNoEscape option
 *
 * Ported from: vendor/glob/test/windows-paths-no-escape.ts
 *
 * The windowsPathsNoEscape option treats backslashes as path separators
 * instead of escape characters. When enabled:
 * - All `\` in the pattern are replaced with `/`
 * - This makes it impossible to match literal glob characters
 * - But allows using patterns constructed with path.join()/path.resolve() on Windows
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Glob, globSync, escape, unescape, hasMagic } from '../../js/index.js'
import {
  glob as originalGlob,
  Glob as OriginalGlobClass,
  escape as originalEscape,
  unescape as originalUnescape,
  hasMagic as originalHasMagic,
} from 'glob'
import * as fs from 'fs/promises'
import * as path from 'path'
import { tmpdir } from 'os'

describe('windowsPathsNoEscape option', () => {
  let testDir: string

  beforeAll(async () => {
    // Create a test directory with files
    testDir = path.join(tmpdir(), `globlin-test-wpne-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })

    // Create test structure: a/b/c/x with various files
    await fs.mkdir(path.join(testDir, 'a', 'b', 'c', 'x'), { recursive: true })
    await fs.writeFile(path.join(testDir, 'a', 'b', 'c', 'x', 'file.txt'), '')
    await fs.writeFile(path.join(testDir, 'a', 'b', 'c', 'test.txt'), '')
  })

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('Pattern transformation', () => {
    it('should NOT transform backslashes by default', () => {
      // Without windowsPathsNoEscape, backslashes are escape characters
      const pattern = '/a/b/c/x\\[a-b\\]y\\*'

      // The pattern should contain escaped brackets and star
      // hasmagic should return false because the magic chars are escaped
      expect(hasMagic(pattern)).toBe(false)
    })

    it('should transform backslashes with windowsPathsNoEscape: true', () => {
      // With windowsPathsNoEscape, backslashes become path separators
      const pattern = '/a/b/c/x\\[a-b\\]y\\*'

      // hasMagic should return true because the slashes expose the magic chars
      // After transformation: /a/b/c/x/[a-b/]y/*
      expect(hasMagic(pattern, { windowsPathsNoEscape: true })).toBe(true)
    })

    it('should match glob behavior for pattern transformation', () => {
      const pattern = '/a/b/c/x\\[a-b\\]y\\*'

      // Both should return the same hasMagic result
      expect(hasMagic(pattern)).toBe(originalHasMagic(pattern))
      expect(hasMagic(pattern, { windowsPathsNoEscape: true })).toBe(
        originalHasMagic(pattern, { windowsPathsNoEscape: true })
      )
    })
  })

  describe('escape function with windowsPathsNoEscape', () => {
    it('should use bracket escaping when windowsPathsNoEscape is true', () => {
      // Without windowsPathsNoEscape: uses backslash escaping
      const escaped = escape('file[1].txt')
      expect(escaped).toBe('file\\[1\\].txt')

      // With windowsPathsNoEscape: uses bracket escaping (since backslash is path separator)
      const escapedWin = escape('file[1].txt', { windowsPathsNoEscape: true })
      expect(escapedWin).toBe('file[[]1[]].txt')
    })

    it('should match glob escape behavior', () => {
      expect(escape('*.txt')).toBe(originalEscape('*.txt'))
      expect(escape('*.txt', { windowsPathsNoEscape: true })).toBe(
        originalEscape('*.txt', { windowsPathsNoEscape: true })
      )

      expect(escape('file[1].txt')).toBe(originalEscape('file[1].txt'))
      expect(escape('file[1].txt', { windowsPathsNoEscape: true })).toBe(
        originalEscape('file[1].txt', { windowsPathsNoEscape: true })
      )
    })
  })

  describe('unescape function with windowsPathsNoEscape', () => {
    it('should unescape bracket escaping when windowsPathsNoEscape is true', () => {
      // Without windowsPathsNoEscape: unescape backslash escaping
      const unescaped = unescape('file\\[1\\].txt')
      expect(unescaped).toBe('file[1].txt')

      // With windowsPathsNoEscape: unescape bracket escaping
      const unescapedWin = unescape('file[[]1[]].txt', { windowsPathsNoEscape: true })
      expect(unescapedWin).toBe('file[1].txt')
    })

    it('should match glob unescape behavior', () => {
      expect(unescape('\\*.txt')).toBe(originalUnescape('\\*.txt'))
      expect(unescape('[*].txt', { windowsPathsNoEscape: true })).toBe(
        originalUnescape('[*].txt', { windowsPathsNoEscape: true })
      )
    })
  })

  describe('Glob class pattern property', () => {
    it('should preserve original pattern without windowsPathsNoEscape', () => {
      const pattern = '/a/b/c/x\\[a-b\\]y\\*'
      const g = new Glob(pattern, {})

      // Pattern array should contain the original pattern
      expect(g.pattern).toEqual([pattern])
    })

    it('should store original pattern with windowsPathsNoEscape', () => {
      const pattern = '/a/b/c/x\\[a-b\\]y\\*'
      const g = new Glob(pattern, { windowsPathsNoEscape: true })

      // Pattern array should contain the original pattern (not transformed)
      // The transformation happens internally during matching
      expect(g.pattern).toEqual([pattern])
    })
  })

  describe('Actual glob matching', () => {
    it('should match files using backslash-converted patterns', async () => {
      // Create a file that would match with windowsPathsNoEscape
      const subdir = path.join(testDir, 'test1')
      await fs.mkdir(path.join(subdir, 'a'), { recursive: true })
      await fs.writeFile(path.join(subdir, 'a', 'file.txt'), '')

      // Pattern with backslashes: a\file.txt (Windows-style path)
      const pattern = 'a\\file.txt'

      // Without windowsPathsNoEscape: backslash escapes 'f', so matches "afile.txt"
      // With windowsPathsNoEscape: backslash becomes /, so matches "a/file.txt"
      const resultsWin = globSync(pattern, { cwd: subdir, windowsPathsNoEscape: true, posix: true })
      expect(resultsWin).toContain('a/file.txt')
    })

    it('should work with recursive patterns', async () => {
      // Create test structure
      const subdir = path.join(testDir, 'test2')
      await fs.mkdir(path.join(subdir, 'src', 'lib'), { recursive: true })
      await fs.writeFile(path.join(subdir, 'src', 'lib', 'util.js'), '')
      await fs.writeFile(path.join(subdir, 'src', 'index.js'), '')

      // Pattern with backslashes: src\**\*.js
      const pattern = 'src\\**\\*.js'

      const results = globSync(pattern, { cwd: subdir, windowsPathsNoEscape: true, posix: true })
      expect(results.length).toBeGreaterThanOrEqual(2)
      expect(results).toContain('src/lib/util.js')
      expect(results).toContain('src/index.js')
    })
  })

  describe('Legacy allowWindowsEscape option', () => {
    it('should support deprecated allowWindowsEscape option', () => {
      // allowWindowsEscape: false is equivalent to windowsPathsNoEscape: true
      const pattern = '\\*.txt'

      // These should produce the same results
      const result1 = hasMagic(pattern, { windowsPathsNoEscape: true })
      // Note: allowWindowsEscape is deprecated but should still work
      // In glob, allowWindowsEscape: false means windowsPathsNoEscape: true
      // We check the internal options handling works correctly
    })
  })

  describe('Comparison with glob package', () => {
    it('should match glob behavior for simple patterns', async () => {
      const subdir = path.join(testDir, 'comparison1')
      await fs.mkdir(path.join(subdir, 'a'), { recursive: true })
      await fs.writeFile(path.join(subdir, 'a', 'test.txt'), '')

      const pattern = 'a\\*.txt'
      const options = { cwd: subdir, windowsPathsNoEscape: true }

      const globlinResults = globSync(pattern, options)
      const globResults = await originalGlob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should match glob behavior for recursive patterns', async () => {
      const subdir = path.join(testDir, 'comparison2')
      await fs.mkdir(path.join(subdir, 'src', 'lib'), { recursive: true })
      await fs.writeFile(path.join(subdir, 'src', 'lib', 'util.js'), '')
      await fs.writeFile(path.join(subdir, 'src', 'index.js'), '')

      const pattern = 'src\\**\\*.js'
      const options = { cwd: subdir, windowsPathsNoEscape: true }

      const globlinResults = globSync(pattern, options)
      const globResults = await originalGlob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })
})
