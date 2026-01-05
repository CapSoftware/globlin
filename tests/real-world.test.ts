/**
 * Real-world scenario tests for globlin.
 * 
 * Tests actual project structures:
 * - Monorepo with multiple packages
 * - Build output directories
 * - Git repositories with .gitignore
 * - Large file counts
 * - Concurrent operations
 * 
 * All fixtures are REAL files on disk - no mocks or simulations.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { glob as globOriginal, globSync as globSyncOriginal } from 'glob'
import * as fs from 'fs'
import * as path from 'path'

import {
  createMonorepoFixture,
  createBuildOutputFixture,
  createGitRepoFixture,
  readGitignore,
} from './fixtures.js'
import {
  createLargeFixture,
  loadGloblin,
  compareTiming,
  cleanupFixture,
  type GloblinModule,
} from './harness.js'

const fsp = fs.promises

describe('Real-world scenarios', () => {
  let globlin: GloblinModule

  beforeAll(async () => {
    globlin = await loadGloblin()
  })

  describe('Monorepo globbing', () => {
    let fixture: string

    beforeAll(async () => {
      fixture = await createMonorepoFixture({
        packages: 50,
        filesPerPackage: 100,
        nodeModulesDepth: 3
      })
    }, 120000) // 2 minute timeout for fixture creation

    afterAll(async () => {
      if (fixture) {
        await cleanupFixture(fixture)
      }
    })

    it('should handle packages/*/src/**/*.ts pattern', async () => {
      const pattern = 'packages/*/src/**/*.ts'
      const options = { cwd: fixture }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.length).toBeGreaterThan(0)
      expect(globlinResults.every(r => r.includes('/src/') && r.endsWith('.ts'))).toBe(true)
    })

    it('should handle pattern with ignore for node_modules', async () => {
      const pattern = 'packages/*/src/**/*.ts'
      const options = {
        cwd: fixture,
        ignore: ['**/node_modules/**', '**/*.test.ts']
      }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.some(r => r.includes('node_modules'))).toBe(false)
      expect(globlinResults.some(r => r.includes('.test.ts'))).toBe(false)
    })

    it('should handle brace expansion across packages', async () => {
      const pattern = 'packages/*/{src,test}/**/*.{ts,tsx}'
      const options = { cwd: fixture }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.length).toBeGreaterThan(0)
    })

    it('should handle sync API for monorepo pattern', () => {
      const pattern = 'packages/*/src/**/*.ts'
      const options = { cwd: fixture }

      const globResults = globSyncOriginal(pattern, options) as string[]
      const globlinResults = globlin.globSync(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should match glob results for complex monorepo patterns', async () => {
      const patterns = [
        'packages/*/package.json',
        '**/src/**/*.{ts,tsx}',
        'packages/package-*/src/*.ts',
      ]

      for (const pattern of patterns) {
        const globResults = await globOriginal(pattern, { cwd: fixture }) as string[]
        const globlinResults = await globlin.glob(pattern, { cwd: fixture })
        expect(new Set(globlinResults)).toEqual(new Set(globResults))
      }
    })
  })

  describe('Build output globbing', () => {
    let fixture: string

    beforeAll(async () => {
      fixture = await createBuildOutputFixture({
        sourceFiles: 1000,
        generateDts: true,
        generateMaps: true
      })
    }, 60000)

    afterAll(async () => {
      if (fixture) {
        await cleanupFixture(fixture)
      }
    })

    it('should find all JS files in dist', async () => {
      const pattern = 'dist/**/*.js'
      const options = { cwd: fixture }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.length).toBeGreaterThan(0)
      expect(globlinResults.every(r => r.endsWith('.js'))).toBe(true)
    })

    it('should find JS files excluding source maps', async () => {
      const pattern = 'dist/**/*.js'
      const options = {
        cwd: fixture,
        ignore: ['**/*.map']
      }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.every(r => !r.endsWith('.map'))).toBe(true)
    })

    it('should find all TypeScript declaration files', async () => {
      const pattern = 'dist/**/*.d.ts'
      const options = { cwd: fixture }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.length).toBeGreaterThan(0)
      expect(globlinResults.every(r => r.endsWith('.d.ts'))).toBe(true)
    })

    it('should handle multiple output types with brace expansion', async () => {
      const pattern = 'dist/**/*.{js,d.ts}'
      const options = {
        cwd: fixture,
        ignore: ['**/*.map']
      }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.every(r => r.endsWith('.js') || r.endsWith('.d.ts'))).toBe(true)
    })

    it('should handle source vs dist separation', async () => {
      const srcPattern = 'src/**/*.ts'
      const distPattern = 'dist/**/*.js'

      const srcGlob = await globOriginal(srcPattern, { cwd: fixture }) as string[]
      const distGlob = await globOriginal(distPattern, { cwd: fixture }) as string[]
      const srcGloblin = await globlin.glob(srcPattern, { cwd: fixture })
      const distGloblin = await globlin.glob(distPattern, { cwd: fixture })

      expect(new Set(srcGloblin)).toEqual(new Set(srcGlob))
      expect(new Set(distGloblin)).toEqual(new Set(distGlob))
      expect(srcGloblin.length).toBe(distGloblin.length)
    })
  })

  describe('Git repository globbing', () => {
    let fixture: string

    beforeAll(async () => {
      fixture = await createGitRepoFixture({
        trackedFiles: 500,
        ignoredPatterns: ['node_modules', '*.log', 'dist/', '.env']
      })
    }, 60000)

    afterAll(async () => {
      if (fixture) {
        await cleanupFixture(fixture)
      }
    })

    it('should handle .gitignore-style patterns', async () => {
      // Use standard glob ignore patterns instead of reading gitignore
      // (gitignore has different syntax than glob)
      const ignorePatterns = [
        '**/node_modules/**',
        '**/*.log',
        '**/dist/**',
        '**/.env',
      ]

      const pattern = '**/*'
      const options = {
        cwd: fixture,
        ignore: ignorePatterns,
        dot: true,
        nodir: true, // Only check files, not directories
      }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.some(r => r.includes('node_modules'))).toBe(false)
      expect(globlinResults.some(r => r.endsWith('.log'))).toBe(false)
    })

    it('should find all tracked source files', async () => {
      const pattern = '**/*.{ts,js,json,md}'
      const options = {
        cwd: fixture,
        ignore: ['**/node_modules/**', '**/dist/**']
      }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.length).toBeGreaterThan(0)
    })

    it('should handle dot option for hidden files', async () => {
      const pattern = '**/*'
      const options = { cwd: fixture, dot: true }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      const hiddenFiles = globlinResults.filter(r =>
        path.basename(r).startsWith('.') ||
        r.split('/').some(part => part.startsWith('.'))
      )
      expect(hiddenFiles.length).toBeGreaterThan(0)
    })

    it('should exclude ignored directories with nodir', async () => {
      const pattern = '**/*'
      const options = {
        cwd: fixture,
        ignore: ['**/node_modules/**', '**/dist/**'],
        nodir: true
      }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.every(r => !r.includes('node_modules'))).toBe(true)
    })
  })

  describe('Large file count handling', () => {
    let fixture: string

    beforeAll(async () => {
      fixture = await createLargeFixture(100000, {
        maxDepth: 7,
        extensions: ['js', 'ts', 'txt', 'json'],
        name: 'real-world-large'
      })
    }, 300000) // 5 minute timeout for 100k files

    afterAll(async () => {
      if (fixture) {
        await cleanupFixture(fixture)
      }
    }, 60000)

    it('should handle 100k files without excessive memory', async () => {
      const startMem = process.memoryUsage().heapUsed

      const results = await globlin.glob('**/*.txt', { cwd: fixture })

      const endMem = process.memoryUsage().heapUsed
      const memIncrease = (endMem - startMem) / 1024 / 1024 // MB

      expect(memIncrease).toBeLessThan(200) // <200MB for 100k files
      expect(results.length).toBeGreaterThan(10000)
    })

    it('should match glob results on large fixture', async () => {
      const pattern = '**/*.js'
      const options = { cwd: fixture }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.length).toBeGreaterThan(20000)
    })

    it('should handle recursive patterns efficiently', async () => {
      const { globTime, globlinTime, speedup } = await compareTiming(
        '**/*.ts',
        {},
        fixture
      )

      // Should be faster than glob (or at least competitive)
      expect(speedup).toBeGreaterThan(0.5)

      console.log(`Large fixture timing - glob: ${globTime.toFixed(2)}ms, globlin: ${globlinTime.toFixed(2)}ms, speedup: ${speedup.toFixed(2)}x`)
    })

    it('should handle sync API on large fixture', () => {
      const startTime = performance.now()
      const results = globlin.globSync('**/*.json', { cwd: fixture })
      const endTime = performance.now()

      expect(results.length).toBeGreaterThan(20000)
      expect(endTime - startTime).toBeLessThan(10000) // <10s
    })

    it('should handle multiple patterns on large fixture', async () => {
      const patterns = ['**/*.js', '**/*.ts']
      const options = { cwd: fixture }

      const globResults = await globOriginal(patterns, options) as string[]
      const globlinResults = await globlin.glob(patterns, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('Concurrent operations', () => {
    let fixture: string

    beforeAll(async () => {
      fixture = await createLargeFixture(10000, {
        maxDepth: 5,
        extensions: ['js', 'ts', 'txt', 'json', 'tsx'],
        name: 'real-world-concurrent'
      })
    }, 120000)

    afterAll(async () => {
      if (fixture) {
        await cleanupFixture(fixture)
      }
    })

    it('should handle many concurrent globs safely', async () => {
      const patterns = [
        '**/*.js',
        '**/*.ts',
        '**/*.txt',
        '**/*.json',
        '**/*.tsx',
      ]

      const results = await Promise.all(
        patterns.flatMap(pattern =>
          Array(20).fill(0).map(() =>
            globlin.glob(pattern, { cwd: fixture })
          )
        )
      )

      expect(results.every(r => Array.isArray(r))).toBe(true)
      expect(results.length).toBe(100)

      // Verify results are consistent (same pattern = same results)
      for (let i = 0; i < patterns.length; i++) {
        const patternResults = results.slice(i * 20, (i + 1) * 20)
        const first = new Set(patternResults[0])
        for (const result of patternResults) {
          expect(new Set(result)).toEqual(first)
        }
      }
    })

    it('should handle concurrent different patterns', async () => {
      const patterns = [
        '**/*.js',
        '**/level0/**/*.ts',
        '**/level1/**/*.txt',
        '**/*.{json,js}',
        '**/file[0-9].ts',
      ]

      const results = await Promise.all(
        patterns.map(pattern => globlin.glob(pattern, { cwd: fixture }))
      )

      expect(results.every(r => Array.isArray(r))).toBe(true)

      for (let i = 0; i < patterns.length; i++) {
        const globResult = await globOriginal(patterns[i], { cwd: fixture }) as string[]
        expect(new Set(results[i])).toEqual(new Set(globResult))
      }
    })

    it('should handle mixed sync/async operations', async () => {
      const asyncPattern = '**/*.js'
      const syncPattern = '**/*.ts'

      const asyncPromise = globlin.glob(asyncPattern, { cwd: fixture })
      const syncResult = globlin.globSync(syncPattern, { cwd: fixture })
      const asyncResult = await asyncPromise

      const asyncGlob = await globOriginal(asyncPattern, { cwd: fixture }) as string[]
      const syncGlob = globSyncOriginal(syncPattern, { cwd: fixture }) as string[]

      expect(new Set(asyncResult)).toEqual(new Set(asyncGlob))
      expect(new Set(syncResult)).toEqual(new Set(syncGlob))
    })

    it('should handle concurrent operations with different options', async () => {
      const baseOptions = { cwd: fixture }

      const results = await Promise.all([
        globlin.glob('**/*.js', baseOptions),
        globlin.glob('**/*.js', { ...baseOptions, dot: true }),
        globlin.glob('**/*.js', { ...baseOptions, nodir: true }),
        globlin.glob('**/*.js', { ...baseOptions, absolute: true }),
        globlin.glob('**/*.js', { ...baseOptions, ignore: ['**/level0/**'] }),
      ])

      expect(results.every(r => Array.isArray(r))).toBe(true)

      // Verify each has correct behavior
      expect(results[3].every(r => path.isAbsolute(r))).toBe(true) // absolute
      expect(results[4].every(r => !r.includes('level0/'))).toBe(true) // ignore
    })

    it('should maintain consistency under heavy load', async () => {
      const pattern = '**/*.txt'
      const options = { cwd: fixture }

      // Run 50 concurrent operations
      const promises = Array(50).fill(0).map(() => globlin.glob(pattern, options))
      const results = await Promise.all(promises)

      // All should return same results
      const expected = new Set(results[0])
      for (let i = 1; i < results.length; i++) {
        expect(new Set(results[i])).toEqual(expected)
      }
    })
  })

  describe('Real-world pattern combinations', () => {
    let fixture: string

    beforeAll(async () => {
      fixture = await createMonorepoFixture({
        packages: 20,
        filesPerPackage: 50,
        nodeModulesDepth: 2
      })
    }, 120000)

    afterAll(async () => {
      if (fixture) {
        await cleanupFixture(fixture)
      }
    })

    it('should handle typical eslint file patterns', async () => {
      const pattern = '**/*.{js,jsx,ts,tsx}'
      const options = {
        cwd: fixture,
        ignore: [
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/*.d.ts',
        ]
      }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should handle typical jest file patterns', async () => {
      // Use simpler pattern to match test files
      const pattern = '**/*.test.{ts,tsx}'
      const options = {
        cwd: fixture,
        ignore: ['**/node_modules/**']
      }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.length).toBeGreaterThan(0)
    })

    it('should handle typical webpack entry patterns', async () => {
      const pattern = 'packages/*/src/index.{ts,tsx,js,jsx}'
      const options = { cwd: fixture }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should handle typical tsconfig include patterns', async () => {
      const pattern = 'packages/*/src/**/*'
      const options = {
        cwd: fixture,
        nodir: true
      }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should handle typical npm workspaces pattern', async () => {
      const pattern = 'packages/*/package.json'
      const options = { cwd: fixture }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.length).toBe(20) // 20 packages
    })

    it('should handle typical vite/rollup input patterns', async () => {
      const pattern = 'packages/**/src/*.{ts,tsx}'
      const options = {
        cwd: fixture,
        ignore: ['**/node_modules/**']
      }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })

  describe('Edge cases in real projects', () => {
    let fixture: string

    beforeAll(async () => {
      const fixturePath = path.join(__dirname, 'fixtures', 'edge-cases', `run-${Date.now()}`)
      await fsp.mkdir(fixturePath, { recursive: true })

      // Create edge case scenarios
      // Deep nesting
      const deepPath = path.join(fixturePath, 'deep', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h')
      await fsp.mkdir(deepPath, { recursive: true })
      await fsp.writeFile(path.join(deepPath, 'file.ts'), '')

      // Many files in one directory
      const flatDir = path.join(fixturePath, 'flat')
      await fsp.mkdir(flatDir, { recursive: true })
      for (let i = 0; i < 1000; i++) {
        await fsp.writeFile(path.join(flatDir, `file${i}.js`), '')
      }

      // Mixed extensions
      const mixedDir = path.join(fixturePath, 'mixed')
      await fsp.mkdir(mixedDir, { recursive: true })
      const exts = ['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs', 'mts', 'cts', 'json', 'md', 'txt']
      for (const ext of exts) {
        await fsp.writeFile(path.join(mixedDir, `index.${ext}`), '')
      }

      // Dot directories
      const dotDir = path.join(fixturePath, '.hidden', '.nested', '.deep')
      await fsp.mkdir(dotDir, { recursive: true })
      await fsp.writeFile(path.join(dotDir, '.file'), '')
      await fsp.writeFile(path.join(dotDir, 'visible.ts'), '')

      // Special characters (safe ones)
      const specialDir = path.join(fixturePath, 'special')
      await fsp.mkdir(specialDir, { recursive: true })
      await fsp.writeFile(path.join(specialDir, 'file-with-dashes.ts'), '')
      await fsp.writeFile(path.join(specialDir, 'file_with_underscores.ts'), '')
      await fsp.writeFile(path.join(specialDir, 'file.multiple.dots.ts'), '')
      await fsp.writeFile(path.join(specialDir, 'UPPERCASE.TS'), '')

      fixture = fixturePath
    }, 60000)

    afterAll(async () => {
      if (fixture) {
        await cleanupFixture(fixture)
      }
    })

    it('should handle deeply nested directories', async () => {
      const pattern = 'deep/**/*.ts'
      const options = { cwd: fixture }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.length).toBe(1)
    })

    it('should handle many files in flat directory', async () => {
      const pattern = 'flat/*.js'
      const options = { cwd: fixture }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.length).toBe(1000)
    })

    it('should handle mixed extensions', async () => {
      const pattern = 'mixed/index.*'
      const options = { cwd: fixture }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.length).toBe(11)
    })

    it('should handle dot directories with dot option', async () => {
      const pattern = '.hidden/**/*'
      const options = { cwd: fixture, dot: true }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.some(r => r.includes('.file'))).toBe(true)
    })

    it('should handle special characters in filenames', async () => {
      const pattern = 'special/**/*'
      const options = { cwd: fixture, nodir: true }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      expect(globlinResults.length).toBe(4)
    })

    it('should handle case sensitivity correctly', async () => {
      const patternLower = 'special/**/*.ts'
      const patternUpper = 'special/**/*.TS'
      const options = { cwd: fixture, nocase: true }

      const globResults = await globOriginal(patternLower, options) as string[]
      const globlinResults = await globlin.glob(patternLower, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should handle maxDepth correctly', async () => {
      const pattern = '**/*.ts'
      const options = { cwd: fixture, maxDepth: 3 }

      const globResults = await globOriginal(pattern, options) as string[]
      const globlinResults = await globlin.glob(pattern, options)

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
      // Should not include deeply nested file
      expect(globlinResults.some(r => r.includes('deep/a/b/c/d'))).toBe(false)
    })
  })
})
