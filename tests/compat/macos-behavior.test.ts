/**
 * macOS-specific behavior tests
 *
 * Tests that verify correct behavior on macOS:
 * - Case-insensitive filesystem behavior
 * - Platform detection defaults
 * - Nocase option defaults
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { globSync as globSyncOriginal, glob as globOriginal } from 'glob'
import * as globlin from '../../js/index.js'
import { createTestFixture, cleanupFixture } from '../harness.js'

describe('macOS behavior', () => {
  let fixturePath: string
  const isMacOS = process.platform === 'darwin'

  beforeAll(async () => {
    // Create a fixture with files for testing
    fixturePath = await createTestFixture('macos-behavior', {
      files: ['file.txt', 'src/index.ts', 'README.md'],
    })
  })

  afterAll(async () => {
    await cleanupFixture(fixturePath)
  })

  describe('platform detection', () => {
    it('detects darwin platform correctly', () => {
      expect(process.platform).toBeDefined()
      if (isMacOS) {
        expect(process.platform).toBe('darwin')
      }
    })

    it('accepts platform: darwin option', async () => {
      const result = await globlin.glob('*.txt', {
        cwd: fixturePath,
        platform: 'darwin',
      })
      expect(result).toContain('file.txt')
    })
  })

  describe('case-insensitive defaults on macOS', () => {
    it.runIf(isMacOS)('macOS defaults to case-insensitive matching', async () => {
      // On macOS, *.TXT should match file.txt by default (nocase=true)
      const result = await globlin.glob('*.TXT', { cwd: fixturePath })
      expect(result).toContain('file.txt')
    })

    it.runIf(isMacOS)('matches glob behavior for case-insensitive default', async () => {
      const globResult = await globOriginal('*.TXT', { cwd: fixturePath })
      const globlinResult = await globlin.glob('*.TXT', { cwd: fixturePath })
      expect(new Set(globlinResult)).toEqual(new Set(globResult))
    })

    it('platform: darwin implies case-insensitive matching', async () => {
      // Explicitly set platform: darwin - should be case-insensitive
      const result = await globlin.glob('*.TXT', {
        cwd: fixturePath,
        platform: 'darwin',
      })
      expect(result).toContain('file.txt')
    })

    it('platform: linux implies case-sensitive matching', async () => {
      // Explicitly set platform: linux - should be case-sensitive
      const result = await globlin.glob('*.TXT', {
        cwd: fixturePath,
        platform: 'linux',
      })
      // *.TXT should NOT match file.txt on linux (case-sensitive)
      expect(result).not.toContain('file.txt')
    })

    it('explicit nocase: false overrides platform default', async () => {
      // Even on darwin platform, explicit nocase: false should be case-sensitive
      const result = await globlin.glob('*.TXT', {
        cwd: fixturePath,
        platform: 'darwin',
        nocase: false,
      })
      expect(result).not.toContain('file.txt')
    })
  })

  describe('recursive patterns with case-insensitivity', () => {
    it.runIf(isMacOS)('recursive patterns respect case-insensitive default', async () => {
      const result = await globlin.glob('**/*.TS', { cwd: fixturePath })
      expect(result).toContain('src/index.ts')
    })

    it('recursive patterns with explicit nocase: true', async () => {
      const result = await globlin.glob('**/*.TS', {
        cwd: fixturePath,
        nocase: true,
        posix: true,
      })
      expect(result).toContain('src/index.ts')
    })

    it('recursive patterns with explicit nocase: false', async () => {
      const result = await globlin.glob('**/*.TS', {
        cwd: fixturePath,
        nocase: false,
      })
      expect(result).not.toContain('src/index.ts')
    })
  })

  describe('path segment case-insensitivity', () => {
    it.runIf(isMacOS)('path segments are case-insensitive on macOS', async () => {
      // SRC should match src/ on macOS - result uses pattern case for literal segments
      const result = await globlin.glob('SRC/*.ts', { cwd: fixturePath })
      // The result uses the pattern's case (SRC) not the filesystem's (src)
      expect(result.some(r => r.toLowerCase() === 'src/index.ts')).toBe(true)
    })

    it('path segments with explicit nocase: true', async () => {
      const result = await globlin.glob('SRC/*.ts', {
        cwd: fixturePath,
        nocase: true,
        posix: true,
      })
      // The result uses the pattern's case (SRC) not the filesystem's (src)
      expect(result.some(r => r.toLowerCase() === 'src/index.ts')).toBe(true)
    })

    it('path segments with explicit nocase: false on case-insensitive fs', async () => {
      const result = await globlin.glob('SRC/*.ts', {
        cwd: fixturePath,
        nocase: false,
        posix: true,
      })
      // On macOS (case-insensitive FS), SRC still matches src at the filesystem level
      // The nocase option controls pattern matching, not filesystem behavior
      // So even with nocase: false, the file is found because the FS resolves SRC -> src
      if (isMacOS) {
        // On macOS, expect to find the file (FS is case-insensitive)
        expect(result.some(r => r.toLowerCase() === 'src/index.ts')).toBe(true)
      } else {
        // On case-sensitive FS (Linux), expect no match
        expect(result.length).toBe(0)
      }
    })
  })

  describe('glob compatibility on macOS', () => {
    it.runIf(isMacOS)('matches glob results for simple patterns', async () => {
      const globResult = await globOriginal('*.txt', { cwd: fixturePath })
      const globlinResult = await globlin.glob('*.txt', { cwd: fixturePath })
      expect(new Set(globlinResult)).toEqual(new Set(globResult))
    })

    it.runIf(isMacOS)('matches glob results for recursive patterns', async () => {
      const globResult = await globOriginal('**/*.ts', { cwd: fixturePath })
      const globlinResult = await globlin.glob('**/*.ts', { cwd: fixturePath })
      expect(new Set(globlinResult)).toEqual(new Set(globResult))
    })

    it.runIf(isMacOS)('matches glob results for case-mixed patterns', async () => {
      const globResult = await globOriginal('**/*.MD', { cwd: fixturePath })
      const globlinResult = await globlin.glob('**/*.MD', { cwd: fixturePath })
      expect(new Set(globlinResult)).toEqual(new Set(globResult))
    })
  })

  describe('sync and async consistency', () => {
    it('sync and async produce same results on macOS', async () => {
      const asyncResult = (await globlin.glob('**/*', { cwd: fixturePath })).sort()
      const syncResult = globlin.globSync('**/*', { cwd: fixturePath }).sort()
      expect(asyncResult).toEqual(syncResult)
    })

    it('sync and async produce same results with nocase option', async () => {
      const asyncResult = (
        await globlin.glob('**/*.TXT', {
          cwd: fixturePath,
          nocase: true,
        })
      ).sort()
      const syncResult = globlin
        .globSync('**/*.TXT', {
          cwd: fixturePath,
          nocase: true,
        })
        .sort()
      expect(asyncResult).toEqual(syncResult)
    })
  })
})
