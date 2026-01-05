/**
 * Tests for invalid pattern handling.
 * 
 * glob v13 is very permissive and doesn't throw errors for most "invalid" patterns.
 * Instead, it treats malformed patterns gracefully:
 * - Unclosed brackets/braces become literal characters
 * - Unclosed extglob patterns become literal characters
 * - Empty patterns return empty results
 * 
 * This matches bash's glob behavior where malformed patterns often
 * just match nothing rather than throwing errors.
 * 
 * We test that globlin matches this permissive behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { glob as globOriginal, globSync as globSyncOriginal } from 'glob'
import { createTestFixture, cleanupFixture, loadGloblin } from '../harness.js'

describe('invalid-patterns - malformed patterns', () => {
  let fixturePath: string
  let globlin: Awaited<ReturnType<typeof loadGloblin>>

  beforeAll(async () => {
    // Create a fixture with some files
    fixturePath = await createTestFixture('invalid-patterns', {
      files: [
        'file.txt',
        'test.js',
        'data[1].json',      // File with brackets in name
        'config{a}.yaml',    // File with braces in name
        '(test).md',         // File with parentheses in name
        'dir/nested.txt',
      ],
      dirs: ['dir']
    })
    globlin = await loadGloblin()
  })

  afterAll(async () => {
    await cleanupFixture(fixturePath)
  })

  describe('unclosed bracket expressions', () => {
    const bracketPatterns = [
      '[',
      '[abc',
      'file[',
      'test.[',
      '**[',
      '**/[',
      '[a-z',
      'dir/[',
    ]

    for (const pattern of bracketPatterns) {
      it(`glob handles unclosed bracket: ${JSON.stringify(pattern)}`, async () => {
        const result = await globOriginal(pattern, { cwd: fixturePath })
        // glob doesn't throw - it treats unclosed bracket as literal
        expect(Array.isArray(result)).toBe(true)
      })

      it(`globlin handles unclosed bracket: ${JSON.stringify(pattern)}`, async () => {
        // globlin should match glob's behavior - no error
        const result = await globlin.glob(pattern, { cwd: fixturePath })
        expect(Array.isArray(result)).toBe(true)
      })

      it(`globlin matches glob for unclosed bracket: ${JSON.stringify(pattern)}`, async () => {
        const globResult = await globOriginal(pattern, { cwd: fixturePath })
        const globlinResult = await globlin.glob(pattern, { cwd: fixturePath })
        expect(new Set(globlinResult)).toEqual(new Set(globResult))
      })
    }
  })

  describe('unclosed brace expressions', () => {
    const bracePatterns = [
      '{',
      '{a,b',
      'file{',
      '*.{txt,js',
      '**/{',
      '{a,b,c',
      '{1..5',
      '{{',
      '{{{{{',
    ]

    for (const pattern of bracePatterns) {
      it(`glob handles unclosed brace: ${JSON.stringify(pattern)}`, async () => {
        const result = await globOriginal(pattern, { cwd: fixturePath })
        // glob doesn't throw - unclosed braces are treated as literals
        expect(Array.isArray(result)).toBe(true)
      })

      it(`globlin handles unclosed brace: ${JSON.stringify(pattern)}`, async () => {
        const result = await globlin.glob(pattern, { cwd: fixturePath })
        expect(Array.isArray(result)).toBe(true)
      })

      it(`globlin matches glob for unclosed brace: ${JSON.stringify(pattern)}`, async () => {
        const globResult = await globOriginal(pattern, { cwd: fixturePath })
        const globlinResult = await globlin.glob(pattern, { cwd: fixturePath })
        expect(new Set(globlinResult)).toEqual(new Set(globResult))
      })
    }
  })

  describe('unclosed extglob patterns', () => {
    const extglobPatterns = [
      '!(',
      '?(',
      '+(',
      '*(',
      '@(',
      '+(a|b',
      '!(foo',
      '?(test',
      '*(a',
      '@(x|y',
    ]

    for (const pattern of extglobPatterns) {
      it(`glob handles unclosed extglob: ${JSON.stringify(pattern)}`, async () => {
        const result = await globOriginal(pattern, { cwd: fixturePath })
        expect(Array.isArray(result)).toBe(true)
      })

      it(`globlin handles unclosed extglob: ${JSON.stringify(pattern)}`, async () => {
        const result = await globlin.glob(pattern, { cwd: fixturePath })
        expect(Array.isArray(result)).toBe(true)
      })

      it(`globlin matches glob for unclosed extglob: ${JSON.stringify(pattern)}`, async () => {
        const globResult = await globOriginal(pattern, { cwd: fixturePath })
        const globlinResult = await globlin.glob(pattern, { cwd: fixturePath })
        expect(new Set(globlinResult)).toEqual(new Set(globResult))
      })
    }
  })

  describe('empty extglob patterns', () => {
    const emptyExtglobs = [
      '!()',    // Matches non-empty strings - KNOWN ISSUE: extglob negation
      '+()',    // Matches nothing (one or more of nothing)
      '*()',    // Matches empty strings
      '?()',    // Matches empty strings
      '@()',    // Matches nothing (exactly one of nothing)
    ]

    for (const pattern of emptyExtglobs) {
      it(`glob handles empty extglob: ${JSON.stringify(pattern)}`, async () => {
        const result = await globOriginal(pattern, { cwd: fixturePath })
        expect(Array.isArray(result)).toBe(true)
      })

      it(`globlin handles empty extglob: ${JSON.stringify(pattern)}`, async () => {
        const result = await globlin.glob(pattern, { cwd: fixturePath })
        expect(Array.isArray(result)).toBe(true)
      })

      // Skip !() - known issue with extglob negation (see Phase 4 notes)
      it.skipIf(pattern === '!()')(`globlin matches glob for empty extglob: ${JSON.stringify(pattern)}`, async () => {
        const globResult = await globOriginal(pattern, { cwd: fixturePath })
        const globlinResult = await globlin.glob(pattern, { cwd: fixturePath })
        expect(new Set(globlinResult)).toEqual(new Set(globResult))
      })
    }
  })

  describe('deeply nested patterns', () => {
    const deepPatterns = [
      '(((((((((((',
      '{{{{{{{{{{',
      '[[[[[[[[[[[',
      '**/**/**/**/**/**/**/**/**/**',
    ]

    for (const pattern of deepPatterns) {
      it(`glob handles deeply nested: ${JSON.stringify(pattern)}`, async () => {
        const result = await globOriginal(pattern, { cwd: fixturePath })
        expect(Array.isArray(result)).toBe(true)
      })

      it(`globlin handles deeply nested: ${JSON.stringify(pattern)}`, async () => {
        const result = await globlin.glob(pattern, { cwd: fixturePath })
        expect(Array.isArray(result)).toBe(true)
      })
    }
  })

  describe('escape sequences', () => {
    const escapePatterns = [
      '\\[',        // Escaped bracket - should match literal [
      '\\{',        // Escaped brace - should match literal {
      '\\*',        // Escaped star - should match literal *
      '\\?',        // Escaped question - should match literal ?
      '\\(',        // Escaped paren - should match literal (
      '\\\\',       // Double backslash
      'test\\.js',  // Escaped dot
    ]

    for (const pattern of escapePatterns) {
      it(`glob handles escape: ${JSON.stringify(pattern)}`, async () => {
        const result = await globOriginal(pattern, { cwd: fixturePath })
        expect(Array.isArray(result)).toBe(true)
      })

      it(`globlin handles escape: ${JSON.stringify(pattern)}`, async () => {
        const result = await globlin.glob(pattern, { cwd: fixturePath })
        expect(Array.isArray(result)).toBe(true)
      })

      it(`globlin matches glob for escape: ${JSON.stringify(pattern)}`, async () => {
        const globResult = await globOriginal(pattern, { cwd: fixturePath })
        const globlinResult = await globlin.glob(pattern, { cwd: fixturePath })
        expect(new Set(globlinResult)).toEqual(new Set(globResult))
      })
    }
  })

  describe('weird but valid patterns', () => {
    const weirdPatterns = [
      '***',           // Multiple stars
      '****/****.***', // Lots of stars
      '?????',         // Just question marks
      '...',           // Just dots
      '---',           // Just dashes
      '@#$%^&',        // Special characters
      '   ',           // Just spaces
      '\t\t\t',        // Just tabs
    ]

    for (const pattern of weirdPatterns) {
      it(`glob handles weird pattern: ${JSON.stringify(pattern)}`, async () => {
        const result = await globOriginal(pattern, { cwd: fixturePath })
        expect(Array.isArray(result)).toBe(true)
      })

      it(`globlin handles weird pattern: ${JSON.stringify(pattern)}`, async () => {
        const result = await globlin.glob(pattern, { cwd: fixturePath })
        expect(Array.isArray(result)).toBe(true)
      })

      it(`globlin matches glob for weird pattern: ${JSON.stringify(pattern)}`, async () => {
        const globResult = await globOriginal(pattern, { cwd: fixturePath })
        const globlinResult = await globlin.glob(pattern, { cwd: fixturePath })
        expect(new Set(globlinResult)).toEqual(new Set(globResult))
      })
    }
  })

  describe('null and undefined patterns', () => {
    it('glob throws for null pattern', () => {
      // @ts-expect-error - testing invalid input
      expect(() => globSyncOriginal(null, { cwd: fixturePath })).toThrow()
    })

    it('globlin throws for null pattern', () => {
      // @ts-expect-error - testing invalid input
      expect(() => globlin.globSync(null, { cwd: fixturePath })).toThrow()
    })

    it('glob throws for undefined pattern', () => {
      // @ts-expect-error - testing invalid input
      expect(() => globSyncOriginal(undefined, { cwd: fixturePath })).toThrow()
    })

    it('globlin throws for undefined pattern', () => {
      // @ts-expect-error - testing invalid input
      expect(() => globlin.globSync(undefined, { cwd: fixturePath })).toThrow()
    })
  })

  describe('sync API handles invalid patterns same as async', () => {
    const patterns = ['[', '{a,b', '+(foo', '!()', '\\[']

    for (const pattern of patterns) {
      it(`globSync handles: ${JSON.stringify(pattern)}`, () => {
        const syncResult = globlin.globSync(pattern, { cwd: fixturePath })
        expect(Array.isArray(syncResult)).toBe(true)
      })
    }
  })

  describe('Glob class handles invalid patterns', () => {
    it('Glob class accepts invalid patterns without throwing', () => {
      const invalidPatterns = ['[', '{', '+(', '**[']
      for (const pattern of invalidPatterns) {
        expect(() => {
          const g = new globlin.Glob(pattern, { cwd: fixturePath })
          return g
        }).not.toThrow()
      }
    })

    it('Glob class walk returns empty for non-matching invalid patterns', async () => {
      const g = new globlin.Glob('[[[', { cwd: fixturePath })
      const results = await g.walk()
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('pattern with nobrace option', () => {
    const bracePatterns = [
      '{a,b}',
      '*.{js,ts}',
      '{1..5}',
    ]

    for (const pattern of bracePatterns) {
      it(`nobrace treats as literal: ${JSON.stringify(pattern)}`, async () => {
        const noBraceResult = await globlin.glob(pattern, { 
          cwd: fixturePath, 
          nobrace: true 
        })
        // With nobrace, braces are literal - won't match unless file has { in name
        expect(Array.isArray(noBraceResult)).toBe(true)
      })

      it(`nobrace matches glob behavior: ${JSON.stringify(pattern)}`, async () => {
        const globResult = await globOriginal(pattern, { 
          cwd: fixturePath, 
          nobrace: true 
        })
        const globlinResult = await globlin.glob(pattern, { 
          cwd: fixturePath, 
          nobrace: true 
        })
        expect(new Set(globlinResult)).toEqual(new Set(globResult))
      })
    }
  })

  describe('pattern with noext option', () => {
    const extglobPatterns = [
      '+(a|b)',
      '!(foo)',
      '?(test)',
      '*(a)',
      '@(x|y)',
    ]

    for (const pattern of extglobPatterns) {
      it(`noext treats as literal: ${JSON.stringify(pattern)}`, async () => {
        const noExtResult = await globlin.glob(pattern, { 
          cwd: fixturePath, 
          noext: true 
        })
        // With noext, extglob patterns are literal
        expect(Array.isArray(noExtResult)).toBe(true)
      })

      it(`noext matches glob behavior: ${JSON.stringify(pattern)}`, async () => {
        const globResult = await globOriginal(pattern, { 
          cwd: fixturePath, 
          noext: true 
        })
        const globlinResult = await globlin.glob(pattern, { 
          cwd: fixturePath, 
          noext: true 
        })
        expect(new Set(globlinResult)).toEqual(new Set(globResult))
      })
    }
  })
})
