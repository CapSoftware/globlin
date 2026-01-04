/**
 * Escape/unescape compatibility tests
 *
 * Based on: vendor/glob/test/escape.ts
 *
 * Tests that:
 * 1. escape() properly escapes magic glob characters
 * 2. unescape() reverses escape()
 * 3. hasMagic() returns false for escaped patterns
 * 4. windowsPathsNoEscape mode uses bracket escaping instead of backslash
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { escape as globEscape, unescape as globUnescape, hasMagic as globHasMagic } from 'glob'
import { escape, unescape, hasMagic } from '../../js/index.js'

// Test patterns from bash-results.ts that contain magic characters
const testPatterns = [
  '*.txt',
  '**/*.js',
  'file?.md',
  '[abc]',
  '{a,b}',
  '+(a|b)',
  '*(a|b)',
  '?(a|b)',
  '@(a|b)',
  '!(a|b)',
  'a/**/b',
  'src/**',
  '**/test.js',
  '*.{js,ts}',
  'file[0-9].txt',
  'a?b',
  'a[!b]c',
]

describe('escape', () => {
  describe('basic escaping', () => {
    it('should escape asterisk', () => {
      expect(escape('*.txt')).toBe('\\*.txt')
    })

    it('should escape question mark', () => {
      expect(escape('file?.md')).toBe('file\\?.md')
    })

    it('should escape brackets', () => {
      expect(escape('[abc]')).toBe('\\[abc\\]')
    })

    it('should NOT escape braces (glob behavior)', () => {
      // Braces are NOT escaped per glob's behavior
      expect(escape('{a,b}')).toBe('{a,b}')
    })

    it('should escape only parentheses in extglob patterns', () => {
      // Only ( and ) are escaped, not the prefix chars
      expect(escape('+(a|b)')).toBe('+\\(a|b\\)')
      expect(escape('!(a|b)')).toBe('!\\(a|b\\)')
    })

    it('should not modify patterns without magic', () => {
      expect(escape('foo.txt')).toBe('foo.txt')
      expect(escape('path/to/file')).toBe('path/to/file')
    })
  })

  describe('windowsPathsNoEscape mode', () => {
    it('should use bracket escaping for asterisk', () => {
      expect(escape('*.txt', { windowsPathsNoEscape: true })).toBe('[*].txt')
    })

    it('should use bracket escaping for question mark', () => {
      expect(escape('file?.md', { windowsPathsNoEscape: true })).toBe('file[?].md')
    })

    it('should use bracket escaping only for escapable chars', () => {
      // Only *, ?, [, ], (, ) are bracket-escaped
      const pattern = '*?[]()'
      const escaped = escape(pattern, { windowsPathsNoEscape: true })
      expect(escaped).toBe('[*][?][[][]][(][)]')
    })
  })
})

describe('unescape', () => {
  describe('basic unescaping', () => {
    it('should unescape backslash-escaped asterisk', () => {
      expect(unescape('\\*.txt')).toBe('*.txt')
    })

    it('should unescape backslash-escaped question mark', () => {
      expect(unescape('file\\?.md')).toBe('file?.md')
    })

    it('should unescape backslash-escaped brackets', () => {
      expect(unescape('\\[abc\\]')).toBe('[abc]')
    })

    it('should unescape backslash-escaped parentheses', () => {
      expect(unescape('+\\(a|b\\)')).toBe('+(a|b)')
    })

    it('should not modify patterns without escapes', () => {
      expect(unescape('foo.txt')).toBe('foo.txt')
      expect(unescape('path/to/file')).toBe('path/to/file')
    })
  })

  describe('windowsPathsNoEscape mode', () => {
    it('should remove bracket escaping for asterisk', () => {
      expect(unescape('[*].txt', { windowsPathsNoEscape: true })).toBe('*.txt')
    })

    it('should remove bracket escaping for question mark', () => {
      expect(unescape('file[?].md', { windowsPathsNoEscape: true })).toBe('file?.md')
    })
  })
})

describe('escape/unescape roundtrip', () => {
  for (const pattern of testPatterns) {
    it(`roundtrip for "${pattern}" (posix style)`, () => {
      const escaped = escape(pattern)
      const unescaped = unescape(escaped)
      expect(unescaped).toBe(pattern)
    })

    it(`roundtrip for "${pattern}" (windows style)`, () => {
      const escaped = escape(pattern, { windowsPathsNoEscape: true })
      const unescaped = unescape(escaped, { windowsPathsNoEscape: true })
      expect(unescaped).toBe(pattern)
    })
  }
})

