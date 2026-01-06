// Tests for symlink + nodir option interaction
// Task 4.3.3: Verify that nodir:true + follow:true skips symlinks to directories

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as glob from 'glob'
import * as fs from 'fs'
import * as path from 'path'
import { loadGloblin, GloblinModule } from '../harness'

// Skip these tests on Windows - symlinks require special permissions
const isWindows = process.platform === 'win32'

describe.skipIf(isWindows)('Symlink + Nodir Interaction', () => {
  let globlin: GloblinModule | null = null
  let fixtureDir: string

  beforeAll(async () => {
    globlin = await loadGloblin()

    // Create fixture directory with symlinks to both files and directories
    fixtureDir = path.join(__dirname, '..', '..', 'test-fixtures-symlink-nodir')

    // Clean up if exists
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }

    // Create structure:
    // test-fixtures-symlink-nodir/
    //   a/
    //     b/
    //       c/
    //         file.txt (regular file)
    //       file2.txt (regular file)
    //     real-file.txt (regular file)
    //   symlink-to-dir -> a/b  (symlink to directory)
    //   symlink-to-file -> a/real-file.txt (symlink to file)
    //   regular-dir/
    //     inner.txt (regular file)
    //   regular-file.txt (regular file)

    fs.mkdirSync(path.join(fixtureDir, 'a', 'b', 'c'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'a', 'b', 'c', 'file.txt'), 'content')
    fs.writeFileSync(path.join(fixtureDir, 'a', 'b', 'file2.txt'), 'content')
    fs.writeFileSync(path.join(fixtureDir, 'a', 'real-file.txt'), 'content')

    fs.mkdirSync(path.join(fixtureDir, 'regular-dir'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'regular-dir', 'inner.txt'), 'content')
    fs.writeFileSync(path.join(fixtureDir, 'regular-file.txt'), 'content')

    // Create symlinks
    fs.symlinkSync(path.join(fixtureDir, 'a', 'b'), path.join(fixtureDir, 'symlink-to-dir'))
    fs.symlinkSync(
      path.join(fixtureDir, 'a', 'real-file.txt'),
      path.join(fixtureDir, 'symlink-to-file')
    )
  })

  afterAll(() => {
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  const sortResults = (arr: string[]) =>
    arr.map(s => s.replace(/\\/g, '/')).sort((a, b) => a.localeCompare(b, 'en'))

  describe('nodir: true + follow: true should skip symlinks to directories', () => {
    it('glob: nodir:true + follow:true should exclude symlinks-to-dirs', async () => {
      const results = sortResults(
        await glob.glob('*', {
          cwd: fixtureDir,
          nodir: true,
          follow: true,
          posix: true,
        })
      )

      // Should include regular files
      expect(results).toContain('regular-file.txt')

      // Should include symlink-to-file (it points to a file)
      expect(results).toContain('symlink-to-file')

      // Should NOT include regular directories (because nodir:true)
      expect(results).not.toContain('a')
      expect(results).not.toContain('regular-dir')

      // Should NOT include symlink-to-dir (because nodir:true + follow:true means
      // we follow the symlink and see it points to a directory)
      expect(results).not.toContain('symlink-to-dir')
    })

    it('globSync: nodir:true + follow:true should exclude symlinks-to-dirs', () => {
      const results = sortResults(
        glob.globSync('*', {
          cwd: fixtureDir,
          nodir: true,
          follow: true,
          posix: true,
        })
      )

      expect(results).toContain('regular-file.txt')
      expect(results).toContain('symlink-to-file')
      expect(results).not.toContain('a')
      expect(results).not.toContain('regular-dir')
      expect(results).not.toContain('symlink-to-dir')
    })

    it('globlin: nodir:true + follow:true should exclude symlinks-to-dirs', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      const results = sortResults(
        await globlin.glob('*', {
          cwd: fixtureDir,
          nodir: true,
          follow: true,
          posix: true,
        })
      )

      expect(results).toContain('regular-file.txt')
      expect(results).toContain('symlink-to-file')
      expect(results).not.toContain('a')
      expect(results).not.toContain('regular-dir')
      expect(results).not.toContain('symlink-to-dir')
    })

    it('globlinSync: nodir:true + follow:true should exclude symlinks-to-dirs', () => {
      if (!globlin) throw new Error('globlin not loaded')

      const results = sortResults(
        globlin.globSync('*', {
          cwd: fixtureDir,
          nodir: true,
          follow: true,
          posix: true,
        })
      )

      expect(results).toContain('regular-file.txt')
      expect(results).toContain('symlink-to-file')
      expect(results).not.toContain('a')
      expect(results).not.toContain('regular-dir')
      expect(results).not.toContain('symlink-to-dir')
    })
  })

  describe('nodir: true + follow: false should include symlinks (without following)', () => {
    it('glob: nodir:true + follow:false should include symlinks as entries', async () => {
      const results = sortResults(
        await glob.glob('*', {
          cwd: fixtureDir,
          nodir: true,
          follow: false,
          posix: true,
        })
      )

      // With follow:false, symlink entries are reported as symlinks (not what they point to)
      // glob treats symlinks as non-directories when not following
      expect(results).toContain('regular-file.txt')
      expect(results).toContain('symlink-to-file')
      // symlink-to-dir is included because we're not following it,
      // so it appears as a symlink entry (not a directory)
      expect(results).toContain('symlink-to-dir')

      // Should NOT include regular directories
      expect(results).not.toContain('a')
      expect(results).not.toContain('regular-dir')
    })

    it('globlin: nodir:true + follow:false should include symlinks as entries', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      const results = sortResults(
        await globlin.glob('*', {
          cwd: fixtureDir,
          nodir: true,
          follow: false,
          posix: true,
        })
      )

      expect(results).toContain('regular-file.txt')
      expect(results).toContain('symlink-to-file')
      // symlink-to-dir is included because we're not following it
      expect(results).toContain('symlink-to-dir')

      expect(results).not.toContain('a')
      expect(results).not.toContain('regular-dir')
    })
  })

  describe('nodir: false + follow: true should include symlinks-to-dirs as directories', () => {
    it('glob: nodir:false + follow:true includes all entries', async () => {
      const results = sortResults(
        await glob.glob('*', {
          cwd: fixtureDir,
          nodir: false,
          follow: true,
          posix: true,
        })
      )

      // Should include everything
      expect(results).toContain('regular-file.txt')
      expect(results).toContain('symlink-to-file')
      expect(results).toContain('symlink-to-dir')
      expect(results).toContain('a')
      expect(results).toContain('regular-dir')
    })

    it('globlin: nodir:false + follow:true includes all entries', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      const results = sortResults(
        await globlin.glob('*', {
          cwd: fixtureDir,
          nodir: false,
          follow: true,
          posix: true,
        })
      )

      expect(results).toContain('regular-file.txt')
      expect(results).toContain('symlink-to-file')
      expect(results).toContain('symlink-to-dir')
      expect(results).toContain('a')
      expect(results).toContain('regular-dir')
    })
  })

  describe('recursive patterns with nodir + follow', () => {
    it('glob: **/*.txt with nodir:true + follow:true finds files through followed symlinks', async () => {
      const results = sortResults(
        await glob.glob('**/*.txt', {
          cwd: fixtureDir,
          nodir: true,
          follow: true,
          posix: true,
        })
      )

      // Regular files
      expect(results).toContain('regular-file.txt')
      expect(results).toContain('a/real-file.txt')
      expect(results).toContain('a/b/file2.txt')
      expect(results).toContain('a/b/c/file.txt')
      expect(results).toContain('regular-dir/inner.txt')

      // Files through symlink-to-dir (because we follow symlinks)
      expect(results).toContain('symlink-to-dir/file2.txt')
      expect(results).toContain('symlink-to-dir/c/file.txt')
    })

    it('globlin: **/*.txt with nodir:true + follow:true finds files through followed symlinks', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      const results = sortResults(
        await globlin.glob('**/*.txt', {
          cwd: fixtureDir,
          nodir: true,
          follow: true,
          posix: true,
        })
      )

      // Regular files
      expect(results).toContain('regular-file.txt')
      expect(results).toContain('a/real-file.txt')
      expect(results).toContain('a/b/file2.txt')
      expect(results).toContain('a/b/c/file.txt')
      expect(results).toContain('regular-dir/inner.txt')

      // Files through symlink-to-dir
      expect(results).toContain('symlink-to-dir/file2.txt')
      expect(results).toContain('symlink-to-dir/c/file.txt')
    })

    it('glob: **/*.txt with nodir:true + follow:false does NOT traverse symlink-to-dir', async () => {
      const results = sortResults(
        await glob.glob('**/*.txt', {
          cwd: fixtureDir,
          nodir: true,
          follow: false,
          posix: true,
        })
      )

      // Regular files
      expect(results).toContain('regular-file.txt')
      expect(results).toContain('a/real-file.txt')
      expect(results).toContain('a/b/file2.txt')
      expect(results).toContain('a/b/c/file.txt')
      expect(results).toContain('regular-dir/inner.txt')

      // Should NOT have files through symlink (because we're not following)
      const symlinkResults = results.filter(r => r.includes('symlink-to-dir/'))
      expect(symlinkResults).toHaveLength(0)
    })

    it('globlin: **/*.txt with nodir:true + follow:false does NOT traverse symlink-to-dir', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      const results = sortResults(
        await globlin.glob('**/*.txt', {
          cwd: fixtureDir,
          nodir: true,
          follow: false,
          posix: true,
        })
      )

      // Regular files
      expect(results).toContain('regular-file.txt')
      expect(results).toContain('a/real-file.txt')
      expect(results).toContain('a/b/file2.txt')
      expect(results).toContain('a/b/c/file.txt')
      expect(results).toContain('regular-dir/inner.txt')

      // Should NOT have files through symlink
      const symlinkResults = results.filter(r => r.includes('symlink-to-dir/'))
      expect(symlinkResults).toHaveLength(0)
    })
  })

  describe('comparison tests: glob vs globlin', () => {
    it('* pattern with nodir:true + follow:true', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      const globResults = new Set(
        await glob.glob('*', {
          cwd: fixtureDir,
          nodir: true,
          follow: true,
          posix: true,
        })
      )
      const globlinResults = new Set(
        await globlin.glob('*', {
          cwd: fixtureDir,
          nodir: true,
          follow: true,
          posix: true,
        })
      )

      expect(globlinResults).toEqual(globResults)
    })

    it('* pattern with nodir:true + follow:false', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      const globResults = new Set(
        await glob.glob('*', {
          cwd: fixtureDir,
          nodir: true,
          follow: false,
          posix: true,
        })
      )
      const globlinResults = new Set(
        await globlin.glob('*', {
          cwd: fixtureDir,
          nodir: true,
          follow: false,
          posix: true,
        })
      )

      expect(globlinResults).toEqual(globResults)
    })

    it('**/* pattern with nodir:true + follow:true', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      const globResults = new Set(
        await glob.glob('**/*', {
          cwd: fixtureDir,
          nodir: true,
          follow: true,
          posix: true,
        })
      )
      const globlinResults = new Set(
        await globlin.glob('**/*', {
          cwd: fixtureDir,
          nodir: true,
          follow: true,
          posix: true,
        })
      )

      expect(globlinResults).toEqual(globResults)
    })

    it('**/*.txt pattern with nodir:true + follow:true', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      const globResults = new Set(
        await glob.glob('**/*.txt', {
          cwd: fixtureDir,
          nodir: true,
          follow: true,
          posix: true,
        })
      )
      const globlinResults = new Set(
        await globlin.glob('**/*.txt', {
          cwd: fixtureDir,
          nodir: true,
          follow: true,
          posix: true,
        })
      )

      expect(globlinResults).toEqual(globResults)
    })

    it('**/*.txt pattern with nodir:true + follow:false', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      const globResults = new Set(
        await glob.glob('**/*.txt', {
          cwd: fixtureDir,
          nodir: true,
          follow: false,
          posix: true,
        })
      )
      const globlinResults = new Set(
        await globlin.glob('**/*.txt', {
          cwd: fixtureDir,
          nodir: true,
          follow: false,
          posix: true,
        })
      )

      expect(globlinResults).toEqual(globResults)
    })
  })

  describe('mark option with nodir + follow + symlinks', () => {
    it('glob: mark:true + nodir:true + follow:true marks symlink-to-file as file', async () => {
      const results = await glob.glob('*', {
        cwd: fixtureDir,
        nodir: true,
        follow: true,
        mark: true,
        posix: true,
      })

      // Files should not have trailing slash
      expect(results).toContain('regular-file.txt')
      expect(results).toContain('symlink-to-file')

      // No directories (they would have trailing slash) should be present
      expect(results.filter(r => r.endsWith('/'))).toHaveLength(0)
    })

    it('globlin: mark:true + nodir:true + follow:true marks symlink-to-file as file', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      const results = await globlin.glob('*', {
        cwd: fixtureDir,
        nodir: true,
        follow: true,
        mark: true,
        posix: true,
      })

      expect(results).toContain('regular-file.txt')
      expect(results).toContain('symlink-to-file')
      expect(results.filter(r => r.endsWith('/'))).toHaveLength(0)
    })

    it('glob: mark:true + nodir:false + follow:true marks regular dirs but not symlinks', async () => {
      const results = await glob.glob('*', {
        cwd: fixtureDir,
        nodir: false,
        follow: true,
        mark: true,
        posix: true,
      })

      // Regular directories should have trailing slash
      expect(results).toContain('a/')
      expect(results).toContain('regular-dir/')

      // NOTE: glob does NOT add trailing slash to symlink-to-dir even with mark:true
      // because the symlink entry itself is still a symlink, even though we follow it
      expect(results).toContain('symlink-to-dir')

      // Files should not have trailing slash
      expect(results).toContain('regular-file.txt')
      expect(results).toContain('symlink-to-file')
    })

    it('globlin: mark:true + nodir:false + follow:true should match glob behavior', async () => {
      if (!globlin) throw new Error('globlin not loaded')

      const globResults = new Set(
        await glob.glob('*', {
          cwd: fixtureDir,
          nodir: false,
          follow: true,
          mark: true,
          posix: true,
        })
      )

      const globlinResults = new Set(
        await globlin.glob('*', {
          cwd: fixtureDir,
          nodir: false,
          follow: true,
          mark: true,
          posix: true,
        })
      )

      expect(globlinResults).toEqual(globResults)
    })
  })
})
