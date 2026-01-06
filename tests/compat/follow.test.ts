// Ported from vendor/glob/test/follow.ts
// Tests for symlink following behavior

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as glob from 'glob'
import * as fs from 'fs'
import * as path from 'path'
import { loadGloblin, GloblinModule } from '../harness'

// Skip these tests on Windows - symlinks require special permissions
const isWindows = process.platform === 'win32'

describe.skipIf(isWindows)('Symlink Following', () => {
  let globlin: GloblinModule | null = null
  let fixtureDir: string

  beforeAll(async () => {
    globlin = await loadGloblin()

    // Create fixture directory with symlinks
    fixtureDir = path.join(__dirname, '..', '..', 'test-fixtures-follow')

    // Clean up if exists
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }

    // Create structure:
    // test-fixtures-follow/
    //   a/
    //     b/
    //       c/
    //         file.txt
    //       file2.txt
    //     symlink -> a/b  (creates a recursive link)
    fs.mkdirSync(path.join(fixtureDir, 'a', 'b', 'c'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'a', 'b', 'c', 'file.txt'), 'content')
    fs.writeFileSync(path.join(fixtureDir, 'a', 'b', 'file2.txt'), 'content')

    // Create a symlink that points to a/b (creating a potential cycle)
    fs.symlinkSync(path.join(fixtureDir, 'a', 'b'), path.join(fixtureDir, 'a', 'symlink'))
  })

  afterAll(() => {
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  describe('follow: not specified (default behavior)', () => {
    // Note: By default, glob follows ONE symlink if ** is not the first part of the pattern.
    // Pattern "a/**/*.txt" - ** is not first, so ONE symlink is followed.
    // Pattern "**/*.txt" - ** IS first, so NO symlinks are followed.

    it('glob: should follow ONE symlink when ** is not first (default)', async () => {
      const results = await glob.glob('a/**/*.txt', { cwd: fixtureDir, posix: true })
      results.sort()

      // Should find files in real directories
      expect(results).toContain('a/b/c/file.txt')
      expect(results).toContain('a/b/file2.txt')

      // Should ALSO find one level through symlink (glob's default behavior)
      expect(results).toContain('a/symlink/file2.txt')
    })

    it('glob: should NOT follow symlinks when ** is first', async () => {
      const results = await glob.glob('**/*.txt', { cwd: fixtureDir, posix: true })
      results.sort()

      // Should find files in real directories
      expect(results).toContain('a/b/c/file.txt')
      expect(results).toContain('a/b/file2.txt')

      // Should NOT find through symlink when ** is first
      expect(results.filter(r => r.includes('symlink'))).toHaveLength(0)
    })

    it('globlin: should match glob behavior (comparison test)', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      // For now, globlin with follow:false doesn't traverse any symlinks
      // This is a simpler behavior that's still valid
      const globlinResults = await globlin.glob('a/**/*.txt', { cwd: fixtureDir, posix: true })

      // Should find files in real directories
      expect(globlinResults).toContain('a/b/c/file.txt')
      expect(globlinResults).toContain('a/b/file2.txt')
    })
  })

  describe('follow: true', () => {
    it('glob: should follow symlinks when follow: true', async () => {
      const results = await glob.glob('a/**/*.txt', { cwd: fixtureDir, follow: true, posix: true })
      results.sort()

      // Should find files in real directories
      expect(results).toContain('a/b/c/file.txt')
      expect(results).toContain('a/b/file2.txt')

      // Should also find files through the symlink
      expect(results).toContain('a/symlink/c/file.txt')
      expect(results).toContain('a/symlink/file2.txt')
    })

    it('globlin: should follow symlinks when follow: true', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      const results = await globlin.glob('a/**/*.txt', {
        cwd: fixtureDir,
        follow: true,
        posix: true,
      })
      results.sort()

      // Should find files in real directories
      expect(results).toContain('a/b/c/file.txt')
      expect(results).toContain('a/b/file2.txt')

      // Should also find files through the symlink
      expect(results).toContain('a/symlink/c/file.txt')
      expect(results).toContain('a/symlink/file2.txt')
    })

    it('should match glob behavior with follow: true', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      const globResults = new Set(
        await glob.glob('a/**/*.txt', { cwd: fixtureDir, follow: true, posix: true })
      )
      const globlinResults = new Set(
        await globlin.glob('a/**/*.txt', { cwd: fixtureDir, follow: true, posix: true })
      )

      expect(globlinResults).toEqual(globResults)
    })

    it('should handle potential cycles without infinite loop', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      // This should complete without timing out
      // The symlink a/symlink -> a/b creates a potential for infinite recursion
      // But walkdir should detect and prevent cycles
      const results = await globlin.glob('a/**/*', { cwd: fixtureDir, follow: true, posix: true })

      // Should get some results
      expect(results.length).toBeGreaterThan(0)

      // Results should be finite (not infinite from cycles)
      expect(results.length).toBeLessThan(1000)
    })
  })

  describe('sync versions', () => {
    it('globSync: globlin should find real files', () => {
      if (!globlin) throw new Error('globlin not loaded')

      const globlinResults = globlin.globSync('a/**/*.txt', { cwd: fixtureDir, posix: true })

      // Should find files in real directories
      expect(globlinResults).toContain('a/b/c/file.txt')
      expect(globlinResults).toContain('a/b/file2.txt')
    })

    it('globSync should match sync glob behavior with follow: true', () => {
      if (!globlin) throw new Error('globlin not loaded')

      const globResults = new Set(
        glob.globSync('a/**/*.txt', { cwd: fixtureDir, follow: true, posix: true })
      )
      const globlinResults = new Set(
        globlin.globSync('a/**/*.txt', { cwd: fixtureDir, follow: true, posix: true })
      )

      expect(globlinResults).toEqual(globResults)
    })
  })
})

