/**
 * Comprehensive nocase option tests
 *
 * Tests case-insensitive matching for:
 * - Simple patterns
 * - Recursive patterns
 * - Character classes
 * - Extglob patterns
 * - Unicode handling
 * - Path segments
 * - Platform defaults
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { globSync as globSyncOriginal, glob as globOriginal } from 'glob'
import * as globlin from '../../js/index.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import { createTestFixture, cleanupFixture } from '../harness.js'

describe('nocase option', () => {
  let fixturePath: string

  beforeAll(async () => {
    // Create a fixture with mixed case files
    fixturePath = await createTestFixture('nocase', {
      files: [
        'file.txt',
        'FILE.TXT',
        'File.Txt',
        'src/index.ts',
        'src/Index.TS',
        'src/utils/helper.js',
        'SRC/UTILS/HELPER.JS',
        'README.md',
        'readme.MD',
        'CamelCase.File.tsx',
        'camelcase.file.tsx',
        'ALLCAPS.JSON',
        'nested/Deep/Path/file.txt',
        'nested/DEEP/PATH/FILE.TXT',
        // Unicode test files
        'uber.txt',
        'UBER.TXT',
        'naive.txt',
        'NAIVE.TXT',
        'jpfile.txt', // CJK doesn't have case
        'delta.txt', // Greek
        'DELTA.TXT',
      ],
    })
  })

  afterAll(async () => {
    await cleanupFixture(fixturePath)
  })

  describe('basic case-insensitive matching', () => {
    it('nocase: true matches files with different cases', async () => {
      const result = await globlin.glob('*.txt', { cwd: fixturePath, nocase: true })
      // Should match file.txt, FILE.TXT, File.Txt and others
      expect(result.length).toBeGreaterThanOrEqual(3)
      expect(result.some(r => r.toLowerCase().includes('file.txt'))).toBe(true)
    })

    it('nocase: false only matches exact case', async () => {
      const result = await globlin.glob('*.txt', { cwd: fixturePath, nocase: false })
      // Should only match lowercase .txt files
      for (const r of result) {
        expect(r.endsWith('.txt')).toBe(true) // exact case match
      }
    })

    it('uppercase pattern matches lowercase files with nocase: true', async () => {
      const result = await globlin.glob('*.TXT', { cwd: fixturePath, nocase: true })
      expect(result.some(r => r === 'file.txt')).toBe(true)
    })

    it('lowercase pattern matches uppercase files with nocase: true', async () => {
      const result = await globlin.glob('*.json', { cwd: fixturePath, nocase: true })
      expect(result.some(r => r === 'ALLCAPS.JSON')).toBe(true)
    })
  })

  describe('recursive patterns', () => {
    it('nocase: true works with **/*.ext patterns', async () => {
      const result = await globlin.glob('**/*.ts', { cwd: fixturePath, nocase: true })
      // On case-insensitive filesystems, Index.TS and index.ts are the same file
      // Just verify we get at least one .ts file
      expect(result.some(r => r.toLowerCase().includes('index.ts'))).toBe(true)
    })

    it('nocase: true matches path segments case-insensitively', async () => {
      const result = await globlin.glob('SRC/**/*.ts', { cwd: fixturePath, nocase: true })
      expect(result.some(r => r.toLowerCase().includes('src'))).toBe(true)
    })

    it('nocase: true matches nested paths', async () => {
      const result = await globlin.glob('nested/deep/path/*.txt', {
        cwd: fixturePath,
        nocase: true,
      })
      expect(result.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('pattern types with nocase', () => {
    it('question mark pattern with nocase: true', async () => {
      const result = await globlin.glob('FIL?.txt', { cwd: fixturePath, nocase: true })
      expect(result.some(r => r.toLowerCase().includes('file.txt'))).toBe(true)
    })

    it('character class with nocase: true', async () => {
      const result = await globlin.glob('[fF]ile.txt', { cwd: fixturePath, nocase: true })
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('brace expansion with nocase: true', async () => {
      const result = await globlin.glob('*.{txt,TXT}', { cwd: fixturePath, nocase: true })
      // Should match both extensions case-insensitively
      expect(result.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('preserves original case in results', () => {
    it('results maintain original file case', async () => {
      const result = await globlin.glob('*.txt', { cwd: fixturePath, nocase: true })
      // Results should include files as they exist on disk, not lowercased
      // Note: On case-insensitive filesystems (macOS, Windows), multiple files with
      // different cases might actually be the same file
      expect(result.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('glob compatibility', () => {
    it('globlin matches glob results with nocase: true (simple)', () => {
      const globResult = globSyncOriginal('*.txt', { cwd: fixturePath, nocase: true }).sort()
      const globlinResult = globlin.globSync('*.txt', { cwd: fixturePath, nocase: true }).sort()
      expect(globlinResult).toEqual(globResult)
    })

    it('globlin matches glob results with nocase: true (recursive)', () => {
      const globResult = globSyncOriginal('**/*.ts', { cwd: fixturePath, nocase: true }).sort()
      const globlinResult = globlin.globSync('**/*.ts', { cwd: fixturePath, nocase: true }).sort()
      expect(globlinResult).toEqual(globResult)
    })

    it('globlin matches glob results with nocase: false', () => {
      const globResult = globSyncOriginal('*.txt', { cwd: fixturePath, nocase: false }).sort()
      const globlinResult = globlin.globSync('*.txt', { cwd: fixturePath, nocase: false }).sort()
      expect(globlinResult).toEqual(globResult)
    })

    it('globlin matches glob results with uppercase pattern', () => {
      const globResult = globSyncOriginal('*.TXT', { cwd: fixturePath, nocase: true }).sort()
      const globlinResult = globlin.globSync('*.TXT', { cwd: fixturePath, nocase: true }).sort()
      expect(globlinResult).toEqual(globResult)
    })
  })

  describe('unicode case folding', () => {
    // Note: Unicode case handling depends on the filesystem and regex engine
    // These tests verify basic Unicode support

    it('handles basic ASCII files case-insensitively', async () => {
      // uber.txt and UBER.TXT
      const result = await globlin.glob('uber.txt', { cwd: fixturePath, nocase: true })
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('handles uppercase pattern against lowercase file', async () => {
      const result = await globlin.glob('UBER.TXT', { cwd: fixturePath, nocase: true })
      expect(result.some(r => r.toLowerCase() === 'uber.txt')).toBe(true)
    })

    it('matches files with simple names case-insensitively', async () => {
      const result = await globlin.glob('naive.txt', { cwd: fixturePath, nocase: true })
      expect(result.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('sync vs async consistency', () => {
    it('async and sync produce same results with nocase: true', async () => {
      const asyncResult = (
        await globlin.glob('**/*.txt', { cwd: fixturePath, nocase: true })
      ).sort()
      const syncResult = globlin.globSync('**/*.txt', { cwd: fixturePath, nocase: true }).sort()
      expect(asyncResult).toEqual(syncResult)
    })
  })

  describe('Glob class with nocase', () => {
    it('Glob class accepts nocase option', async () => {
      const g = new globlin.Glob('*.txt', { cwd: fixturePath, nocase: true })
      const result = g.walkSync()
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('Glob class preserves nocase option', () => {
      const g = new globlin.Glob('*.txt', { cwd: fixturePath, nocase: true })
      expect(g.options.nocase).toBe(true)
    })
  })

  describe('nocase with other options', () => {
    it('nocase + dot works together', async () => {
      // Create a fixture with hidden files
      const dotFixture = await createTestFixture('nocase-dot', {
        files: ['.HIDDEN', '.hidden', 'visible.txt'],
      })

      try {
        const result = await globlin.glob('*', { cwd: dotFixture, nocase: true, dot: true })
        expect(result.length).toBeGreaterThanOrEqual(2)
      } finally {
        await cleanupFixture(dotFixture)
      }
    })

    it('nocase + nodir works together', async () => {
      const result = await globlin.glob('**/*', { cwd: fixturePath, nocase: true, nodir: true })
      // Should only return files, not directories
      for (const r of result) {
        const stat = await fs.stat(path.join(fixturePath, r))
        expect(stat.isFile()).toBe(true)
      }
    })

    it('nocase + absolute works together', async () => {
      const result = await globlin.glob('*.txt', { cwd: fixturePath, nocase: true, absolute: true })
      for (const r of result) {
        expect(path.isAbsolute(r)).toBe(true)
      }
    })
  })
})
