/**
 * Tests for the test harness itself.
 *
 * These tests verify that the harness correctly:
 * - Creates real filesystem fixtures
 * - Runs glob against those fixtures
 * - Compares results properly
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { glob as globOriginal } from 'glob'
import * as path from 'path'
import {
  createTestFixture,
  createLargeFixture,
  cleanupFixture,
  cleanupAllFixtures,
  DEFAULT_FIXTURE,
  measureTime,
  setsEqual,
  normalizePaths,
  type FixtureConfig,
} from './harness'

describe('Test Harness', () => {
  describe('Fixture Creation', () => {
    let fixture: string

    afterEach(async () => {
      if (fixture) {
        await cleanupFixture(fixture)
      }
    })

    it('creates default fixture with correct files', async () => {
      fixture = await createTestFixture('default-test')

      // Verify the fixture was created
      expect(fixture).toContain('fixtures')
      expect(fixture).toContain('default-test')

      // Run glob on the fixture to verify files exist
      const files = (await globOriginal('**/*', {
        cwd: fixture,
        dot: true,
        nodir: true,
      })) as string[]

      // Check that expected files were created
      const expectedFiles = DEFAULT_FIXTURE.files ?? []
      for (const expectedFile of expectedFiles) {
        const normalizedExpected = expectedFile.split('/').join(path.sep)
        const found = files.some(f => f === normalizedExpected || f === expectedFile)
        expect(found, `Expected to find ${expectedFile}`).toBe(true)
      }
    })

    it('creates custom fixture with specified files', async () => {
      const config: FixtureConfig = {
        files: ['foo.txt', 'bar/baz.js', 'deep/nested/file.ts'],
        dirs: ['empty-dir'],
      }

      fixture = await createTestFixture('custom-test', config)

      const files = (await globOriginal('**/*', {
        cwd: fixture,
        dot: true,
        nodir: true,
      })) as string[]

      expect(files.length).toBe(3)
      expect(files.some(f => f.endsWith('foo.txt'))).toBe(true)
      expect(files.some(f => f.includes('baz.js'))).toBe(true)
      expect(files.some(f => f.includes('file.ts'))).toBe(true)
    })

    it('creates large fixture with specified file count', async () => {
      const fileCount = 50
      fixture = await createLargeFixture(fileCount, { name: 'large-test' })

      const files = (await globOriginal('**/*', {
        cwd: fixture,
        dot: true,
        nodir: true,
      })) as string[]

      expect(files.length).toBe(fileCount)
    })
  })

  describe('Glob Integration', () => {
    let fixture: string

    beforeAll(async () => {
      fixture = await createTestFixture('glob-integration')
    })

    afterAll(async () => {
      await cleanupFixture(fixture)
    })

    it('runs glob on fixture and returns results', async () => {
      const results = (await globOriginal('**/*', {
        cwd: fixture,
        dot: true,
        nodir: true,
      })) as string[]

      expect(results.length).toBeGreaterThan(0)
      expect(Array.isArray(results)).toBe(true)
    })

    it('matches specific patterns correctly', async () => {
      // Pattern: **/h - should match files ending with 'h'
      const results = (await globOriginal('**/h', {
        cwd: fixture,
        dot: true,
      })) as string[]

      // Default fixture has a/abcdef/g/h and a/abcfed/g/h
      expect(results.length).toBe(2)
    })

    it('respects dot option', async () => {
      const withDot = (await globOriginal('**/*', {
        cwd: fixture,
        dot: true,
        nodir: true,
      })) as string[]

      const withoutDot = (await globOriginal('**/*', {
        cwd: fixture,
        dot: false,
        nodir: true,
      })) as string[]

      // With dot should find more files (including .abcdef/x/y/z/a)
      expect(withDot.length).toBeGreaterThan(withoutDot.length)
    })
  })

  describe('Utility Functions', () => {
    it('measureTime tracks execution time', async () => {
      const { result, time } = await measureTime(async () => {
        await new Promise(resolve => setTimeout(resolve, 50))
        return 'done'
      })

      expect(result).toBe('done')
      expect(time).toBeGreaterThanOrEqual(45) // Allow some variance
      expect(time).toBeLessThan(200)
    })

    it('setsEqual compares sets correctly', () => {
      const a = new Set([1, 2, 3])
      const b = new Set([1, 2, 3])
      const c = new Set([1, 2, 4])
      const d = new Set([1, 2])

      expect(setsEqual(a, b)).toBe(true)
      expect(setsEqual(a, c)).toBe(false)
      expect(setsEqual(a, d)).toBe(false)
    })

    it('normalizePaths handles cross-platform paths', () => {
      // On Unix, path.sep is '/' so backslashes aren't converted
      // On Windows, path.sep is '\' so slashes aren't converted
      // This function normalizes to forward slashes by splitting on path.sep
      const input = ['x/y/z', 'foo', 'a/b/c']
      const result = normalizePaths(input)

      // All should use forward slashes and be sorted
      expect(result).toContain('x/y/z')
      expect(result).toContain('foo')
      expect(result).toContain('a/b/c')
      // Should be sorted alphabetically
      expect(result[0]).toBe('a/b/c')
      expect(result[1]).toBe('foo')
      expect(result[2]).toBe('x/y/z')
    })
  })

  describe('Cleanup', () => {
    it('cleanupFixture removes fixture directory', async () => {
      const fixture = await createTestFixture('cleanup-test')

      // Verify it exists
      const beforeFiles = (await globOriginal('**/*', {
        cwd: fixture,
        dot: true,
      })) as string[]
      expect(beforeFiles.length).toBeGreaterThan(0)

      // Cleanup
      await cleanupFixture(fixture)

      // Verify it's gone - glob doesn't throw for non-existent cwd, returns empty
      // Instead, check that no files are found
      const afterFiles = (await globOriginal('**/*', {
        cwd: fixture,
        dot: true,
      })) as string[]
      expect(afterFiles.length).toBe(0)
    })

    it('cleanupAllFixtures removes all fixtures in category', async () => {
      const category = 'cleanup-all-test'

      // Create multiple fixtures
      await createTestFixture(`${category}/a`)
      await createTestFixture(`${category}/b`)

      // Cleanup all
      await cleanupAllFixtures(category)

      // Category should be gone - glob returns empty for non-existent dirs
      const fixturesRoot = path.join(__dirname, 'fixtures', category)
      const afterFiles = (await globOriginal('**/*', {
        cwd: fixturesRoot,
        dot: true,
      })) as string[]
      expect(afterFiles.length).toBe(0)
    })
  })
})