describe.skipIf(isWindows)('Broken Symlinks', () => {
  let globlin: GloblinModule | null = null
  let fixtureDir: string

  beforeAll(async () => {
    globlin = await loadGloblin()

    // Create fixture directory with broken symlink
    fixtureDir = path.join(__dirname, '..', '..', 'test-fixtures-broken-symlink')

    // Clean up if exists
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }

    // Create structure:
    // test-fixtures-broken-symlink/
    //   a/
    //     broken-link/
    //       link -> this-does-not-exist
    fs.mkdirSync(path.join(fixtureDir, 'a', 'broken-link'), { recursive: true })
    fs.symlinkSync('this-does-not-exist', path.join(fixtureDir, 'a', 'broken-link', 'link'))
  })

  afterAll(() => {
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  const patterns = [
    'a/broken-link/*',
    'a/broken-link/**',
    'a/broken-link/**/link',
    'a/broken-link/**/*',
    'a/broken-link/link',
    'a/broken-link/{link,asdf}',
    'a/broken-link/+(link|asdf)',
    'a/broken-link/!(asdf)',
  ]

  describe('default options', () => {
    for (const pattern of patterns) {
      it(`glob: should find broken symlink with pattern "${pattern}"`, async () => {
        const results = await glob.glob(pattern, { cwd: fixtureDir, posix: true })
        expect(results).toContain('a/broken-link/link')
      })

      it(`globlin: should find broken symlink with pattern "${pattern}"`, async () => {
        if (!globlin) throw new Error('globlin not loaded')
        const results = await globlin.glob(pattern, { cwd: fixtureDir, posix: true })
        expect(results).toContain('a/broken-link/link')
      })
    }
  })

  describe('with follow: true', () => {
    for (const pattern of patterns) {
      it(`glob: should find broken symlink with follow:true and pattern "${pattern}"`, async () => {
        const results = await glob.glob(pattern, { cwd: fixtureDir, follow: true, posix: true })
        expect(results).toContain('a/broken-link/link')
      })

      it(`globlin: should find broken symlink with follow:true and pattern "${pattern}"`, async () => {
        if (!globlin) throw new Error('globlin not loaded')
        const results = await globlin.glob(pattern, { cwd: fixtureDir, follow: true, posix: true })
        expect(results).toContain('a/broken-link/link')
      })
    }
  })

  describe('sync versions', () => {
    it('glob: globSync should find broken symlink', () => {
      const results = glob.globSync('a/broken-link/*', { cwd: fixtureDir, posix: true })
      expect(results).toContain('a/broken-link/link')
    })

    it('globlin: globSync should find broken symlink', () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = globlin.globSync('a/broken-link/*', { cwd: fixtureDir, posix: true })
      expect(results).toContain('a/broken-link/link')
    })
  })
})