describe('hasMagic', () => {
  describe('unescaped patterns', () => {
    it('should return true for asterisk', () => {
      expect(hasMagic('*.txt')).toBe(true)
    })

    it('should return true for question mark', () => {
      expect(hasMagic('file?.md')).toBe(true)
    })

    it('should return true for brackets', () => {
      expect(hasMagic('[abc]')).toBe(true)
    })

    it('should return true for +( and @( extglob', () => {
      expect(hasMagic('+(a|b)')).toBe(true)
      expect(hasMagic('@(a|b)')).toBe(true)
    })

    it('should return false for !( per glob behavior', () => {
      // !( is NOT magic in glob v13
      expect(hasMagic('!(a|b)')).toBe(false)
    })

    it('should return true for *( and ?( because * and ? are magic', () => {
      expect(hasMagic('*(a|b)')).toBe(true)
      expect(hasMagic('?(a|b)')).toBe(true)
    })

    it('should return false for literal patterns', () => {
      expect(hasMagic('foo.txt')).toBe(false)
      expect(hasMagic('path/to/file')).toBe(false)
    })
  })

  describe('escaped patterns', () => {
    it('should return false for escaped asterisk', () => {
      expect(hasMagic('\\*.txt')).toBe(false)
    })

    it('should return false for escaped question mark', () => {
      expect(hasMagic('file\\?.md')).toBe(false)
    })

    it('should return false for escaped brackets', () => {
      expect(hasMagic('\\[abc\\]')).toBe(false)
    })
  })

  describe('after escape()', () => {
    // Only test patterns that escape() actually modifies
    const escapablePatterns = testPatterns.filter(p =>
      p.includes('*') || p.includes('?') || p.includes('[') || p.includes('(')
    )
    for (const pattern of escapablePatterns) {
      it(`escape("${pattern}") should have no magic (posix)`, () => {
        const escaped = escape(pattern)
        expect(hasMagic(escaped)).toBe(false)
      })
    }
  })

  describe('noext option', () => {
    it('should not treat +( and @( as magic when noext is true', () => {
      expect(hasMagic('+(a|b)', { noext: true })).toBe(false)
      expect(hasMagic('@(a|b)', { noext: true })).toBe(false)
    })

    it('should still treat *( and ?( as magic when noext is true', () => {
      // Because * and ? are always magic
      expect(hasMagic('*(a|b)', { noext: true })).toBe(true)
      expect(hasMagic('?(a|b)', { noext: true })).toBe(true)
    })

    it('should still treat * and ? as magic when noext is true', () => {
      expect(hasMagic('*.txt', { noext: true })).toBe(true)
      expect(hasMagic('file?.md', { noext: true })).toBe(true)
    })
  })
})

describe('compatibility with glob', () => {
  describe('escape compatibility', () => {
    for (const pattern of testPatterns) {
      it(`escape("${pattern}") matches glob`, () => {
        const globlinResult = escape(pattern)
        const globResult = globEscape(pattern)
        expect(globlinResult).toBe(globResult)
      })

      it(`escape("${pattern}", {windowsPathsNoEscape}) matches glob`, () => {
        const globlinResult = escape(pattern, { windowsPathsNoEscape: true })
        const globResult = globEscape(pattern, { windowsPathsNoEscape: true })
        expect(globlinResult).toBe(globResult)
      })
    }
  })

  describe('unescape compatibility', () => {
    for (const pattern of testPatterns) {
      const escaped = globEscape(pattern)
      it(`unescape("${escaped}") matches glob`, () => {
        const globlinResult = unescape(escaped)
        const globResult = globUnescape(escaped)
        expect(globlinResult).toBe(globResult)
      })
    }

    for (const pattern of testPatterns) {
      const escaped = globEscape(pattern, { windowsPathsNoEscape: true })
      it(`unescape("${escaped}", {windowsPathsNoEscape}) matches glob`, () => {
        const globlinResult = unescape(escaped, { windowsPathsNoEscape: true })
        const globResult = globUnescape(escaped, { windowsPathsNoEscape: true })
        expect(globlinResult).toBe(globResult)
      })
    }
  })

  describe('hasMagic compatibility', () => {
    for (const pattern of testPatterns) {
      it(`hasMagic("${pattern}") matches glob`, () => {
        const globlinResult = hasMagic(pattern)
        const globResult = globHasMagic(pattern)
        expect(globlinResult).toBe(globResult)
      })

      // Test that escaped patterns have no magic
      const escaped = globEscape(pattern)
      it(`hasMagic(escape("${pattern}")) matches glob`, () => {
        const globlinResult = hasMagic(escaped)
        const globResult = globHasMagic(escaped)
        expect(globlinResult).toBe(globResult)
      })
    }
  })
})
