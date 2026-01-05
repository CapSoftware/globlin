/**
 * Tests for the parallel option (globlin-specific feature)
 * 
 * The parallel option enables multi-threaded directory walking using jwalk/rayon.
 * This can provide speedups on HDDs and network filesystems, but may be slower
 * on SSDs due to thread coordination overhead.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { globSync, glob, Glob } from '../../js/index'
import { createTestFixture, cleanupFixture } from '../harness'
import * as path from 'path'

describe('parallel option', () => {
  let fixture: string

  beforeAll(async () => {
    // Create a test fixture with enough files to test parallel walking
    fixture = await createTestFixture('parallel-test', {
      files: [
        'file1.txt',
        'file2.txt',
        'file3.js',
        '.hidden',
        'src/index.ts',
        'src/util.ts',
        'src/lib/helper.ts',
        'src/lib/utils.ts',
        'test/test1.spec.ts',
        'test/test2.spec.ts',
        'docs/readme.md',
        'docs/api.md',
        'node_modules/pkg/index.js',
        'node_modules/pkg/package.json',
      ],
    })
  })

  afterAll(async () => {
    await cleanupFixture(fixture)
  })

  describe('basic functionality', () => {
    it('parallel: false returns correct results (default)', () => {
      const results = globSync('**/*.ts', { cwd: fixture, parallel: false })
      
      expect(results).toContain('src/index.ts')
      expect(results).toContain('src/util.ts')
      expect(results).toContain('src/lib/helper.ts')
      expect(results).toContain('src/lib/utils.ts')
      expect(results).toContain('test/test1.spec.ts')
      expect(results).toContain('test/test2.spec.ts')
      expect(results).toHaveLength(6)
    })

    it('parallel: true returns correct results', () => {
      const results = globSync('**/*.ts', { cwd: fixture, parallel: true })
      
      expect(results).toContain('src/index.ts')
      expect(results).toContain('src/util.ts')
      expect(results).toContain('src/lib/helper.ts')
      expect(results).toContain('src/lib/utils.ts')
      expect(results).toContain('test/test1.spec.ts')
      expect(results).toContain('test/test2.spec.ts')
      expect(results).toHaveLength(6)
    })

    it('parallel and serial return the same files (set comparison)', () => {
      const serialResults = new Set(globSync('**/*', { cwd: fixture, parallel: false }))
      const parallelResults = new Set(globSync('**/*', { cwd: fixture, parallel: true }))
      
      expect(parallelResults).toEqual(serialResults)
    })

    it('works with async glob', async () => {
      const serialResults = new Set(await glob('**/*.js', { cwd: fixture, parallel: false }))
      const parallelResults = new Set(await glob('**/*.js', { cwd: fixture, parallel: true }))
      
      expect(parallelResults).toEqual(serialResults)
    })
  })

  describe('with other options', () => {
    it('parallel works with dot: true', () => {
      const serialResults = new Set(globSync('**/*', { cwd: fixture, parallel: false, dot: true }))
      const parallelResults = new Set(globSync('**/*', { cwd: fixture, parallel: true, dot: true }))
      
      expect(parallelResults).toEqual(serialResults)
      // Should include .hidden file
      expect(serialResults.has('.hidden')).toBe(true)
    })

    it('parallel works with dot: false (default)', () => {
      const serialResults = new Set(globSync('**/*', { cwd: fixture, parallel: false }))
      const parallelResults = new Set(globSync('**/*', { cwd: fixture, parallel: true }))
      
      expect(parallelResults).toEqual(serialResults)
      // Should NOT include .hidden file
      expect(serialResults.has('.hidden')).toBe(false)
    })

    it('parallel works with nodir: true', () => {
      const serialResults = new Set(globSync('**/*', { cwd: fixture, parallel: false, nodir: true }))
      const parallelResults = new Set(globSync('**/*', { cwd: fixture, parallel: true, nodir: true }))
      
      expect(parallelResults).toEqual(serialResults)
      // Should not contain directory entries
      expect(serialResults.has('src')).toBe(false)
      expect(serialResults.has('test')).toBe(false)
    })

    it('parallel works with maxDepth', () => {
      const serialResults = new Set(globSync('**/*', { cwd: fixture, parallel: false, maxDepth: 2 }))
      const parallelResults = new Set(globSync('**/*', { cwd: fixture, parallel: true, maxDepth: 2 }))
      
      expect(parallelResults).toEqual(serialResults)
      // Depth 1 should be included
      expect(serialResults.has('src')).toBe(true)
      // Depth 2 should be included
      expect(serialResults.has('src/index.ts')).toBe(true)
      // Depth 3 should NOT be included
      expect(serialResults.has('src/lib/helper.ts')).toBe(false)
    })

    it('parallel works with absolute: true', () => {
      const serialResults = globSync('**/*.txt', { cwd: fixture, parallel: false, absolute: true })
      const parallelResults = globSync('**/*.txt', { cwd: fixture, parallel: true, absolute: true })
      
      // Convert to sets for comparison (order may differ)
      expect(new Set(parallelResults)).toEqual(new Set(serialResults))
      
      // All paths should be absolute
      for (const p of parallelResults) {
        expect(path.isAbsolute(p)).toBe(true)
      }
    })

    it('parallel works with ignore patterns', () => {
      const serialResults = new Set(globSync('**/*', { 
        cwd: fixture, 
        parallel: false, 
        ignore: ['**/node_modules/**'] 
      }))
      const parallelResults = new Set(globSync('**/*', { 
        cwd: fixture, 
        parallel: true, 
        ignore: ['**/node_modules/**'] 
      }))
      
      expect(parallelResults).toEqual(serialResults)
      // node_modules should be ignored
      expect(serialResults.has('node_modules/pkg/index.js')).toBe(false)
    })

    it('parallel works with mark: true', () => {
      const serialResults = new Set(globSync('**/*', { cwd: fixture, parallel: false, mark: true }))
      const parallelResults = new Set(globSync('**/*', { cwd: fixture, parallel: true, mark: true }))
      
      expect(parallelResults).toEqual(serialResults)
      // Directories should have trailing slash
      expect(serialResults.has('src/')).toBe(true)
      expect(serialResults.has('test/')).toBe(true)
    })

    it('parallel works with dotRelative: true', () => {
      const serialResults = new Set(globSync('**/*.md', { cwd: fixture, parallel: false, dotRelative: true }))
      const parallelResults = new Set(globSync('**/*.md', { cwd: fixture, parallel: true, dotRelative: true }))
      
      expect(parallelResults).toEqual(serialResults)
      // Paths should start with ./
      for (const p of parallelResults) {
        expect(p.startsWith('./')).toBe(true)
      }
    })
  })

  describe('Glob class with parallel', () => {
    it('Glob class accepts parallel option', () => {
      const g = new Glob('**/*.ts', { cwd: fixture, parallel: true })
      const results = g.walkSync()
      
      expect(results).toContain('src/index.ts')
      expect(results).toHaveLength(6)
    })

    it('Glob class parallel matches serial', () => {
      const serial = new Glob('**/*', { cwd: fixture, parallel: false })
      const parallel = new Glob('**/*', { cwd: fixture, parallel: true })
      
      const serialResults = new Set(serial.walkSync())
      const parallelResults = new Set(parallel.walkSync())
      
      expect(parallelResults).toEqual(serialResults)
    })

    it('Glob class async walk with parallel', async () => {
      const g = new Glob('**/*.md', { cwd: fixture, parallel: true })
      const results = await g.walk()
      
      expect(results).toContain('docs/readme.md')
      expect(results).toContain('docs/api.md')
      expect(results).toHaveLength(2)
    })
  })

  describe('default behavior', () => {
    it('defaults to serial (parallel: false) when not specified', () => {
      // This test mainly ensures the default is serial, which is faster on SSDs
      // and provides deterministic ordering
      const results1 = globSync('**/*.ts', { cwd: fixture })
      const results2 = globSync('**/*.ts', { cwd: fixture })
      
      // Results should be in the same order when run multiple times (serial is deterministic)
      expect(results1).toEqual(results2)
    })

    it('parallel: undefined is treated as false', () => {
      const explicitFalse = new Set(globSync('**/*', { cwd: fixture, parallel: false }))
      const implicitFalse = new Set(globSync('**/*', { cwd: fixture, parallel: undefined }))
      
      expect(implicitFalse).toEqual(explicitFalse)
    })
  })
})

