// Ported from vendor/glob/test/nodir.ts
// Tests for nodir option - only return files, not directories

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as glob from 'glob'
import * as fs from 'fs'
import * as path from 'path'
import { loadGloblin, GloblinModule } from '../harness'

describe('nodir', () => {
  let globlin: GloblinModule | null = null
  let fixtureDir: string

  beforeAll(async () => {
    globlin = await loadGloblin()
    
    // Create a fixture directory with nested structure
    fixtureDir = path.join(__dirname, '..', '..', 'test-fixtures-nodir')
    
    // Clean up if exists
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
    
    // Create structure similar to glob's test fixtures:
    // test-fixtures-nodir/
    //   a/
    //     abcdef/
    //       g/
    //         h (file)
    //     abcfed/
    //       g/
    //         h (file)
    //     b/
    //       c/
    //         d (file)
    //     bc/
    //       e/
    //         f (file)
    //     c/
    //       d/
    //         c/
    //           b (file)
    //     cb/
    //       e/
    //         f (file)
    //   x.txt (file)
    //   y.js (file)
    //   subdir/ (directory)
    
    // Create nested structure
    fs.mkdirSync(path.join(fixtureDir, 'a', 'abcdef', 'g'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'a', 'abcdef', 'g', 'h'), '')
    
    fs.mkdirSync(path.join(fixtureDir, 'a', 'abcfed', 'g'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'a', 'abcfed', 'g', 'h'), '')
    
    fs.mkdirSync(path.join(fixtureDir, 'a', 'b', 'c'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'a', 'b', 'c', 'd'), '')
    
    fs.mkdirSync(path.join(fixtureDir, 'a', 'bc', 'e'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'a', 'bc', 'e', 'f'), '')
    
    fs.mkdirSync(path.join(fixtureDir, 'a', 'c', 'd', 'c'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'a', 'c', 'd', 'c', 'b'), '')
    
    fs.mkdirSync(path.join(fixtureDir, 'a', 'cb', 'e'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'a', 'cb', 'e', 'f'), '')
    
    // Root level files and directory
    fs.writeFileSync(path.join(fixtureDir, 'x.txt'), '')
    fs.writeFileSync(path.join(fixtureDir, 'y.js'), '')
    fs.mkdirSync(path.join(fixtureDir, 'subdir'), { recursive: true })
  })

  afterAll(() => {
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  const sortResults = (arr: string[]) =>
    arr.map(s => s.replace(/\\/g, '/')).sort((a, b) => a.localeCompare(b, 'en'))

  describe('nodir: true excludes directories', () => {
    it('glob: */** with nodir should only return files', async () => {
      const results = sortResults(await glob.glob('*/**', { cwd: path.join(fixtureDir, 'a'), nodir: true }))
      // Should have files from nested directories
      expect(results).toContain('abcdef/g/h')
      expect(results).toContain('abcfed/g/h')
      expect(results).toContain('b/c/d')
      expect(results).toContain('bc/e/f')
      expect(results).toContain('c/d/c/b')
      expect(results).toContain('cb/e/f')
      // Should NOT have any directories
      for (const r of results) {
        const fullPath = path.join(fixtureDir, 'a', r)
        const stat = fs.statSync(fullPath)
        expect(stat.isFile()).toBe(true)
      }
    })

    it('globSync: */** with nodir should only return files', () => {
      const results = sortResults(glob.globSync('*/**', { cwd: path.join(fixtureDir, 'a'), nodir: true }))
      // Check all results are files
      for (const r of results) {
        const fullPath = path.join(fixtureDir, 'a', r)
        const stat = fs.statSync(fullPath)
        expect(stat.isFile()).toBe(true)
      }
    })

    it('globlin: */** with nodir should only return files', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = sortResults(await globlin.glob('*/**', { cwd: path.join(fixtureDir, 'a'), nodir: true }))
      expect(results).toContain('abcdef/g/h')
      expect(results).toContain('abcfed/g/h')
      expect(results).toContain('b/c/d')
      expect(results).toContain('bc/e/f')
      expect(results).toContain('c/d/c/b')
      expect(results).toContain('cb/e/f')
      // Should NOT have any directories
      for (const r of results) {
        const fullPath = path.join(fixtureDir, 'a', r)
        const stat = fs.statSync(fullPath)
        expect(stat.isFile()).toBe(true)
      }
    })

    it('globlin sync: */** with nodir should only return files', () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = sortResults(globlin.globSync('*/**', { cwd: path.join(fixtureDir, 'a'), nodir: true }))
      for (const r of results) {
        const fullPath = path.join(fixtureDir, 'a', r)
        const stat = fs.statSync(fullPath)
        expect(stat.isFile()).toBe(true)
      }
    })
  })

  describe('nodir: false includes directories', () => {
    it('glob: ** without nodir should include directories', async () => {
      const results = sortResults(await glob.glob('**', { cwd: fixtureDir, nodir: false }))
      // Should include the subdir directory
      expect(results).toContain('subdir')
      expect(results).toContain('a')
    })

    it('globlin: ** without nodir should include directories', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = sortResults(await globlin.glob('**', { cwd: fixtureDir, nodir: false }))
      expect(results).toContain('subdir')
      expect(results).toContain('a')
    })
  })

  describe('default behavior (nodir not specified)', () => {
    it('glob: default includes directories', async () => {
      const results = sortResults(await glob.glob('*', { cwd: fixtureDir }))
      // Default behavior should include directories
      expect(results).toContain('subdir')
      expect(results).toContain('a')
      expect(results).toContain('x.txt')
      expect(results).toContain('y.js')
    })

    it('globlin: default includes directories', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = sortResults(await globlin.glob('*', { cwd: fixtureDir }))
      expect(results).toContain('subdir')
      expect(results).toContain('a')
      expect(results).toContain('x.txt')
      expect(results).toContain('y.js')
    })
  })

  describe('nodir with simple patterns', () => {
    it('glob: * with nodir should only return files at root', async () => {
      const results = sortResults(await glob.glob('*', { cwd: fixtureDir, nodir: true }))
      // Should only have files
      expect(results).toContain('x.txt')
      expect(results).toContain('y.js')
      // Should NOT have directories
      expect(results).not.toContain('subdir')
      expect(results).not.toContain('a')
    })

    it('globlin: * with nodir should only return files at root', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = sortResults(await globlin.glob('*', { cwd: fixtureDir, nodir: true }))
      expect(results).toContain('x.txt')
      expect(results).toContain('y.js')
      expect(results).not.toContain('subdir')
      expect(results).not.toContain('a')
    })

    it('globlin sync: * with nodir should only return files at root', () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = sortResults(globlin.globSync('*', { cwd: fixtureDir, nodir: true }))
      expect(results).toContain('x.txt')
      expect(results).toContain('y.js')
      expect(results).not.toContain('subdir')
      expect(results).not.toContain('a')
    })
  })

  describe('nodir with patterns that contain *b*', () => {
    // This matches glob's test cases: 'a/*b*/**', {}, [...]
    it('glob: a/*b*/** with nodir should return files in matching dirs', async () => {
      const results = sortResults(await glob.glob('a/*b*/**', { cwd: fixtureDir, nodir: true }))
      expect(results).toContain('a/abcdef/g/h')
      expect(results).toContain('a/abcfed/g/h')
      expect(results).toContain('a/b/c/d')
      expect(results).toContain('a/bc/e/f')
      expect(results).toContain('a/cb/e/f')
      // Should not contain directories
      expect(results).not.toContain('a/abcdef')
      expect(results).not.toContain('a/abcfed')
      expect(results).not.toContain('a/b')
      expect(results).not.toContain('a/bc')
      expect(results).not.toContain('a/cb')
    })

    it('globlin: a/*b*/** with nodir should return files in matching dirs', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = sortResults(await globlin.glob('a/*b*/**', { cwd: fixtureDir, nodir: true }))
      expect(results).toContain('a/abcdef/g/h')
      expect(results).toContain('a/abcfed/g/h')
      expect(results).toContain('a/b/c/d')
      expect(results).toContain('a/bc/e/f')
      expect(results).toContain('a/cb/e/f')
    })
  })

  describe('nodir with trailing slash pattern', () => {
    // Pattern ending with / should never match anything with nodir
    it('glob: a/*b**/ with nodir should return empty', async () => {
      const results = await glob.glob('a/*b**/', { cwd: fixtureDir, nodir: true })
      expect(results).toEqual([])
    })

    it('globlin: a/*b**/ with nodir should return empty', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = await globlin.glob('a/*b**/', { cwd: fixtureDir, nodir: true })
      expect(results).toEqual([])
    })
  })

  describe('nodir with */* pattern', () => {
    // */* requires exactly 2 segments
    it('glob: */* with nodir in subdir should return empty', async () => {
      const results = await glob.glob('*/*', { cwd: path.join(fixtureDir, 'a'), nodir: true })
      // In a/, */* matches things like abcdef/g, b/c, etc. which are directories
      // With nodir: true, these are filtered out
      // But we should still get files at depth 2 if they exist... let's verify
      expect(results).toEqual([])
    })

    it('globlin: */* with nodir in subdir should return empty', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const results = await globlin.glob('*/*', { cwd: path.join(fixtureDir, 'a'), nodir: true })
      expect(results).toEqual([])
    })
  })

  describe('glob and globlin comparison', () => {
    it('should match for */** with nodir', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const globResults = new Set(await glob.glob('*/**', { cwd: path.join(fixtureDir, 'a'), nodir: true }))
      const globlinResults = new Set(await globlin.glob('*/**', { cwd: path.join(fixtureDir, 'a'), nodir: true }))
      expect(globlinResults).toEqual(globResults)
    })

    it('should match for a/*b*/** with nodir', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const globResults = new Set(await glob.glob('a/*b*/**', { cwd: fixtureDir, nodir: true }))
      const globlinResults = new Set(await globlin.glob('a/*b*/**', { cwd: fixtureDir, nodir: true }))
      expect(globlinResults).toEqual(globResults)
    })

    it('should match for a/*b**/ with nodir', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const globResults = await glob.glob('a/*b**/', { cwd: fixtureDir, nodir: true })
      const globlinResults = await globlin.glob('a/*b**/', { cwd: fixtureDir, nodir: true })
      expect(globlinResults).toEqual(globResults)
    })

    it('should match for */* with nodir', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const globResults = await glob.glob('*/*', { cwd: path.join(fixtureDir, 'a'), nodir: true })
      const globlinResults = await globlin.glob('*/*', { cwd: path.join(fixtureDir, 'a'), nodir: true })
      expect(globlinResults).toEqual(globResults)
    })

    it('should match for ** with nodir', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const globResults = new Set(await glob.glob('**', { cwd: fixtureDir, nodir: true }))
      const globlinResults = new Set(await globlin.glob('**', { cwd: fixtureDir, nodir: true }))
      expect(globlinResults).toEqual(globResults)
    })

    it('should match for * with nodir', async () => {
      if (!globlin) throw new Error('globlin not loaded')
      const globResults = new Set(await glob.glob('*', { cwd: fixtureDir, nodir: true }))
      const globlinResults = new Set(await globlin.glob('*', { cwd: fixtureDir, nodir: true }))
      expect(globlinResults).toEqual(globResults)
    })
  })
})
