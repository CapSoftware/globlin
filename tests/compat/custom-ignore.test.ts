/**
 * Tests for custom ignore object support
 *
 * Tests the IgnoreLike interface which allows passing objects with
 * ignored() and/or childrenIgnored() methods for custom filtering.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { basename, isAbsolute } from 'path'
import { glob as globOriginal, globSync as globSyncOriginal, type IgnoreLike } from 'glob'
import { glob, globSync, IgnorePattern, Path } from '../../js/index.js'
import { createTestFixture, cleanupFixture, FixtureConfig } from '../harness.js'

describe('custom ignore objects', () => {
  let fixture: string

  const fixtureConfig: FixtureConfig = {
    files: [
      'a',
      'b',
      'c',
      'd',
      'ab',
      'bc',
      'abc',
      'abcdef/index.js',
      'abcdef/test.js',
      'abcdef/nested/deep.js',
      'symlink', // Simple file to test name filtering
      'other/file.txt',
      'other/data.json',
      'longname.test.ts',
      'x.ts',
    ],
  }

  beforeAll(async () => {
    fixture = await createTestFixture('custom-ignore', fixtureConfig)
  })

  afterAll(async () => {
    await cleanupFixture(fixture)
  })

  describe('ignored() method', () => {
    it('should ignore files with long names (sync)', () => {
      const ignore: IgnorePattern = {
        ignored: (p: Path) => p.name.length > 1,
      }

      const results = globSync('**', { cwd: fixture, ignore })

      // Should only include single-character names
      for (const r of results) {
        const name = basename(r)
        // Skip . (current dir) which is 1 char
        if (name !== '.') {
          expect(name.length).toBe(1)
        }
      }

      // Should include single-char files: a, b, c, d
      expect(results).toContain('a')
      expect(results).toContain('b')
      expect(results).toContain('c')
      expect(results).toContain('d')

      // Should NOT include longer names
      expect(results).not.toContain('ab')
      expect(results).not.toContain('abc')
      expect(results).not.toContain('abcdef')
    })

    it('should ignore files with long names (async)', async () => {
      const ignore: IgnorePattern = {
        ignored: (p: Path) => p.name.length > 1,
      }

      const results = await glob('**', { cwd: fixture, ignore })

      // Should only include single-character names
      for (const r of results) {
        const name = basename(r)
        if (name !== '.') {
          expect(name.length).toBe(1)
        }
      }
    })

    it('should ignore specific file extensions', () => {
      const ignore: IgnorePattern = {
        ignored: (p: Path) => p.name.endsWith('.ts'),
      }

      const results = globSync('**/*', { cwd: fixture, ignore, nodir: true })

      // Should NOT include .ts files
      expect(results.some(r => r.endsWith('.ts'))).toBe(false)

      // Should include other files
      expect(results.some(r => r.endsWith('.js'))).toBe(true)
      expect(results.some(r => r.endsWith('.txt'))).toBe(true)
    })

    it('should work with isDirectory() method on Path', () => {
      const ignore: IgnorePattern = {
        ignored: (p: Path) => {
          // Need to lstat to check type
          p.lstatSync()
          return p.isDirectory() === true
        },
      }

      const results = globSync('**', { cwd: fixture, ignore })

      // Should NOT include directories
      expect(results).not.toContain('abcdef')
      expect(results).not.toContain('other')

      // Should include files
      expect(results).toContain('a')
      expect(results).toContain('b')
    })
  })

  describe('childrenIgnored() method', () => {
    it('should skip directory contents (sync)', () => {
      const ignore: IgnorePattern = {
        childrenIgnored: (p: Path) => {
          return p.name === 'abcdef'
        },
      }

      const results = globSync('**', { cwd: fixture, ignore, nodir: true })
      // Normalize paths for cross-platform comparison
      const normalized = results.map(r => r.replace(/\\/g, '/'))

      // Should NOT include files under abcdef/
      expect(normalized.some(r => r.startsWith('abcdef/'))).toBe(false)

      // Should include files in other directories
      expect(normalized.some(r => r.startsWith('other/'))).toBe(true)
    })

    it('should skip directory contents (async)', async () => {
      const ignore: IgnorePattern = {
        childrenIgnored: (p: Path) => {
          return p.name === 'abcdef'
        },
      }

      const results = await glob('**', { cwd: fixture, ignore, nodir: true })
      // Normalize paths for cross-platform comparison
      const normalized = results.map(r => r.replace(/\\/g, '/'))

      // Should NOT include files under abcdef/
      expect(normalized.some(r => r.startsWith('abcdef/'))).toBe(false)
    })

    it('should ignore symlink and abcdef directories', () => {
      const ignore: IgnorePattern = {
        childrenIgnored: (p: Path) => {
          return p.name === 'symlink' || p.name === 'abcdef'
        },
      }

      const results = globSync('**', { cwd: fixture, ignore, nodir: true })
      // Normalize paths for cross-platform comparison
      const normalized = results.map(r => r.replace(/\\/g, '/'))

      // Results should not contain paths under ignored directories
      for (const r of normalized) {
        expect(r).not.toMatch(/\bsymlink\//)
        expect(r).not.toMatch(/\babcdef\//)
      }
    })

    it('should allow parent directory but skip children', () => {
      const ignore: IgnorePattern = {
        childrenIgnored: (p: Path) => p.name === 'other',
      }

      const results = globSync('**', { cwd: fixture, ignore })
      // Normalize paths for cross-platform comparison
      const normalized = results.map(r => r.replace(/\\/g, '/'))

      // The 'other' directory itself should be included (unless nodir)
      expect(normalized).toContain('other')
      // But children should NOT be included
      expect(normalized.some(r => r.startsWith('other/'))).toBe(false)
    })
  })

  describe('combined ignored() and childrenIgnored()', () => {
    it('should handle both methods together', () => {
      const ignore: IgnorePattern = {
        // Skip single-char files
        ignored: (p: Path) => p.name.length === 1,
        // Skip abcdef directory contents
        childrenIgnored: (p: Path) => p.name === 'abcdef',
      }

      const results = globSync('**', { cwd: fixture, ignore, nodir: true })
      // Normalize paths for cross-platform comparison
      const normalized = results.map(r => r.replace(/\\/g, '/'))

      // Should NOT include single-char files
      expect(normalized).not.toContain('a')
      expect(normalized).not.toContain('b')

      // Should NOT include abcdef contents
      expect(normalized.some(r => r.startsWith('abcdef/'))).toBe(false)

      // Should include longer-named files in root and other/
      expect(normalized).toContain('ab')
      expect(normalized).toContain('symlink')
      expect(normalized.some(r => r.startsWith('other/'))).toBe(true)
    })
  })

  describe('comparison with glob package', () => {
    it('should match glob behavior for ignored() (sync)', () => {
      const ignore: IgnoreLike = {
        ignored: p => p.name.length > 1,
      }

      const globResults = globSyncOriginal('**', { cwd: fixture, ignore })
        .filter(p => basename(p).length === 1 && basename(p) !== '.')
        .sort()

      const globlinIgnore: IgnorePattern = {
        ignored: (p: Path) => p.name.length > 1,
      }
      const globlinResults = globSync('**', { cwd: fixture, ignore: globlinIgnore })
        .filter(p => basename(p).length === 1 && basename(p) !== '.')
        .sort()

      expect(globlinResults).toEqual(globResults)
    })

    it('should match glob behavior for ignored() (async)', async () => {
      const ignore: IgnoreLike = {
        ignored: p => p.name.length > 1,
      }

      const globResults = (await globOriginal('**', { cwd: fixture, ignore }))
        .filter(p => basename(p).length === 1 && basename(p) !== '.')
        .sort()

      const globlinIgnore: IgnorePattern = {
        ignored: (p: Path) => p.name.length > 1,
      }
      const globlinResults = (await glob('**', { cwd: fixture, ignore: globlinIgnore }))
        .filter(p => basename(p).length === 1 && basename(p) !== '.')
        .sort()

      expect(globlinResults).toEqual(globResults)
    })

    it('should match glob behavior for childrenIgnored() (sync)', () => {
      const ignore: IgnoreLike = {
        childrenIgnored: p => p.name === 'abcdef',
      }

      const globResults = globSyncOriginal('**', { cwd: fixture, ignore, nodir: true }).sort()

      const globlinIgnore: IgnorePattern = {
        childrenIgnored: (p: Path) => p.name === 'abcdef',
      }
      const globlinResults = globSync('**', {
        cwd: fixture,
        ignore: globlinIgnore,
        nodir: true,
      }).sort()

      expect(globlinResults).toEqual(globResults)
    })

    it('should match glob behavior for childrenIgnored() (async)', async () => {
      const ignore: IgnoreLike = {
        childrenIgnored: p => p.name === 'abcdef',
      }

      const globResults = (await globOriginal('**', { cwd: fixture, ignore, nodir: true })).sort()

      const globlinIgnore: IgnorePattern = {
        childrenIgnored: (p: Path) => p.name === 'abcdef',
      }
      const globlinResults = (
        await glob('**', { cwd: fixture, ignore: globlinIgnore, nodir: true })
      ).sort()

      expect(globlinResults).toEqual(globResults)
    })
  })

  describe('edge cases', () => {
    it('should handle empty ignore object', () => {
      const ignore: IgnorePattern = {}

      const results = globSync('*', { cwd: fixture, ignore })

      // Should return all results (no filtering)
      expect(results.length).toBeGreaterThan(0)
    })

    it('should handle ignore that returns true for everything', () => {
      const ignore: IgnorePattern = {
        ignored: () => true,
      }

      const results = globSync('*', { cwd: fixture, ignore })

      // Should return empty (everything ignored)
      expect(results).toEqual([])
    })

    it('should handle ignore that returns false for everything', () => {
      const ignore: IgnorePattern = {
        ignored: () => false,
      }

      const results = globSync('*', { cwd: fixture, ignore })

      // Should return all results (nothing ignored)
      expect(results.length).toBeGreaterThan(0)
    })

    it('should work with nodir option', () => {
      const ignore: IgnorePattern = {
        ignored: (p: Path) => p.name === 'a',
      }

      const results = globSync('**', { cwd: fixture, ignore, nodir: true })

      expect(results).not.toContain('a')
      expect(results).toContain('b')
    })

    it('should work with absolute option', () => {
      const ignore: IgnorePattern = {
        ignored: (p: Path) => p.name === 'a',
      }

      const results = globSync('*', { cwd: fixture, ignore, absolute: true })

      // Should not include 'a' file (check with both forward and back slashes for cross-platform)
      expect(results.some(r => r.endsWith('/a') || r.endsWith('\\a'))).toBe(false)

      // Paths should be absolute (use Node's isAbsolute for cross-platform check)
      expect(results.every(r => isAbsolute(r))).toBe(true)
    })

    it('should work with mark option', () => {
      const ignore: IgnorePattern = {
        ignored: (p: Path) => p.name === 'a',
      }

      const results = globSync('*', { cwd: fixture, ignore, mark: true, posix: true })

      // Directories should have trailing slash
      expect(results.some(r => r.endsWith('/'))).toBe(true)
    })

    it('should work with dot option', () => {
      const ignore: IgnorePattern = {
        ignored: (p: Path) => p.name.startsWith('.'),
      }

      const results = globSync('*', { cwd: fixture, ignore, dot: true })

      // Should not include dotfiles (if any exist)
      expect(results.every(r => !basename(r).startsWith('.'))).toBe(true)
    })
  })

  describe('withFileTypes option', () => {
    it('should work with withFileTypes: true (sync)', () => {
      const ignore: IgnorePattern = {
        ignored: (p: Path) => p.name.length > 1,
      }

      const results = globSync('**', { cwd: fixture, ignore, withFileTypes: true })

      // Results should be GloblinPath objects (with Path-like interface)
      expect(results.length).toBeGreaterThan(0)
      for (const r of results) {
        expect(typeof r).toBe('object')
        expect(typeof r.name).toBe('string')
        // Single-char names only
        if (r.name !== '.') {
          expect(r.name.length).toBe(1)
        }
      }
    })

    it('should work with withFileTypes: true (async)', async () => {
      const ignore: IgnorePattern = {
        ignored: (p: Path) => p.name.length > 1,
      }

      const results = await glob('**', { cwd: fixture, ignore, withFileTypes: true })

      // Results should be GloblinPath objects (with Path-like interface)
      expect(results.length).toBeGreaterThan(0)
      for (const r of results) {
        expect(typeof r).toBe('object')
        expect(typeof r.name).toBe('string')
        // Single-char names only
        if (r.name !== '.') {
          expect(r.name.length).toBe(1)
        }
      }
    })
  })
})
