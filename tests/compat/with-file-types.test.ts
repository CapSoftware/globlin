import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { globSync as globlinSync, glob as globlinGlob } from '../../js/index'
import { globSync, glob } from 'glob'
import { createTestFixture, cleanupFixture, FixtureConfig } from '../harness'

const FIXTURE_CONFIG: FixtureConfig = {
  files: ['file.txt', 'file.js', 'dir/nested.ts', 'dir/subdir/deep.md', '.hidden'],
  contents: {
    'file.txt': 'content',
    'file.js': 'code',
    'dir/nested.ts': 'nested',
    'dir/subdir/deep.md': 'deep',
    '.hidden': 'hidden',
  },
}

describe('withFileTypes option', () => {
  let fixture: string

  beforeAll(async () => {
    fixture = await createTestFixture('with-file-types', FIXTURE_CONFIG)
  })

  afterAll(async () => {
    await cleanupFixture(fixture)
  })

  describe('globSync with withFileTypes: true', () => {
    it('returns Path objects instead of strings', () => {
      const results = globlinSync('*.txt', { cwd: fixture, withFileTypes: true })
      expect(results).toHaveLength(1)
      expect(results[0]).toBeInstanceOf(Object)
      expect(typeof results[0]).toBe('object')
      expect(results[0].name).toBe('file.txt')
    })

    it('returns Path objects with fullpath() method', () => {
      const results = globlinSync('*.txt', { cwd: fixture, withFileTypes: true })
      expect(results[0].fullpath()).toContain('file.txt')
      // fullpath() returns absolute path - starts with / on unix, drive letter on Windows
      const isAbsolute = require('path').isAbsolute
      expect(isAbsolute(results[0].fullpath())).toBe(true)
    })

    it('returns Path objects with relative() method', () => {
      const results = globlinSync('*.txt', { cwd: fixture, withFileTypes: true })
      expect(results[0].relative()).toBe('file.txt')
    })

    it('works with recursive patterns', () => {
      const results = globlinSync('**/*.ts', { cwd: fixture, withFileTypes: true, posix: true })
      expect(results).toHaveLength(1)
      expect(results[0].relative()).toBe('dir/nested.ts')
    })

    it('works with multiple files', () => {
      const results = globlinSync('*', { cwd: fixture, withFileTypes: true })
      expect(results.length).toBeGreaterThan(1)
      expect(results.every(p => typeof p.name === 'string')).toBe(true)
    })

    it('has isFile() and isDirectory() returning false without stat option', () => {
      // Without stat: true, isFile/isDirectory return false (type unknown)
      const results = globlinSync('*.txt', { cwd: fixture, withFileTypes: true })
      // PathScurry returns false for unknown types
      expect(results[0].isFile()).toBe(false)
      expect(results[0].isDirectory()).toBe(false)
    })

    it('has isFile() and isDirectory() working with stat: true', () => {
      const results = globlinSync('*.txt', { cwd: fixture, withFileTypes: true, stat: true })
      expect(results[0].isFile()).toBe(true)
      expect(results[0].isDirectory()).toBe(false)
    })

    it('matches glob v13 result paths', () => {
      const globResults = globSync('**/*', { cwd: fixture, withFileTypes: true, dot: true })
      const globlinResults = globlinSync('**/*', { cwd: fixture, withFileTypes: true, dot: true })

      const globPaths = globResults.map(p => p.relative()).sort()
      const globlinPaths = globlinResults.map(p => p.relative()).sort()

      expect(globlinPaths).toEqual(globPaths)
    })
  })

  describe('glob (async) with withFileTypes: true', () => {
    it('returns Path objects instead of strings', async () => {
      const results = await globlinGlob('*.txt', { cwd: fixture, withFileTypes: true })
      expect(results).toHaveLength(1)
      expect(typeof results[0]).toBe('object')
      expect(results[0].name).toBe('file.txt')
    })

    it('matches glob v13 result paths', async () => {
      const globResults = await glob('**/*', { cwd: fixture, withFileTypes: true, dot: true })
      const globlinResults = await globlinGlob('**/*', {
        cwd: fixture,
        withFileTypes: true,
        dot: true,
      })

      const globPaths = globResults.map(p => p.relative()).sort()
      const globlinPaths = globlinResults.map(p => p.relative()).sort()

      expect(globlinPaths).toEqual(globPaths)
    })
  })

  describe('withFileTypes: false', () => {
    it('returns strings (default behavior)', () => {
      const results = globlinSync('*.txt', { cwd: fixture, withFileTypes: false })
      expect(results).toHaveLength(1)
      expect(typeof results[0]).toBe('string')
      expect(results[0]).toBe('file.txt')
    })

    it('returns strings when withFileTypes is undefined', () => {
      const results = globlinSync('*.txt', { cwd: fixture })
      expect(results).toHaveLength(1)
      expect(typeof results[0]).toBe('string')
    })
  })

  describe('withFileTypes conflicts', () => {
    it('throws when withFileTypes and absolute are both set', () => {
      expect(() => {
        globlinSync('*.txt', { cwd: fixture, withFileTypes: true, absolute: true })
      }).toThrow('cannot set absolute and withFileTypes:true')
    })
  })
})
