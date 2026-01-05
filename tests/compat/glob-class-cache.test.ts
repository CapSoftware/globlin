/**
 * Tests for Glob class cache reuse optimization
 *
 * These tests verify that:
 * 1. Passing a Glob instance as options works correctly
 * 2. Options are properly inherited
 * 3. The pattern cache provides benefits for repeated patterns
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as os from 'os'
import { Glob, globSync } from '../../js/index.js'
import { glob as globOriginal } from 'glob'

describe('Glob class cache reuse', () => {
  let fixture: string

  beforeAll(async () => {
    // Create a test fixture
    fixture = path.join(os.tmpdir(), `globlin-cache-test-${Date.now()}`)
    await fs.mkdir(fixture, { recursive: true })
    
    // Create some files
    await fs.mkdir(path.join(fixture, 'src'), { recursive: true })
    await fs.mkdir(path.join(fixture, 'lib'), { recursive: true })
    await fs.mkdir(path.join(fixture, '.hidden'), { recursive: true })
    
    await fs.writeFile(path.join(fixture, 'src/app.js'), '')
    await fs.writeFile(path.join(fixture, 'src/app.ts'), '')
    await fs.writeFile(path.join(fixture, 'src/util.js'), '')
    await fs.writeFile(path.join(fixture, 'lib/helper.js'), '')
    await fs.writeFile(path.join(fixture, 'lib/helper.ts'), '')
    await fs.writeFile(path.join(fixture, '.hidden/secret.js'), '')
    await fs.writeFile(path.join(fixture, 'root.js'), '')
    await fs.writeFile(path.join(fixture, 'config.json'), '')
  })

  afterAll(async () => {
    // Cleanup
    await fs.rm(fixture, { recursive: true, force: true })
  })

  describe('basic cache reuse', () => {
    it('should accept a Glob instance as options', () => {
      const g1 = new Glob('**/*.js', { cwd: fixture })
      const g2 = new Glob('**/*.ts', g1) // Pass g1 as options
      
      expect(g2.options.cwd).toBe(fixture)
    })

    it('should inherit all options from the source Glob', () => {
      const g1 = new Glob('**/*.js', { 
        cwd: fixture, 
        dot: true,
        nodir: true,
        absolute: true 
      })
      
      const g2 = new Glob('**/*.ts', g1)
      
      expect(g2.options.cwd).toBe(fixture)
      expect(g2.options.dot).toBe(true)
      expect(g2.options.nodir).toBe(true)
      expect(g2.options.absolute).toBe(true)
    })

    it('should use the new pattern, not the source pattern', () => {
      const g1 = new Glob('**/*.js', { cwd: fixture })
      const g2 = new Glob('**/*.ts', g1)
      
      const jsResults = g1.walkSync()
      const tsResults = g2.walkSync()
      
      expect(jsResults.every(r => r.endsWith('.js'))).toBe(true)
      expect(tsResults.every(r => r.endsWith('.ts'))).toBe(true)
    })
  })

  describe('cache reuse produces correct results', () => {
    it('should return same results as creating new Glob with same options', () => {
      const opts = { cwd: fixture, dot: true }
      
      // Method 1: New Glob instance
      const g1 = new Glob('**/*.js', opts)
      const results1 = g1.walkSync()
      
      // Method 2: Reuse Glob as options
      const base = new Glob('dummy', opts)
      const g2 = new Glob('**/*.js', base)
      const results2 = g2.walkSync()
      
      expect(new Set(results1)).toEqual(new Set(results2))
    })

    it('should work with chained cache reuse', () => {
      const g1 = new Glob('**/*.js', { cwd: fixture })
      const g2 = new Glob('**/*.ts', g1)
      const g3 = new Glob('**/*.json', g2) // Inherit from g2 (which inherited from g1)
      
      expect(g3.options.cwd).toBe(fixture)
      
      const results = g3.walkSync()
      expect(results.every(r => r.endsWith('.json'))).toBe(true)
    })

    it('should match glob package behavior', async () => {
      const opts = { cwd: fixture }
      
      // Using glob package
      const globResults = await globOriginal('**/*.js', opts)
      
      // Using globlin with cache reuse pattern
      const base = new Glob('dummy', opts)
      const g = new Glob('**/*.js', base)
      const globlinResults = g.walkSync()
      
      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('pattern cache benefits', () => {
    it('should return same results for repeated patterns', () => {
      const opts = { cwd: fixture }
      
      // First call
      const results1 = globSync('**/*.js', opts)
      
      // Second call (should hit pattern cache)
      const results2 = globSync('**/*.js', opts)
      
      // Third call
      const results3 = globSync('**/*.js', opts)
      
      expect(new Set(results1)).toEqual(new Set(results2))
      expect(new Set(results2)).toEqual(new Set(results3))
    })

    it('should handle same pattern with different options correctly', () => {
      // Same pattern, different options (should not interfere)
      const resultsNoDot = globSync('**/*.js', { cwd: fixture, dot: false })
      const resultsWithDot = globSync('**/*.js', { cwd: fixture, dot: true })
      
      // With dot:true should find more files (including .hidden/secret.js)
      expect(resultsWithDot.length).toBeGreaterThan(resultsNoDot.length)
    })

    it('should handle brace expansion with cache correctly', () => {
      // First call with brace expansion
      const results1 = globSync('**/*.{js,ts}', { cwd: fixture })
      
      // Second call (some patterns should hit cache)
      const results2 = globSync('**/*.{js,ts}', { cwd: fixture })
      
      expect(new Set(results1)).toEqual(new Set(results2))
    })
  })

  describe('options inheritance edge cases', () => {
    it('should not mutate the source Glob options', () => {
      const g1 = new Glob('**/*.js', { cwd: fixture, dot: true })
      const originalOptions = { ...g1.options }
      
      // Create new Glob with modifications would fail if we tried to modify
      const g2 = new Glob('**/*.ts', g1)
      
      // Original should be unchanged
      expect(g1.options).toEqual(originalOptions)
    })

    it('should work with all Glob class methods after cache reuse', () => {
      const g1 = new Glob('**/*.js', { cwd: fixture })
      const g2 = new Glob('**/*.ts', g1)
      
      // All methods should work
      expect(() => g2.walkSync()).not.toThrow()
      expect(() => g2.streamSync()).not.toThrow()
      expect(() => g2.iterateSync().next()).not.toThrow()
    })

    it('should work with array patterns in reused Glob', () => {
      const g1 = new Glob(['**/*.js', '**/*.ts'], { cwd: fixture })
      const g2 = new Glob('**/*.json', g1)
      
      // g1 should return both .js and .ts files
      const jsAndTs = g1.walkSync()
      expect(jsAndTs.some(r => r.endsWith('.js'))).toBe(true)
      expect(jsAndTs.some(r => r.endsWith('.ts'))).toBe(true)
      
      // g2 should only return .json files (new pattern)
      const jsonOnly = g2.walkSync()
      expect(jsonOnly.every(r => r.endsWith('.json'))).toBe(true)
    })
  })

  describe('performance characteristics', () => {
    it('repeated patterns should not be significantly slower than first call', () => {
      const opts = { cwd: fixture }
      
      // Measure first call
      const start1 = performance.now()
      globSync('**/*.js', opts)
      const time1 = performance.now() - start1
      
      // Measure second call (should hit cache)
      const start2 = performance.now()
      globSync('**/*.js', opts)
      const time2 = performance.now() - start2
      
      // Second call should not be significantly slower (allow 2x variance for noise)
      // In practice, second call might be faster due to FS cache too
      expect(time2).toBeLessThan(time1 * 2 + 10) // +10ms for measurement noise
    })

    it('cache reuse should complete within reasonable time', () => {
      const start = performance.now()
      
      const g1 = new Glob('**/*.js', { cwd: fixture })
      g1.walkSync()
      
      const g2 = new Glob('**/*.ts', g1)
      g2.walkSync()
      
      const g3 = new Glob('**/*.json', g2)
      g3.walkSync()
      
      const elapsed = performance.now() - start
      
      // Three glob operations on small fixture should complete in reasonable time
      expect(elapsed).toBeLessThan(1000) // 1 second max
    })
  })
})
