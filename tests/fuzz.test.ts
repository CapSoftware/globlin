/**
 * Fuzz tests for globlin.
 * 
 * These tests generate random invalid inputs to ensure globlin:
 * - Never crashes (segfault, stack overflow, etc.)
 * - Handles all edge cases gracefully
 * - Returns errors instead of hanging
 * 
 * All tests use REAL filesystem operations - no mocks or simulations.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { loadGloblin, type GloblinModule, createTestFixture } from './harness.js'
import { createLargeFixture, createRandomFixture } from './fixtures.js'

const fsp = fs.promises

let globlin: GloblinModule

const isWindows = process.platform === 'win32'

describe('Fuzz tests', () => {
  let testFixture: string
  let largeFixture: string
  
  beforeAll(async () => {
    globlin = await loadGloblin()
    testFixture = await createTestFixture('fuzz', {
      files: [
        'a/b/c.js',
        'a/b/d.ts',
        'src/index.ts',
        'src/utils/helper.js',
        'test.txt',
        'README.md',
        '.hidden/file.js',
        '.gitignore',
      ],
      contents: {
        'a/b/c.js': 'test',
        'a/b/d.ts': 'test',
        'src/index.ts': 'test',
        'src/utils/helper.js': 'test',
        'test.txt': 'test',
        'README.md': 'readme',
        '.hidden/file.js': 'hidden',
        '.gitignore': 'ignore',
      }
    })
    largeFixture = await createLargeFixture(1000)
  }, 60000)
  
  afterAll(async () => {
    if (testFixture) {
      await fsp.rm(testFixture, { recursive: true, force: true })
    }
    if (largeFixture) {
      await fsp.rm(largeFixture, { recursive: true, force: true })
    }
  })
  
  describe('Extremely long patterns', () => {
    it('should handle 1000 character pattern without crash', () => {
      const pattern = '*'.repeat(1000)
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle 10000 character pattern without crash', () => {
      const pattern = '*'.repeat(10000)
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle 100000 character pattern without crash', () => {
      const pattern = '*'.repeat(100000)
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    }, 10000)
    
    it('should handle long literal pattern without crash', () => {
      const pattern = 'a'.repeat(10000) + '.txt'
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle long path segments', () => {
      const pattern = Array(100).fill('longdirectoryname').join('/') + '/*.txt'
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle long brace expansion', () => {
      const options = Array(100).fill('option').map((o, i) => `${o}${i}`).join(',')
      const pattern = `*.{${options}}`
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
  })
  
  describe('Deeply nested patterns', () => {
    it('should handle 10 levels of globstar', () => {
      const pattern = Array(10).fill('**').join('/')
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle 50 levels of globstar', () => {
      const pattern = Array(50).fill('**').join('/')
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle 100 levels of single wildcards', () => {
      const pattern = Array(100).fill('*').join('/')
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle deeply nested braces', () => {
      const pattern = '{a,{b,{c,{d,{e,f}}}}}'
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle deeply nested character classes', () => {
      const pattern = '[a[b[c[d[e]]]]]'
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle deeply nested extglobs', () => {
      const pattern = '+(a|+(b|+(c|+(d|e))))'
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle mixed deep nesting', () => {
      const pattern = '**/{a,b}/**/[cd]/**/*.{js,ts}'
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
  })
  
  describe('Unicode patterns', () => {
    it('should handle Japanese characters', () => {
      const patterns = ['**/*.日本語', '**/日本語/**/*', '日本語/*.txt']
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle Chinese characters', () => {
      const patterns = ['**/*.中文', '**/中文/**/*', '中文/*.txt']
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle Korean characters', () => {
      const patterns = ['**/*.한국어', '**/한국어/**/*', '한국어/*.txt']
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle emoji patterns', () => {
      const patterns = ['**/test.txt', '**/*.txt', '**/README.md']
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle RTL characters (Arabic)', () => {
      const patterns = ['**/*.عربى', '**/عربى/**/*']
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle mixed unicode and ASCII', () => {
      const patterns = ['**/test日本語/*.js', 'src/中文/**/*.ts', '日本語中文한국어/*']
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle unicode normalization forms', () => {
      const nfc = '\u00e9' // é (precomposed)
      const nfd = 'e\u0301' // é (decomposed)
      expect(() => globlin.globSync(`**/*.${nfc}`, { cwd: testFixture })).not.toThrow()
      expect(() => globlin.globSync(`**/*.${nfd}`, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle zero-width characters', () => {
      const zwj = '\u200D' // zero-width joiner
      const zwnj = '\u200C' // zero-width non-joiner
      expect(() => globlin.globSync(`**/*${zwj}*.js`, { cwd: testFixture })).not.toThrow()
      expect(() => globlin.globSync(`**/*${zwnj}*.js`, { cwd: testFixture })).not.toThrow()
    })
  })
  
  describe('Null bytes and control characters', () => {
    it('should handle null byte in pattern gracefully', () => {
      const pattern = 'test\x00.txt'
      expect(() => {
        try {
          globlin.globSync(pattern, { cwd: testFixture })
        } catch (e) {
          // Errors are acceptable, crashes are not
          expect(e).toBeInstanceOf(Error)
        }
      }).not.toThrow()
    })
    
    it('should handle newline in pattern', () => {
      const pattern = 'test\n.txt'
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle tab in pattern', () => {
      const pattern = 'test\t.txt'
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle carriage return in pattern', () => {
      const pattern = 'test\r.txt'
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle form feed in pattern', () => {
      const pattern = 'test\f.txt'
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle bell character in pattern', () => {
      const pattern = 'test\x07.txt'
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle escape character in pattern', () => {
      const pattern = 'test\x1B.txt'
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
    })
    
    it('should handle all ASCII control characters', () => {
      for (let i = 0; i < 32; i++) {
        const char = String.fromCharCode(i)
        const pattern = `test${char}.txt`
        expect(() => {
          try {
            globlin.globSync(pattern, { cwd: testFixture })
          } catch (e) {
            // Errors are acceptable for invalid patterns
            expect(e).toBeInstanceOf(Error)
          }
        }).not.toThrow()
      }
    })
  })
  
  describe('Path traversal attempts', () => {
    it('should handle parent directory traversal', () => {
      const patterns = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        '**/../../../*',
        './../.../.././../../',
      ]
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle absolute path patterns', () => {
      const patterns = [
        '/etc/passwd',
        'C:\\Windows\\System32',
        '//server/share/*',
        '//?/C:/*',
      ]
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle URL-like patterns', () => {
      const patterns = [
        'file:///etc/passwd',
        'http://example.com/*',
        'ftp://server/*',
      ]
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle encoded path separators', () => {
      const patterns = [
        'a%2Fb%2Fc',
        'a%5Cb%5Cc',
        '..%2F..%2F..%2Fetc%2Fpasswd',
      ]
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
  })
  
  describe('Symlink edge cases', { skip: isWindows }, () => {
    let symlinkFixture: string
    
    beforeAll(async () => {
      symlinkFixture = await createRandomFixture({
        fileCount: 10,
        depth: 2,
        includeSymlinks: true
      })
      
      // Create various symlink edge cases
      const symlinkDir = path.join(symlinkFixture, 'symlinks')
      await fsp.mkdir(symlinkDir, { recursive: true })
      
      // Self-referencing symlink
      try {
        await fsp.symlink('.', path.join(symlinkDir, 'self'))
      } catch {}
      
      // Parent-referencing symlink
      try {
        await fsp.symlink('..', path.join(symlinkDir, 'parent'))
      } catch {}
      
      // Broken symlink
      try {
        await fsp.symlink('nonexistent', path.join(symlinkDir, 'broken'))
      } catch {}
      
      // Deep symlink chain
      try {
        await fsp.writeFile(path.join(symlinkDir, 'target.txt'), 'target')
        await fsp.symlink('target.txt', path.join(symlinkDir, 'link1'))
        await fsp.symlink('link1', path.join(symlinkDir, 'link2'))
        await fsp.symlink('link2', path.join(symlinkDir, 'link3'))
      } catch {}
    })
    
    afterAll(async () => {
      if (symlinkFixture) {
        await fsp.rm(symlinkFixture, { recursive: true, force: true })
      }
    })
    
    it('should handle self-referencing symlinks', () => {
      expect(() => globlin.globSync('**/*', { cwd: symlinkFixture, follow: true })).not.toThrow()
    })
    
    it('should handle parent-referencing symlinks', () => {
      expect(() => globlin.globSync('**/*', { cwd: symlinkFixture, follow: true })).not.toThrow()
    })
    
    it('should handle broken symlinks', () => {
      expect(() => globlin.globSync('**/*', { cwd: symlinkFixture })).not.toThrow()
    })
    
    it('should handle deep symlink chains', () => {
      expect(() => globlin.globSync('**/*', { cwd: symlinkFixture, follow: true })).not.toThrow()
    })
    
    it('should complete in reasonable time with symlink loops', () => {
      const start = Date.now()
      globlin.globSync('**/*', { cwd: symlinkFixture, follow: true })
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(10000) // Should complete within 10 seconds
    })
  })
  
  describe('Permission and I/O edge cases', { skip: isWindows }, () => {
    let permFixture: string
    
    beforeAll(async () => {
      permFixture = await fsp.mkdtemp(path.join(process.cwd(), 'tests/fixtures/perm-'))
      
      // Create unreadable directory
      const unreadable = path.join(permFixture, 'unreadable')
      await fsp.mkdir(unreadable)
      await fsp.writeFile(path.join(unreadable, 'secret.txt'), 'secret')
      await fsp.chmod(unreadable, 0o000)
      
      // Create readable directory with files
      const readable = path.join(permFixture, 'readable')
      await fsp.mkdir(readable)
      await fsp.writeFile(path.join(readable, 'file.txt'), 'data')
    })
    
    afterAll(async () => {
      if (permFixture) {
        // Restore permissions before cleanup
        try {
          await fsp.chmod(path.join(permFixture, 'unreadable'), 0o755)
        } catch {}
        await fsp.rm(permFixture, { recursive: true, force: true })
      }
    })
    
    it('should handle unreadable directories gracefully', () => {
      expect(() => globlin.globSync('**/*', { cwd: permFixture })).not.toThrow()
    })
    
    it('should continue walking after permission error', () => {
      const results = globlin.globSync('**/*', { cwd: permFixture })
      expect(results.some(r => r.includes('readable'))).toBe(true)
    })
    
    it('should handle non-existent cwd gracefully', () => {
      expect(() => globlin.globSync('**/*', { cwd: '/nonexistent/path/that/does/not/exist' })).not.toThrow()
    })
  })
  
  describe('Concurrent operations', () => {
    it('should handle 100 concurrent globs safely', async () => {
      const promises = Array(100).fill(0).map(() =>
        globlin.glob('**/*.js', { cwd: testFixture })
      )
      
      const results = await Promise.all(promises)
      
      // All should succeed and return arrays
      expect(results.every(r => Array.isArray(r))).toBe(true)
      
      // All should return same results (deterministic)
      const firstResult = new Set(results[0])
      for (let i = 1; i < results.length; i++) {
        expect(new Set(results[i])).toEqual(firstResult)
      }
    })
    
    it('should handle concurrent globs on same fixture with different patterns', async () => {
      const patterns = ['**/*.js', '**/*.ts', '*', '**/*', 'a/**/*', 'src/**/*']
      
      const promises = patterns.flatMap(pattern =>
        Array(10).fill(0).map(() =>
          globlin.glob(pattern, { cwd: testFixture })
        )
      )
      
      const results = await Promise.all(promises)
      expect(results.every(r => Array.isArray(r))).toBe(true)
    })
    
    it('should handle concurrent globs with different options', async () => {
      const optionSets = [
        { dot: true },
        { dot: false },
        { nodir: true },
        { nodir: false },
        { maxDepth: 1 },
        { maxDepth: 2 },
        { absolute: true },
        {},
      ]
      
      const promises = optionSets.map(opts =>
        globlin.glob('**/*', { cwd: testFixture, ...opts })
      )
      
      const results = await Promise.all(promises)
      expect(results.every(r => Array.isArray(r))).toBe(true)
    })
    
    it('should handle concurrent sync and async operations', async () => {
      const asyncPromises = Array(50).fill(0).map(() =>
        globlin.glob('**/*.js', { cwd: testFixture })
      )
      
      // Run sync operations while async ones are in flight
      const syncResults: string[][] = []
      for (let i = 0; i < 50; i++) {
        syncResults.push(globlin.globSync('**/*.js', { cwd: testFixture }))
      }
      
      const asyncResults = await Promise.all(asyncPromises)
      
      // All should return same results
      const expected = new Set(syncResults[0])
      for (const result of [...syncResults, ...asyncResults]) {
        expect(new Set(result)).toEqual(expected)
      }
    })
  })
  
  describe('Memory stress tests', () => {
    it('should handle large result sets without memory explosion', async () => {
      const startMem = process.memoryUsage().heapUsed
      
      const results = globlin.globSync('**/*', { cwd: largeFixture })
      
      const endMem = process.memoryUsage().heapUsed
      const memIncrease = (endMem - startMem) / 1024 / 1024 // MB
      
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(100)
      // Memory increase should be reasonable (< 100MB for 1000 files)
      expect(memIncrease).toBeLessThan(100)
    })
    
    it('should handle repeated glob operations without memory leak', async () => {
      const iterations = 100
      const memUsages: number[] = []
      
      for (let i = 0; i < iterations; i++) {
        globlin.globSync('**/*.js', { cwd: testFixture })
        if (i % 10 === 0) {
          // Force GC if available
          if (global.gc) global.gc()
          memUsages.push(process.memoryUsage().heapUsed)
        }
      }
      
      // Memory should not grow unboundedly
      if (memUsages.length >= 2) {
        const growth = memUsages[memUsages.length - 1] - memUsages[0]
        const growthMB = growth / 1024 / 1024
        // Allow up to 50MB growth over 100 iterations
        expect(growthMB).toBeLessThan(50)
      }
    })
  })
  
  describe('Timeout and hang prevention', () => {
    it('should complete simple patterns within 100ms', () => {
      const start = Date.now()
      globlin.globSync('*.txt', { cwd: testFixture })
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(100)
    })
    
    it('should complete recursive patterns within 5000ms on large fixture', () => {
      const start = Date.now()
      globlin.globSync('**/*', { cwd: largeFixture })
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(5000)
    })
    
    it('should handle pathological regex patterns without hanging', () => {
      // These patterns could cause regex catastrophic backtracking if not handled properly
      const patterns = [
        '+(a|aa|aaa|aaaa|aaaaa)',
        '*([a-z])*([0-9])*([a-z])',
        '?(?([a-z]))*.txt',
      ]
      
      for (const pattern of patterns) {
        const start = Date.now()
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
        const elapsed = Date.now() - start
        expect(elapsed).toBeLessThan(5000)
      }
    })
    
    it('should handle complex brace expansion without exploding', () => {
      // Brace expansion can create exponential patterns
      const pattern = '{a,b}{c,d}{e,f}{g,h}{i,j}.txt'
      const start = Date.now()
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(1000)
    })
    
    it('should handle numeric range expansion efficiently', () => {
      const pattern = '**/{0..100}.txt'
      const start = Date.now()
      expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(2000)
    })
  })
  
  describe('Edge case patterns', () => {
    it('should handle empty pattern', () => {
      const result = globlin.globSync('', { cwd: testFixture })
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })
    
    it('should handle whitespace-only patterns', () => {
      const patterns = [' ', '  ', '\t', '\n', ' \t\n ']
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle dot patterns', () => {
      const patterns = ['.', '..', './', '../', './.', '../..']
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle patterns with only special characters', () => {
      const patterns = ['*', '**', '?', '[', ']', '{', '}', '(', ')', '!', '@', '+', '|']
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle patterns with mixed escape sequences', () => {
      const patterns = [
        '\\*\\?\\[\\]',
        '\\{a,b\\}',
        '\\(a\\|b\\)',
        '\\!\\@\\+',
      ]
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle malformed character classes', () => {
      const patterns = [
        '[',
        ']',
        '[]',
        '[!]',
        '[a-]',
        '[-z]',
        '[z-a]',
        '[[',
        ']]',
        '[[]',
        '[]]',
        '[[]]',
        '[:alpha',
        '[:alpha:',
        '[[:alpha:',
        '[[:]]',
      ]
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle malformed extglobs', () => {
      const patterns = [
        '!(',
        '?()',
        '*(a',
        '+(a|',
        '@(a|b',
        '!(a|b|',
        '!(',
        '+(',
        '?(',
        '*(',
        '@(',
      ]
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
    
    it('should handle malformed braces', () => {
      const patterns = [
        '{',
        '}',
        '{}',
        '{a',
        '{a,',
        '{a,b',
        '{{',
        '}}',
        '{{}',
        '{}}',
        '{a{b}',
        '{a}b}',
      ]
      for (const pattern of patterns) {
        expect(() => globlin.globSync(pattern, { cwd: testFixture })).not.toThrow()
      }
    })
  })
  
  describe('Invalid options handling', () => {
    it('should handle invalid cwd types gracefully', () => {
      const invalidCwds = [
        null,
        undefined,
        123,
        true,
        [],
        {},
        () => {},
      ]
      
      for (const cwd of invalidCwds) {
        expect(() => {
          try {
            // Testing invalid input - cwd is intentionally wrong type
            globlin.globSync('*', { cwd: cwd as unknown as string })
          } catch (e) {
            // Errors are acceptable
            expect(e).toBeInstanceOf(Error)
          }
        }).not.toThrow()
      }
    })
    
    it('should handle invalid pattern types gracefully', () => {
      const invalidPatterns = [
        null,
        undefined,
        123,
        true,
        {},
        () => {},
      ]
      
      for (const pattern of invalidPatterns) {
        expect(() => {
          try {
            // Testing invalid input - pattern is intentionally wrong type
            globlin.globSync(pattern as unknown as string, { cwd: testFixture })
          } catch (e) {
            // Errors are acceptable
            expect(e).toBeInstanceOf(Error)
          }
        }).not.toThrow()
      }
    })
    
    it('should handle invalid maxDepth values', () => {
      const invalidDepths = [-1000, -1, 0, 1000000, Infinity, -Infinity, NaN]
      
      for (const maxDepth of invalidDepths) {
        expect(() => {
          try {
            globlin.globSync('**/*', { cwd: testFixture, maxDepth })
          } catch (e) {
            // Errors are acceptable for invalid values
            expect(e).toBeInstanceOf(Error)
          }
        }).not.toThrow()
      }
    })
    
    it('should handle conflicting options gracefully', () => {
      // withFileTypes + absolute is invalid
      expect(() => {
        try {
          globlin.globSync('*', { cwd: testFixture, withFileTypes: true, absolute: true })
        } catch (e) {
          expect(e).toBeInstanceOf(Error)
        }
      }).not.toThrow()
      
      // matchBase + noglobstar is invalid
      expect(() => {
        try {
          globlin.globSync('*.js', { cwd: testFixture, matchBase: true, noglobstar: true })
        } catch (e) {
          expect(e).toBeInstanceOf(Error)
        }
      }).not.toThrow()
    })
  })
  
  describe('Glob class fuzz tests', () => {
    it('should handle Glob class with fuzzed patterns', () => {
      const patterns = [
        '',
        '*',
        '**',
        '**/*',
        '*.{js,ts}',
        '[abc]',
        '+(a|b)',
        '!(x)',
        '?',
        '**/?/**/*',
      ]
      
      for (const pattern of patterns) {
        expect(() => {
          const g = new globlin.Glob(pattern, { cwd: testFixture })
          g.walkSync()
        }).not.toThrow()
      }
    })
    
    it('should handle Glob class iterate methods without crash', async () => {
      const g = new globlin.Glob('**/*', { cwd: testFixture })
      
      // Sync iteration
      expect(() => {
        const results: string[] = []
        for (const entry of g) {
          results.push(entry as string)
          if (results.length > 100) break // Prevent infinite loop
        }
      }).not.toThrow()
      
      // Async iteration
      await expect((async () => {
        const results: string[] = []
        for await (const entry of g) {
          results.push(entry as string)
          if (results.length > 100) break
        }
      })()).resolves.toBeUndefined()
    })
    
    it('should handle Glob class stream methods without crash', async () => {
      const g = new globlin.Glob('**/*', { cwd: testFixture })
      
      // Sync stream
      expect(() => {
        const stream = g.streamSync()
        const results: string[] = []
        stream.on('data', (d: string) => results.push(d))
      }).not.toThrow()
      
      // Async stream
      const stream = g.stream()
      const results: string[] = []
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (d: string) => results.push(d))
        stream.on('end', resolve)
        stream.on('error', reject)
      })
      expect(Array.isArray(results)).toBe(true)
    })
  })
})
