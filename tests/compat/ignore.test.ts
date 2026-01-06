import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { glob as nodeGlob } from 'glob'
import { loadGloblin, createTestFixture, cleanupFixture, FixtureConfig } from '../harness'
import * as path from 'path'

describe('ignore option compatibility', () => {
  let globlin: Awaited<ReturnType<typeof loadGloblin>>
  let fixturePath: string

  beforeAll(async () => {
    globlin = await loadGloblin()

    // Create a fixture matching glob's test fixture structure
    // This is based on vendor/glob/test/00-setup.ts
    // Note: a/z/.y and a/x/.y are directories (since a/z/.y/b and a/x/.y/b are files inside)
    const config: FixtureConfig = {
      files: [
        'a/abcdef/g/h',
        'a/abcfed/g/h',
        'a/b/c/d',
        'a/bc/e/f',
        'a/c/d/c/b',
        'a/cb/e/f',
        'a/x/.y/b',
        'a/z/.y/b',
        'a/.abcdef',
      ],
      symlinks: process.platform !== 'win32' ? [['a/symlink', 'b']] : [],
    }

    fixturePath = await createTestFixture('ignore-test', config)
  })

  afterAll(async () => {
    if (fixturePath) {
      await cleanupFixture(fixturePath)
    }
  })

  // Test cases adapted from vendor/glob/test/ignore.ts
  // [pattern, ignore, expected, cwd or options]
  const testCases: Array<{
    pattern: string
    ignore: string | string[] | null
    expected: string[]
    cwd?: string
    options?: Record<string, unknown>
    description?: string
  }> = [
    // Basic ignore - single literal
    {
      pattern: '*',
      ignore: ['b'],
      expected: ['abcdef', 'abcfed', 'bc', 'c', 'cb', 'symlink', 'x', 'z'],
      cwd: 'a',
    },
    // Wildcard ignore
    {
      pattern: '*',
      ignore: 'b*',
      expected: ['abcdef', 'abcfed', 'c', 'cb', 'symlink', 'x', 'z'],
      cwd: 'a',
    },
    // Nested path ignore
    {
      pattern: 'b/**',
      ignore: 'b/c/d',
      expected: ['b', 'b/c'],
      cwd: 'a',
    },
    // Ignore doesn't match - different path
    {
      pattern: 'b/**',
      ignore: 'd',
      expected: ['b', 'b/c', 'b/c/d'],
      cwd: 'a',
    },
    // Ignore with /** suffix
    {
      pattern: 'b/**',
      ignore: 'b/c/**',
      expected: ['b'],
      cwd: 'a',
    },
    // Globstar in middle with ignore
    {
      pattern: '**/d',
      ignore: 'b/c/d',
      expected: ['c/d'],
      cwd: 'a',
    },
    // Complex pattern with ignore array
    {
      pattern: 'a/**/[gh]',
      ignore: ['a/abcfed/g/h'],
      expected: ['a/abcdef/g', 'a/abcdef/g/h', 'a/abcfed/g'],
    },
    // Multiple ignores
    {
      pattern: '*',
      ignore: ['c', 'bc', 'symlink', 'abcdef'],
      expected: ['abcfed', 'b', 'cb', 'x', 'z'],
      cwd: 'a',
    },
    // Globstar with multiple children ignores
    {
      pattern: '**',
      ignore: ['c/**', 'bc/**', 'symlink/**', 'abcdef/**'],
      expected: [
        '.',
        'abcfed',
        'abcfed/g',
        'abcfed/g/h',
        'b',
        'b/c',
        'b/c/d',
        'cb',
        'cb/e',
        'cb/e/f',
        'x',
        'z',
      ],
      cwd: 'a',
    },
    // Ignore everything
    {
      pattern: 'a/**',
      ignore: ['a/**'],
      expected: [],
    },
    // Ignore with nested globstar
    {
      pattern: 'a/**',
      ignore: ['a/**/**'],
      expected: [],
    },
    // Partial path ignore
    {
      pattern: 'a/b/**',
      ignore: ['a/b'],
      expected: ['a/b/c', 'a/b/c/d'],
    },
    // Ignore with b prefix patterns
    {
      pattern: '**',
      ignore: ['b'],
      expected: [
        '.',
        'abcdef',
        'abcdef/g',
        'abcdef/g/h',
        'abcfed',
        'abcfed/g',
        'abcfed/g/h',
        'b/c',
        'b/c/d',
        'bc',
        'bc/e',
        'bc/e/f',
        'c',
        'c/d',
        'c/d/c',
        'c/d/c/b',
        'cb',
        'cb/e',
        'cb/e/f',
        'symlink',
        'x',
        'z',
      ],
      cwd: 'a',
    },
    // Ignore with multiple prefixed patterns
    {
      pattern: '**',
      ignore: ['b', 'c'],
      expected: [
        '.',
        'abcdef',
        'abcdef/g',
        'abcdef/g/h',
        'abcfed',
        'abcfed/g',
        'abcfed/g/h',
        'b/c',
        'b/c/d',
        'bc',
        'bc/e',
        'bc/e/f',
        'c/d',
        'c/d/c',
        'c/d/c/b',
        'cb',
        'cb/e',
        'cb/e/f',
        'symlink',
        'x',
        'z',
      ],
      cwd: 'a',
    },
    // Ignore with wildcard pattern
    {
      pattern: '**',
      ignore: ['b**'],
      expected: [
        '.',
        'abcdef',
        'abcdef/g',
        'abcdef/g/h',
        'abcfed',
        'abcfed/g',
        'abcfed/g/h',
        'b/c',
        'b/c/d',
        'bc/e',
        'bc/e/f',
        'c',
        'c/d',
        'c/d/c',
        'c/d/c/b',
        'cb',
        'cb/e',
        'cb/e/f',
        'symlink',
        'x',
        'z',
      ],
      cwd: 'a',
    },
    // Ignore with globstar children pattern
    {
      pattern: '**',
      ignore: ['b/**'],
      expected: [
        '.',
        'abcdef',
        'abcdef/g',
        'abcdef/g/h',
        'abcfed',
        'abcfed/g',
        'abcfed/g/h',
        'bc',
        'bc/e',
        'bc/e/f',
        'c',
        'c/d',
        'c/d/c',
        'c/d/c/b',
        'cb',
        'cb/e',
        'cb/e/f',
        'symlink',
        'x',
        'z',
      ],
      cwd: 'a',
    },
    // Ignore with wildcard and globstar
    {
      pattern: '**',
      ignore: ['b**/**'],
      expected: [
        '.',
        'abcdef',
        'abcdef/g',
        'abcdef/g/h',
        'abcfed',
        'abcfed/g',
        'abcfed/g/h',
        'c',
        'c/d',
        'c/d/c',
        'c/d/c/b',
        'cb',
        'cb/e',
        'cb/e/f',
        'symlink',
        'x',
        'z',
      ],
      cwd: 'a',
    },
    // Brace expansion in ignore
    {
      pattern: '**',
      ignore: ['abc{def,fed}/**'],
      expected: [
        '.',
        'b',
        'b/c',
        'b/c/d',
        'bc',
        'bc/e',
        'bc/e/f',
        'c',
        'c/d',
        'c/d/c',
        'c/d/c/b',
        'cb',
        'cb/e',
        'cb/e/f',
        'symlink',
        'x',
        'z',
      ],
      cwd: 'a',
    },
    // Brace expansion with single level
    {
      pattern: '**',
      ignore: ['abc{def,fed}/*'],
      expected: [
        '.',
        'abcdef',
        'abcdef/g/h',
        'abcfed',
        'abcfed/g/h',
        'b',
        'b/c',
        'b/c/d',
        'bc',
        'bc/e',
        'bc/e/f',
        'c',
        'c/d',
        'c/d/c',
        'c/d/c/b',
        'cb',
        'cb/e',
        'cb/e/f',
        'symlink',
        'x',
        'z',
      ],
      cwd: 'a',
    },
    // Children only ignore
    {
      pattern: 'c/**',
      ignore: ['c/*'],
      expected: ['c', 'c/d/c', 'c/d/c/b'],
      cwd: 'a',
    },
    // Scoped ignore
    {
      pattern: 'a/c/**',
      ignore: ['a/c/*'],
      expected: ['a/c', 'a/c/d/c', 'a/c/d/c/b'],
    },
    // Multiple ignores that eliminate everything
    {
      pattern: 'a/c/**',
      ignore: ['a/c/**', 'a/c/*', 'a/c/*/c'],
      expected: [],
    },
    // Dotfile pattern with ignore
    {
      pattern: 'a/**/.y',
      ignore: ['a/x/**'],
      expected: ['a/z/.y'],
    },
    // Dotfile with dot option
    {
      pattern: 'a/**/.y',
      ignore: ['a/x/**'],
      expected: ['a/z/.y'],
      options: { dot: true },
    },
    // Match files with ignore
    {
      pattern: 'a/**/b',
      ignore: ['a/x/**'],
      expected: ['a/b', 'a/c/d/c/b'],
    },
    // Match files with ignore and dot
    {
      pattern: 'a/**/b',
      ignore: ['a/x/**'],
      expected: ['a/b', 'a/c/d/c/b', 'a/z/.y/b'],
      options: { dot: true },
    },
    // Ignore dotfile pattern
    {
      pattern: '*/.abcdef',
      ignore: 'a/**',
      expected: [],
    },
    // Specific path with ignore
    {
      pattern: 'a/*/.y/b',
      ignore: 'a/x/**',
      expected: ['a/z/.y/b'],
    },
  ]

  // Filter test cases based on platform (skip symlink tests on Windows)
  const filteredCases =
    process.platform === 'win32'
      ? testCases.filter(tc => {
          // Exclude results with symlinks on Windows
          tc.expected = tc.expected.filter(e => !/\bsymlink\b/.test(e))
          return true
        })
      : testCases

  describe('globlin ignore behavior', () => {
    for (const tc of filteredCases) {
      const name = `pattern="${tc.pattern}" ignore=${JSON.stringify(tc.ignore)} ${tc.cwd ? `cwd="${tc.cwd}"` : ''} ${tc.options ? JSON.stringify(tc.options) : ''}`

      it(`async: ${name}`, async () => {
        const cwd = tc.cwd ? path.join(fixturePath, tc.cwd) : fixturePath
        const options = {
          cwd,
          ...tc.options,
          ...(tc.ignore !== null ? { ignore: tc.ignore } : {}),
        }

        const results = await globlin.glob(tc.pattern, options)
        const sorted = results.sort()
        const expected = tc.expected.sort()

        expect(sorted).toEqual(expected)
      })

      it(`sync: ${name}`, () => {
        const cwd = tc.cwd ? path.join(fixturePath, tc.cwd) : fixturePath
        const options = {
          cwd,
          ...tc.options,
          ...(tc.ignore !== null ? { ignore: tc.ignore } : {}),
        }

        const results = globlin.globSync(tc.pattern, options)
        const sorted = results.sort()
        const expected = tc.expected.sort()

        expect(sorted).toEqual(expected)
      })
    }
  })

  describe('comparison with glob (node)', () => {
    // Test a subset of cases to compare with glob
    const comparisonCases = [
      {
        pattern: '*',
        ignore: ['b'],
        cwd: 'a',
        description: 'simple literal ignore',
      },
      {
        pattern: '*',
        ignore: 'b*',
        cwd: 'a',
        description: 'wildcard ignore',
      },
      {
        pattern: 'b/**',
        ignore: 'b/c/**',
        cwd: 'a',
        description: 'globstar children ignore',
      },
      {
        pattern: '**',
        ignore: ['b/**'],
        cwd: 'a',
        description: 'full tree with ignore',
      },
      {
        pattern: '**',
        ignore: ['abc{def,fed}/**'],
        cwd: 'a',
        description: 'brace expansion in ignore',
      },
    ]

    for (const tc of comparisonCases) {
      it(`async comparison: ${tc.description}`, async () => {
        const cwd = tc.cwd ? path.join(fixturePath, tc.cwd) : fixturePath
        const options = {
          cwd,
          ignore: tc.ignore,
        }

        const [globResults, globlinResults] = await Promise.all([
          nodeGlob(tc.pattern, options),
          globlin.glob(tc.pattern, options),
        ])

        const globSorted = globResults.sort()
        const globlinSorted = globlinResults.sort()

        // Filter out symlinks on Windows
        const filterSymlinks = (arr: string[]) =>
          process.platform === 'win32' ? arr.filter(e => !/\bsymlink\b/.test(e)) : arr

        expect(filterSymlinks(globlinSorted)).toEqual(filterSymlinks(globSorted))
      })

      it(`sync comparison: ${tc.description}`, async () => {
        const cwd = tc.cwd ? path.join(fixturePath, tc.cwd) : fixturePath
        const options = {
          cwd,
          ignore: tc.ignore,
        }

        const globResults = nodeGlob.sync(tc.pattern, options)
        const globlinResults = globlin.globSync(tc.pattern, options)

        const globSorted = globResults.sort()
        const globlinSorted = globlinResults.sort()

        // Filter out symlinks on Windows
        const filterSymlinks = (arr: string[]) =>
          process.platform === 'win32' ? arr.filter(e => !/\bsymlink\b/.test(e)) : arr

        expect(filterSymlinks(globlinSorted)).toEqual(filterSymlinks(globSorted))
      })
    }
  })

  describe('ignore with no matches', () => {
    it('ignore string with no matches returns full results', async () => {
      const results = await globlin.glob('*', {
        cwd: path.join(fixturePath, 'a'),
        ignore: 'nonexistent',
      })

      expect(results.length).toBeGreaterThan(0)
    })

    it('ignore array with no matches returns full results', () => {
      const results = globlin.globSync('*', {
        cwd: path.join(fixturePath, 'a'),
        ignore: ['nonexistent1', 'nonexistent2'],
      })

      expect(results.length).toBeGreaterThan(0)
    })

    it('null ignore returns full results', async () => {
      const results = await globlin.glob('*', {
        cwd: path.join(fixturePath, 'a'),
      })

      expect(results.length).toBeGreaterThan(0)
    })
  })
})