describe('parallel option with large fixture', () => {
  let largeFixture: string

  beforeAll(async () => {
    // Create a larger fixture to better test parallel performance characteristics
    const files: string[] = []
    
    // Create 1000 files across multiple directories
    for (let dir = 0; dir < 10; dir++) {
      for (let file = 0; file < 50; file++) {
        files.push(`dir${dir}/file${file}.txt`)
        files.push(`dir${dir}/subdir/nested${file}.js`)
      }
    }
    
    largeFixture = await createTestFixture('parallel-large', { files })
  })

  afterAll(async () => {
    await cleanupFixture(largeFixture)
  })

  it('parallel and serial return same results on large fixture', () => {
    const serialResults = new Set(globSync('**/*', { cwd: largeFixture, parallel: false }))
    const parallelResults = new Set(globSync('**/*', { cwd: largeFixture, parallel: true }))
    
    expect(parallelResults).toEqual(serialResults)
    expect(serialResults.size).toBeGreaterThan(100) // Sanity check
  })

  it('parallel works with complex pattern on large fixture', () => {
    const serialResults = new Set(globSync('**/subdir/*.js', { cwd: largeFixture, parallel: false }))
    const parallelResults = new Set(globSync('**/subdir/*.js', { cwd: largeFixture, parallel: true }))
    
    expect(parallelResults).toEqual(serialResults)
    // Should find 10 dirs * 50 files = 500 nested js files
    expect(serialResults.size).toBe(500)
  })

  it('parallel with dot and nodir options on large fixture', () => {
    const serialResults = new Set(globSync('**/*.txt', { 
      cwd: largeFixture, 
      parallel: false, 
      dot: true, 
      nodir: true 
    }))
    const parallelResults = new Set(globSync('**/*.txt', { 
      cwd: largeFixture, 
      parallel: true, 
      dot: true, 
      nodir: true 
    }))
    
    expect(parallelResults).toEqual(serialResults)
    // Should find 10 dirs * 50 files = 500 txt files
    expect(serialResults.size).toBe(500)
  })
})
