/**
 * Tests for helpful error messages and pattern analysis
 * 
 * These tests verify that globlin provides helpful warnings and suggestions
 * for common pattern mistakes.
 */

import { describe, it, expect } from 'vitest'
import { analyzePattern, analyzePatterns } from '../../js/index.js'

describe('Helpful Error Messages', () => {
  describe('analyzePattern', () => {
    describe('escaped wildcard warnings', () => {
      it('warns about escaped wildcard at start', () => {
        const warnings = analyzePattern('\\*.txt')
        expect(warnings).toHaveLength(1)
        expect(warnings[0].warningType).toBe('escaped_wildcard_at_start')
        expect(warnings[0].suggestion).toBe('*.txt')
        expect(warnings[0].message).toContain('Did you mean')
      })

      it('warns about escaped question mark at start', () => {
        const warnings = analyzePattern('\\?.txt')
        expect(warnings).toHaveLength(1)
        expect(warnings[0].warningType).toBe('escaped_wildcard_at_start')
        expect(warnings[0].suggestion).toBe('?.txt')
      })

      it('does not warn about escaped wildcards in middle', () => {
        const warnings = analyzePattern('file\\*.txt')
        expect(warnings).toHaveLength(0)
      })
    })

    describe('empty pattern warnings', () => {
      it('warns about empty patterns', () => {
        const warnings = analyzePattern('')
        expect(warnings).toHaveLength(1)
        expect(warnings[0].warningType).toBe('empty_pattern')
        expect(warnings[0].message).toContain('will not match')
      })
    })

    describe('trailing spaces warnings', () => {
      it('warns about trailing spaces', () => {
        const warnings = analyzePattern('*.txt   ')
        expect(warnings).toHaveLength(1)
        expect(warnings[0].warningType).toBe('trailing_spaces')
        expect(warnings[0].suggestion).toBe('*.txt')
      })

      it('does not warn about patterns without trailing spaces', () => {
        const warnings = analyzePattern('*.txt')
        expect(warnings).toHaveLength(0)
      })
    })

    describe('null byte warnings', () => {
      it('warns about null bytes', () => {
        const warnings = analyzePattern('*.txt\0bad')
        expect(warnings).toHaveLength(1)
        expect(warnings[0].warningType).toBe('null_bytes')
        expect(warnings[0].message).toContain('null bytes')
      })
    })

    describe('performance warnings', () => {
      it('warns about multiple globstars', () => {
        // Use a pattern with multiple ** that doesn't contain */ which would break JSDoc
        const pattern = '**' + '/' + '**' + '/' + '**' + '/' + '*.js'
        const warnings = analyzePattern(pattern)
        expect(warnings).toHaveLength(1)
        expect(warnings[0].warningType).toBe('performance')
        expect(warnings[0].message).toContain('globstars')
      })

      it('warns about redundant globstar patterns', () => {
        // **/*/**/*.js has redundant **/* sequences
        const pattern = '**' + '/' + '*' + '/' + '**' + '/' + '*.js'
        const warnings = analyzePattern(pattern)
        expect(warnings).toHaveLength(1)
        expect(warnings[0].warningType).toBe('performance')
        expect(warnings[0].message).toContain('redundant')
      })

      it('does not warn about single globstar', () => {
        // **/*.js is fine
        const pattern = '**' + '/' + '*.js'
        const warnings = analyzePattern(pattern)
        expect(warnings).toHaveLength(0)
      })
    })

    describe('Windows path warnings', () => {
      it('warns about backslash paths on Windows', () => {
        const warnings = analyzePattern('src\\lib\\*.js', { platform: 'win32' })
        expect(warnings).toHaveLength(1)
        expect(warnings[0].warningType).toBe('backslash_on_windows')
        expect(warnings[0].suggestion).toBe('src/lib/*.js')
      })

      it('does not warn with windowsPathsNoEscape enabled', () => {
        const warnings = analyzePattern('src\\lib\\*.js', {
          platform: 'win32',
          windowsPathsNoEscape: true
        })
        expect(warnings).toHaveLength(0)
      })

      it('does not warn on non-Windows platforms', () => {
        const warnings = analyzePattern('src\\lib\\*.js', { platform: 'darwin' })
        // On non-Windows, backslash is escape character (expected behavior)
        expect(warnings.filter(w => w.warningType === 'backslash_on_windows')).toHaveLength(0)
      })
    })

    describe('valid patterns', () => {
      it('no warnings for simple patterns', () => {
        expect(analyzePattern('*.txt')).toHaveLength(0)
        expect(analyzePattern('*.js')).toHaveLength(0)
        expect(analyzePattern('file.txt')).toHaveLength(0)
      })

      it('no warnings for recursive patterns', () => {
        // Use string concatenation to avoid JSDoc issues with */
        const pattern = '**' + '/' + '*.js'
        expect(analyzePattern(pattern)).toHaveLength(0)
      })

      it('no warnings for brace expansion', () => {
        expect(analyzePattern('*.{js,ts}')).toHaveLength(0)
        expect(analyzePattern('{src,lib}/*.js')).toHaveLength(0)
      })

      it('no warnings for scoped patterns', () => {
        // src/**/*.ts
        const pattern = 'src/' + '**' + '/' + '*.ts'
        expect(analyzePattern(pattern)).toHaveLength(0)
      })
    })
  })

  describe('analyzePatterns', () => {
    it('analyzes multiple patterns', () => {
      const warnings = analyzePatterns(['*.txt', '*.txt   ', ''])
      expect(warnings.length).toBeGreaterThan(0)
      
      const types = warnings.map(w => w.warningType)
      expect(types).toContain('trailing_spaces')
      expect(types).toContain('empty_pattern')
    })

    it('returns empty array for valid patterns', () => {
      const warnings = analyzePatterns(['*.txt', '*.js', 'file.json'])
      expect(warnings).toHaveLength(0)
    })

    it('combines warnings from all patterns', () => {
      // Create patterns with different issues
      const pattern1 = '\\*.txt'  // escaped wildcard
      const pattern2 = '*.js   '  // trailing spaces
      
      const warnings = analyzePatterns([pattern1, pattern2])
      expect(warnings.length).toBe(2)
      
      const types = warnings.map(w => w.warningType)
      expect(types).toContain('escaped_wildcard_at_start')
      expect(types).toContain('trailing_spaces')
    })
  })

  describe('warning message quality', () => {
    it('messages are helpful and actionable', () => {
      const escapedWarnings = analyzePattern('\\*.txt')
      expect(escapedWarnings[0].message).toContain('Did you mean')
      expect(escapedWarnings[0].suggestion).toBeDefined()

      const trailingWarnings = analyzePattern('*.txt   ')
      expect(trailingWarnings[0].message).toContain('trailing spaces')
      expect(trailingWarnings[0].suggestion).toBe('*.txt')
    })

    it('includes pattern in warning info', () => {
      const warnings = analyzePattern('\\*.txt')
      expect(warnings[0].pattern).toBe('\\*.txt')
    })
  })
})
