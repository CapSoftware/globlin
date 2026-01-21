import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { glob as nodeGlob } from 'glob'
import {
  loadGloblin,
  createTestFixture,
  cleanupFixture,
  FixtureConfig,
  normalizePaths,
} from '../harness'
import * as path from 'path'

describe('ignore with /** suffix behavior', () => {
  let globlin: Awaited<ReturnType<typeof loadGloblin>>
  let fixturePath: string

  beforeAll(async () => {
    globlin = await loadGloblin()

    // Create a fixture with a typical node_modules-like structure
    const config: FixtureConfig = {
      files: [
        'src/index.ts',
        'src/utils.ts',
        'src/components/Button.tsx',
        'src/components/Input.tsx',
        'node_modules/lodash/index.js',
        'node_modules/lodash/package.json',
        'node_modules/lodash/dist/lodash.min.js',
        'node_modules/react/index.js',
        'node_modules/react/package.json',
        'node_modules/react/cjs/react.development.js',
        'dist/bundle.js',
        'dist/bundle.min.js',
        'tmp/cache/data.json',
        'tmp/logs/app.log',
        'package.json',
        'README.md',
      ],
    }

    fixturePath = await createTestFixture('ignore-globstar-suffix', config)
  })

  afterAll(async () => {
    if (fixturePath) {
      await cleanupFixture(fixturePath)
    }
  })

  describe('/** suffix vs exact match', () => {
    it('ignore "node_modules/**" excludes node_modules and all children', async () => {
      const results = await globlin.glob('**', {
        cwd: fixturePath,
        ignore: 'node_modules/**',
        posix: true,
      })
      const sorted = results.sort()

      // node_modules directory and all its children should be excluded
      expect(sorted.filter(r => r.includes('node_modules'))).toEqual([])

      // Other files should be present
      expect(sorted).toContain('src')
      expect(sorted).toContain('src/index.ts')
      expect(sorted).toContain('dist')
      expect(sorted).toContain('package.json')
    })

    it('ignore "node_modules" only excludes exact match, not children', async () => {
      const results = await globlin.glob('**', {
        cwd: fixturePath,
        ignore: 'node_modules',
        posix: true,
      })
      const sorted = results.sort()

      // node_modules directory itself should be excluded
      expect(sorted).not.toContain('node_modules')

      // But children of node_modules SHOULD still be present
      expect(sorted.filter(r => r.startsWith('node_modules/'))).toContain('node_modules/lodash')
      expect(sorted.filter(r => r.startsWith('node_modules/'))).toContain(
        'node_modules/lodash/index.js'
      )
    })

    it('ignore "dist/**" excludes dist and all children', async () => {
      const results = await globlin.glob('**/*.js', {
        cwd: fixturePath,
        ignore: 'dist/**',
        posix: true,
      })
      const sorted = results.sort()

      // dist/ files should be excluded
      expect(sorted.filter(r => r.startsWith('dist/'))).toEqual([])

      // Other .js files should be present
      expect(sorted.some(r => r.includes('node_modules'))).toBe(true)
    })

    it('ignore "dist" only excludes exact match', async () => {
      const results = await globlin.glob('**/*.js', {
        cwd: fixturePath,
        ignore: 'dist',
        posix: true,
      })
      const sorted = results.sort()

      // Files under dist should still be present (only "dist" itself is ignored)
      expect(sorted.filter(r => r.startsWith('dist/'))).toContain('dist/bundle.js')
      expect(sorted.filter(r => r.startsWith('dist/'))).toContain('dist/bundle.min.js')
    })
  })

  describe('multiple ignores with /** suffix', () => {
    it('can ignore multiple directories with /** suffix', async () => {
      const results = await globlin.glob('**', {
        cwd: fixturePath,
        ignore: ['node_modules/**', 'dist/**', 'tmp/**'],
        posix: true,
      })
      const sorted = results.sort()

      // All ignored directories should be excluded
      expect(sorted.filter(r => r.includes('node_modules'))).toEqual([])
      expect(sorted.filter(r => r.startsWith('dist'))).toEqual([])
      expect(sorted.filter(r => r.startsWith('tmp'))).toEqual([])

      // Other files should be present
      expect(sorted).toContain('src')
      expect(sorted).toContain('src/index.ts')
      expect(sorted).toContain('package.json')
    })

    it('mix of /** and exact match ignores', async () => {
      const results = await globlin.glob('**', {
        cwd: fixturePath,
        ignore: ['node_modules/**', 'dist'],
      })
      const sorted = results.sort()

      // node_modules and children excluded
      expect(sorted.filter(r => r.includes('node_modules'))).toEqual([])

      // dist directory excluded but its children might be present
      expect(sorted).not.toContain('dist')
      // The directory itself is ignored but children may be found via **
      // Actually in glob behavior, children are still found
    })
  })

  describe('nested patterns with /** suffix', () => {
    it('ignore "src/components/**" excludes only that subdirectory', async () => {
      const results = await globlin.glob('**/*.ts', {
        cwd: fixturePath,
        ignore: 'src/components/**',
        posix: true,
      })
      const sorted = results.sort()

      // src/components files should be excluded
      expect(sorted.filter(r => r.startsWith('src/components/'))).toEqual([])

      // Other src files should be present
      expect(sorted).toContain('src/index.ts')
      expect(sorted).toContain('src/utils.ts')
    })

    it('ignore "**/lodash/**" excludes nested directory', async () => {
      const results = await globlin.glob('**/*.js', {
        cwd: fixturePath,
        ignore: '**/lodash/**',
        posix: true,
      })
      const sorted = results.sort()

      // lodash files should be excluded
      expect(sorted.filter(r => r.includes('lodash'))).toEqual([])

      // Other node_modules files should be present
      expect(sorted.filter(r => r.includes('react'))).toContain('node_modules/react/index.js')
    })
  })

  describe('comparison with glob for /** suffix', () => {
    const testCases = [
      {
        pattern: '**',
        ignore: 'node_modules/**',
        description: 'node_modules/** excludes directory and children',
      },
      {
        pattern: '**',
        ignore: 'node_modules',
        description: 'node_modules excludes only exact match',
      },
      {
        pattern: '**/*.js',
        ignore: 'dist/**',
        description: 'dist/** with file pattern',
      },
      {
        pattern: '**',
        ignore: ['node_modules/**', 'dist/**'],
        description: 'multiple /** ignores',
      },
      {
        pattern: '**/*.ts',
        ignore: 'src/components/**',
        description: 'nested component ignore',
      },
    ]

    for (const tc of testCases) {
      it(`comparison: ${tc.description}`, async () => {
        const options = {
          cwd: fixturePath,
          ignore: tc.ignore,
        }

        const [globResults, globlinResults] = await Promise.all([
          nodeGlob(tc.pattern, options),
          globlin.glob(tc.pattern, options),
        ])

        const globSorted = globResults.sort()
        const globlinSorted = globlinResults.sort()

        expect(globlinSorted).toEqual(globSorted)
      })

      it(`sync comparison: ${tc.description}`, () => {
        const options = {
          cwd: fixturePath,
          ignore: tc.ignore,
        }

        const globResults = nodeGlob.sync(tc.pattern, options)
        const globlinResults = globlin.globSync(tc.pattern, options)

        const globSorted = globResults.sort()
        const globlinSorted = globlinResults.sort()

        expect(globlinSorted).toEqual(globSorted)
      })
    }
  })

  describe('childrenIgnored optimization', () => {
    it('/** suffix should skip traversing into directory', async () => {
      // This tests that the optimization is working - we don't traverse into ignored directories
      // We can't easily verify this without timing, but we can verify the results are correct
      const results = await globlin.glob('**', {
        cwd: fixturePath,
        ignore: 'node_modules/**',
      })

      // Verify no node_modules entries
      expect(results.filter(r => r.includes('node_modules'))).toEqual([])
    })

    it('multiple /** patterns should skip all matching directories', async () => {
      const results = await globlin.glob('**', {
        cwd: fixturePath,
        ignore: ['node_modules/**', 'dist/**', 'tmp/**'],
      })

      // Verify none of the ignored directories appear
      for (const dir of ['node_modules', 'dist', 'tmp']) {
        expect(results.filter(r => r.includes(dir))).toEqual([])
      }
    })
  })

  describe('edge cases with /** suffix', () => {
    it('/**/** (double globstar) should work like /**', async () => {
      const results = await globlin.glob('**', {
        cwd: fixturePath,
        ignore: 'node_modules/**/**',
      })

      // Should behave the same as node_modules/**
      expect(results.filter(r => r.includes('node_modules'))).toEqual([])
    })

    it('ignore "./**" at root', async () => {
      // ./** means current directory and all children
      const results = await globlin.glob('**', {
        cwd: fixturePath,
        ignore: './**',
      })

      // Should ignore everything
      expect(results).toEqual([])
    })

    it('brace expansion with /** suffix', async () => {
      const results = await globlin.glob('**', {
        cwd: fixturePath,
        ignore: '{node_modules,dist}/**',
      })

      // Both should be excluded
      expect(results.filter(r => r.includes('node_modules'))).toEqual([])
      expect(results.filter(r => r.startsWith('dist'))).toEqual([])
    })

    it('** alone without prefix', async () => {
      // "/**" at the start - means absolute root
      // In most cases, users would use "**" to match all
      const results = await globlin.glob('*', {
        cwd: fixturePath,
        ignore: '**',
      })

      // All files in cwd should be ignored
      expect(results).toEqual([])
    })
  })
})
