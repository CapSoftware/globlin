/**
 * Option-related compatibility tests
 * Ported from:
 *   - vendor/glob/test/absolute-must-be-strings.ts
 *   - vendor/glob/test/platform.ts
 *   - vendor/glob/test/nocase-magic-only.ts
 *
 * These tests verify proper option handling, validation, and platform behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { glob as globOriginal, globSync as globSyncOriginal, Glob as GlobOriginal } from 'glob'
import { createTestFixture, cleanupFixture, loadGloblin } from '../harness'
import type { GloblinModule } from '../harness'

// Note: On case-insensitive filesystems (macOS, Windows), files with different
// case names are the same file. The nocase option affects PATTERN matching,
// not file creation. We use files with mixed case in names to test the option.
const OPTIONS_FIXTURE = {
  files: ['file_lower.txt', 'FILE_UPPER.js', 'MixedCase.md', 'dir/nested.txt'],
  dirs: ['dir'],
}

describe('option validation', () => {
  let fixturePath: string
  let globlin: GloblinModule

  beforeAll(async () => {
    fixturePath = await createTestFixture('options', OPTIONS_FIXTURE)
    globlin = await loadGloblin()
  })

  afterAll(async () => {
    await cleanupFixture(fixturePath)
  })

  describe('absolute + withFileTypes conflict (absolute-must-be-strings.ts)', () => {
    it('Glob class throws when both withFileTypes and absolute are set', () => {
      // Test with glob package
      expect(() => {
        new GlobOriginal('.', {
          withFileTypes: true,
          absolute: true,
        })
      }).toThrow()

      // Test with globlin
      expect(() => {
        new globlin.Glob('.', {
          cwd: fixturePath,
          withFileTypes: true,
          absolute: true,
        })
      }).toThrow()
    })

    it('globSync throws when both withFileTypes and absolute are set', () => {
      expect(() => {
        globSyncOriginal('.', {
          withFileTypes: true,
          absolute: true,
        })
      }).toThrow()

      expect(() => {
        globlin.globSync('.', {
          cwd: fixturePath,
          withFileTypes: true,
          absolute: true,
        })
      }).toThrow()
    })

    it('glob async throws when both withFileTypes and absolute are set', async () => {
      await expect(
        globOriginal('.', {
          withFileTypes: true,
          absolute: true,
        })
      ).rejects.toThrow()

      await expect(
        globlin.glob('.', {
          cwd: fixturePath,
          withFileTypes: true,
          absolute: true,
        })
      ).rejects.toThrow()
    })

    it('error message mentions "cannot set absolute and withFileTypes"', () => {
      let globError: Error | undefined
      let globlinError: Error | undefined

      try {
        new GlobOriginal('.', { withFileTypes: true, absolute: true })
      } catch (e) {
        globError = e as Error
      }

      try {
        new globlin.Glob('.', { cwd: fixturePath, withFileTypes: true, absolute: true })
      } catch (e) {
        globlinError = e as Error
      }

      expect(globError).toBeDefined()
      expect(globlinError).toBeDefined()
      expect(globError!.message.toLowerCase()).toContain('absolute')
      expect(globlinError!.message.toLowerCase()).toContain('absolute')
    })
  })

  describe('platform option (platform.ts)', () => {
    it('accepts platform: darwin option', async () => {
      const result = await globlin.glob('*.txt', {
        cwd: fixturePath,
        platform: 'darwin',
      })
      // Darwin (macOS) is case-insensitive by default, so should match both cases
      // Note: This depends on the actual filesystem behavior
      expect(result.length).toBeGreaterThan(0)
    })

    it('accepts platform: linux option', async () => {
      const result = await globlin.glob('*.txt', {
        cwd: fixturePath,
        platform: 'linux',
      })
      expect(result.length).toBeGreaterThan(0)
    })

    it('accepts platform: win32 option', async () => {
      const result = await globlin.glob('*.txt', {
        cwd: fixturePath,
        platform: 'win32',
      })
      expect(result.length).toBeGreaterThan(0)
    })

    it('Glob class accepts platform option', () => {
      const gDarwin = new globlin.Glob('*.txt', { cwd: fixturePath, platform: 'darwin' })
      const gLinux = new globlin.Glob('*.txt', { cwd: fixturePath, platform: 'linux' })
      const gWin32 = new globlin.Glob('*.txt', { cwd: fixturePath, platform: 'win32' })

      expect(gDarwin.options.platform).toBe('darwin')
      expect(gLinux.options.platform).toBe('linux')
      expect(gWin32.options.platform).toBe('win32')
    })

    it('sync functions accept platform option', () => {
      const resultDarwin = globlin.globSync('*.txt', { cwd: fixturePath, platform: 'darwin' })
      const resultLinux = globlin.globSync('*.txt', { cwd: fixturePath, platform: 'linux' })

      expect(resultDarwin.length).toBeGreaterThan(0)
      expect(resultLinux.length).toBeGreaterThan(0)
    })
  })

  describe('nocase option', () => {
    // The nocase option affects PATTERN matching, not file creation.
    // On case-insensitive filesystems, files with different case are the same.
    // These tests verify the pattern matching behavior.

    it('nocase: true matches pattern with different case', async () => {
      // Pattern *.TXT should match file_lower.txt when nocase: true
      const result = await globlin.glob('*.TXT', {
        cwd: fixturePath,
        nocase: true,
      })

      // Should match file_lower.txt even though pattern uses .TXT
      expect(result).toContain('file_lower.txt')
    })

    it('nocase: false only matches exact case pattern', async () => {
      // Pattern *.TXT should NOT match file_lower.txt when nocase: false
      const result = await globlin.glob('*.TXT', {
        cwd: fixturePath,
        nocase: false,
      })

      // Should NOT match file_lower.txt (case mismatch)
      expect(result).not.toContain('file_lower.txt')
    })

    it('nocase: true matches uppercase pattern against lowercase file', async () => {
      const result = await globlin.glob('FILE_LOWER.TXT', {
        cwd: fixturePath,
        nocase: true,
      })

      // With nocase: true, FILE_LOWER.TXT should match file_lower.txt
      // The result uses the pattern's case for literal matches
      expect(result.length).toBe(1)
      expect(result[0].toLowerCase()).toBe('file_lower.txt')
    })

    it('nocase: false misses due to case mismatch', async () => {
      const result = await globlin.glob('FILE_LOWER.TXT', {
        cwd: fixturePath,
        nocase: false,
      })

      // With nocase: false, FILE_LOWER.TXT should NOT match file_lower.txt
      expect(result).not.toContain('file_lower.txt')
    })

    it('glob and globlin match on nocase: true (sync)', () => {
      const globResult = globSyncOriginal('*.TXT', { cwd: fixturePath, nocase: true })
      const globlinResult = globlin.globSync('*.TXT', { cwd: fixturePath, nocase: true })

      expect(new Set(globlinResult)).toEqual(new Set(globResult))
    })

    it('glob and globlin match on nocase: false (sync)', () => {
      const globResult = globSyncOriginal('*.TXT', { cwd: fixturePath, nocase: false })
      const globlinResult = globlin.globSync('*.TXT', { cwd: fixturePath, nocase: false })

      expect(new Set(globlinResult)).toEqual(new Set(globResult))
    })
  })

  describe('platform-based nocase defaults', () => {
    // Note: These tests verify that the platform option affects nocase defaults
    // Darwin and Win32 default to nocase: true, Linux defaults to nocase: false

    it('platform: darwin implies nocase: true by default', async () => {
      // Use uppercase pattern to test nocase matching
      const result = await globlin.glob('*.TXT', {
        cwd: fixturePath,
        platform: 'darwin',
        // nocase not specified, should default to true for darwin
      })

      // On darwin (nocase defaults to true), *.TXT should match file_lower.txt
      expect(result).toContain('file_lower.txt')
    })

    it('platform: linux implies nocase: false by default', async () => {
      // Use uppercase pattern to test nocase matching
      const result = await globlin.glob('*.TXT', {
        cwd: fixturePath,
        platform: 'linux',
        // nocase not specified, should default to false for linux
      })

      // On linux (nocase defaults to false), *.TXT should NOT match file_lower.txt
      expect(result).not.toContain('file_lower.txt')
    })

    it('platform: win32 implies nocase: true by default', async () => {
      // Use uppercase pattern to test nocase matching
      const result = await globlin.glob('*.TXT', {
        cwd: fixturePath,
        platform: 'win32',
        // nocase not specified, should default to true for win32
      })

      // On win32 (nocase defaults to true), *.TXT should match file_lower.txt
      expect(result).toContain('file_lower.txt')
    })

    it('explicit nocase overrides platform default', async () => {
      // On darwin (which defaults to nocase: true), explicitly set nocase: false
      const result = await globlin.glob('*.TXT', {
        cwd: fixturePath,
        platform: 'darwin',
        nocase: false,
      })

      // Should NOT match file_lower.txt due to explicit nocase: false
      expect(result).not.toContain('file_lower.txt')
    })
  })

  describe('windowsPathsNoEscape option', () => {
    it('accepts windowsPathsNoEscape: true', async () => {
      const result = await globlin.glob('*.txt', {
        cwd: fixturePath,
        windowsPathsNoEscape: true,
      })
      expect(result.length).toBeGreaterThan(0)
    })

    it('accepts windowsPathsNoEscape: false', async () => {
      const result = await globlin.glob('*.txt', {
        cwd: fixturePath,
        windowsPathsNoEscape: false,
      })
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('multiple options combinations', () => {
    it('nocase + dot options work together', async () => {
      // Create a new fixture with dotfiles for this test
      // Note: On case-insensitive filesystems, .Hidden and .hidden are the same file
      const dotFixturePath = await createTestFixture('options-dot', {
        files: ['.hidden', 'visible.txt'],
        dirs: [],
      })

      try {
        // With nocase: true and dot: true, *.TXT should match visible.txt and include dotfiles
        const result = await globlin.glob('*.TXT', {
          cwd: dotFixturePath,
          dot: true,
          nocase: true,
        })

        // Should find visible.txt (case-insensitive match)
        expect(result).toContain('visible.txt')
      } finally {
        await cleanupFixture(dotFixturePath)
      }
    })

    it('nocase + matchBase options work together', async () => {
      // Use uppercase pattern with matchBase to match nested file
      const result = await globlin.glob('NESTED.TXT', {
        cwd: fixturePath,
        nocase: true,
        matchBase: true,
        posix: true,
      })

      // Should find dir/nested.txt (case-insensitive matchBase)
      expect(result).toContain('dir/nested.txt')
    })

    it('nocase + absolute options work together', async () => {
      // Use uppercase pattern with absolute paths
      const result = await globlin.glob('*.TXT', {
        cwd: fixturePath,
        nocase: true,
        absolute: true,
      })

      // All results should be absolute paths (/ on unix, drive letter on Windows)
      const isAbsolute = await import('path').then(p => p.isAbsolute)
      for (const r of result) {
        expect(isAbsolute(r)).toBe(true)
      }

      // Should find file_lower.txt (case-insensitive match)
      const hasLowercase = result.some(f => f.endsWith('file_lower.txt'))
      expect(hasLowercase).toBe(true)
    })
  })
})
