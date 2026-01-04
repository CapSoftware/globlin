/**
 * matchBase option compatibility tests
 * Ported from vendor/glob/test/match-base.ts
 * 
 * matchBase: when true, if the pattern has no slashes, it is matched
 * against the basename of the path if it contains slashes.
 * For example, a*b would match the path /xyz/123/acb, but not /xyz/acb/123.
 * 
 * Internally, this prepends "**\/" to patterns without path separators.
 * Cannot be used with noglobstar: true.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { glob as globOriginal, globSync as globSyncOriginal } from 'glob'
import { createTestFixture, cleanupFixture, loadGloblin } from '../harness'
import type { GloblinModule } from '../harness'

// Fixture structure mimicking vendor/glob/test/fixtures for matchBase tests
// Note: We don't include symlinks here because symlink behavior is tested
// separately in follow.test.ts. Using symlinks here would cause test
// differences due to the default follow:false behavior of globlin.
const MATCH_BASE_FIXTURE = {
  files: [
    // Root level file 
    'aroot',
    // Nested files starting with 'a' 
    'a/abcdef',
    'a/abcfed',
    'a/b/file.txt',
    'a/bc/file.txt',
    // Deeper nesting with 'a' pattern matches
    'a/b/c/a',
    'd/e/f',
  ],
  dirs: [
    'a',
    'a/b',
    'a/b/c',
    'a/bc',
    'd',
    'd/e',
  ],
}

describe('matchBase option', () => {
  let fixturePath: string
  let globlin: GloblinModule

  beforeAll(async () => {
    fixturePath = await createTestFixture('match-base', MATCH_BASE_FIXTURE)
    globlin = await loadGloblin()
  })

  afterAll(async () => {
    await cleanupFixture(fixturePath)
  })

  describe('basic matchBase behavior', () => {
    it('pattern without / matches against basename with matchBase:true', async () => {
      const pattern = 'a*'
      const globResult = await globOriginal(pattern, { cwd: fixturePath, matchBase: true })
      const globlinResult = await globlin.glob(pattern, { cwd: fixturePath, matchBase: true })

      expect(new Set(globlinResult)).toEqual(new Set(globResult))
      // Should match 'a' at root AND 'a/abcdef', 'a/abcfed', 'a/b/c/a', etc.
      expect(globResult.length).toBeGreaterThan(1)
    })

    it('pattern without / matches against basename with matchBase:true (sync)', () => {
      const pattern = 'a*'
      const globResult = globSyncOriginal(pattern, { cwd: fixturePath, matchBase: true })
      const globlinResult = globlin.globSync(pattern, { cwd: fixturePath, matchBase: true })

      expect(new Set(globlinResult)).toEqual(new Set(globResult))
    })

    it('pattern with / is used as-is even with matchBase:true', async () => {
      const pattern = 'a/b*'
      const globResult = await globOriginal(pattern, { cwd: fixturePath, matchBase: true })
      const globlinResult = await globlin.glob(pattern, { cwd: fixturePath, matchBase: true })

      expect(new Set(globlinResult)).toEqual(new Set(globResult))
      // Should match 'a/b' and 'a/bc' - not nested versions
      expect(globResult).toContain('a/b')
      expect(globResult).toContain('a/bc')
    })

    it('pattern with / is used as-is (sync)', () => {
      const pattern = 'a/b*'
      const globResult = globSyncOriginal(pattern, { cwd: fixturePath, matchBase: true })
      const globlinResult = globlin.globSync(pattern, { cwd: fixturePath, matchBase: true })

      expect(new Set(globlinResult)).toEqual(new Set(globResult))
    })
  })

  describe('matchBase with brace expansion', () => {
    it('one brace section with / is used as-is', async () => {
      const pattern = 'a{*,/b*}'
      const globResult = await globOriginal(pattern, { cwd: fixturePath, matchBase: true })
      const globlinResult = await globlin.glob(pattern, { cwd: fixturePath, matchBase: true })

      expect(new Set(globlinResult)).toEqual(new Set(globResult))
    })

    it('one brace section with / is used as-is (sync)', () => {
      const pattern = 'a{*,/b*}'
      const globResult = globSyncOriginal(pattern, { cwd: fixturePath, matchBase: true })
      const globlinResult = globlin.globSync(pattern, { cwd: fixturePath, matchBase: true })

      expect(new Set(globlinResult)).toEqual(new Set(globResult))
    })
  })

  describe('matchBase:false (default behavior)', () => {
    it('pattern without / only matches at root when matchBase:false', async () => {
      const pattern = 'a*'
      const globResult = await globOriginal(pattern, { cwd: fixturePath, matchBase: false })
      const globlinResult = await globlin.glob(pattern, { cwd: fixturePath, matchBase: false })

      expect(new Set(globlinResult)).toEqual(new Set(globResult))
      // Should only match 'a' at root, not nested files
    })

    it('default behavior (no matchBase) is same as matchBase:false', async () => {
      const pattern = 'a*'
      const resultDefault = await globOriginal(pattern, { cwd: fixturePath })
      const resultExplicit = await globOriginal(pattern, { cwd: fixturePath, matchBase: false })

      const globlinDefault = await globlin.glob(pattern, { cwd: fixturePath })
      const globlinExplicit = await globlin.glob(pattern, { cwd: fixturePath, matchBase: false })

      expect(new Set(resultDefault)).toEqual(new Set(resultExplicit))
      expect(new Set(globlinDefault)).toEqual(new Set(globlinExplicit))
    })
  })

  describe('matchBase + noglobstar conflict', () => {
    it('throws error when both matchBase and noglobstar are true (async)', async () => {
      const pattern = 'a*'
      
      // glob should reject
      await expect(
        globOriginal(pattern, { cwd: fixturePath, matchBase: true, noglobstar: true })
      ).rejects.toThrow()
      
      // globlin should also reject
      await expect(
        globlin.glob(pattern, { cwd: fixturePath, matchBase: true, noglobstar: true })
      ).rejects.toThrow()
    })

    it('throws error when both matchBase and noglobstar are true (sync)', () => {
      const pattern = 'a*'
      
      // glob should throw
      expect(() => 
        globSyncOriginal(pattern, { cwd: fixturePath, matchBase: true, noglobstar: true })
      ).toThrow()
      
      // globlin should also throw
      expect(() => 
        globlin.globSync(pattern, { cwd: fixturePath, matchBase: true, noglobstar: true })
      ).toThrow()
    })
  })

  describe('comparison tests', () => {
    const patterns = [
      'a*',
      'b*',
      '*.txt',
      'file*',
    ]

    for (const pattern of patterns) {
      it(`glob vs globlin match for '${pattern}' with matchBase:true`, async () => {
        const globResult = await globOriginal(pattern, { cwd: fixturePath, matchBase: true })
        const globlinResult = await globlin.glob(pattern, { cwd: fixturePath, matchBase: true })

        expect(new Set(globlinResult)).toEqual(new Set(globResult))
      })

      it(`glob vs globlin match for '${pattern}' with matchBase:true (sync)`, () => {
        const globResult = globSyncOriginal(pattern, { cwd: fixturePath, matchBase: true })
        const globlinResult = globlin.globSync(pattern, { cwd: fixturePath, matchBase: true })

        expect(new Set(globlinResult)).toEqual(new Set(globResult))
      })
    }
  })
})
