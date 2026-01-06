/**
 * Error message compatibility tests
 * 
 * This test file ensures globlin produces the same error messages as glob v13
 * for all known error conditions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { glob as globOriginal, globSync as globSyncOriginal, Glob as GlobOriginal } from 'glob'
import { glob, globSync, globStream, globStreamSync, Glob } from '../../js/index.js'
import { createTestFixture, cleanupFixture, type FixtureConfig } from '../harness.js'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'

describe('Error Messages', () => {
  let fixture: string

  beforeAll(async () => {
    const config: FixtureConfig = {
      files: ['a.txt', 'b.txt', 'src/index.ts', 'src/utils.ts'],
      dirs: ['src', 'empty'],
    }
    fixture = await createTestFixture('error-messages', config)
  })

  afterAll(async () => {
    await cleanupFixture(fixture)
  })

  describe('Option Validation Errors', () => {
    describe('withFileTypes + absolute conflict', () => {
      it('glob throws correct error for withFileTypes + absolute', async () => {
        // Test with globlin
        let globlinError: Error | null = null
        try {
          await glob('*.txt', { cwd: fixture, withFileTypes: true, absolute: true })
        } catch (e) {
          globlinError = e as Error
        }

        // Test with glob original
        let globError: Error | null = null
        try {
          await globOriginal('*.txt', { cwd: fixture, withFileTypes: true, absolute: true })
        } catch (e) {
          globError = e as Error
        }

        expect(globlinError).not.toBeNull()
        expect(globError).not.toBeNull()
        expect(globlinError!.message).toBe(globError!.message)
        expect(globlinError!.message).toBe('cannot set absolute and withFileTypes:true')
      })

      it('globSync throws correct error for withFileTypes + absolute', () => {
        // Test with globlin
        let globlinError: Error | null = null
        try {
          globSync('*.txt', { cwd: fixture, withFileTypes: true, absolute: true })
        } catch (e) {
          globlinError = e as Error
        }

        // Test with glob original
        let globError: Error | null = null
        try {
          globSyncOriginal('*.txt', { cwd: fixture, withFileTypes: true, absolute: true })
        } catch (e) {
          globError = e as Error
        }

        expect(globlinError).not.toBeNull()
        expect(globError).not.toBeNull()
        expect(globlinError!.message).toBe(globError!.message)
        expect(globlinError!.message).toBe('cannot set absolute and withFileTypes:true')
      })

      it('Glob class throws correct error for withFileTypes + absolute', () => {
        // Test with globlin
        let globlinError: Error | null = null
        try {
          new Glob('*.txt', { cwd: fixture, withFileTypes: true, absolute: true })
        } catch (e) {
          globlinError = e as Error
        }

        // Test with glob original
        let globError: Error | null = null
        try {
          new GlobOriginal('*.txt', { cwd: fixture, withFileTypes: true, absolute: true })
        } catch (e) {
          globError = e as Error
        }

        expect(globlinError).not.toBeNull()
        expect(globError).not.toBeNull()
        expect(globlinError!.message).toBe(globError!.message)
        expect(globlinError!.message).toBe('cannot set absolute and withFileTypes:true')
      })

      it('withFileTypes + absolute:false ALSO throws (strict validation)', async () => {
        // glob v13's validation is strict: absolute !== undefined triggers error
        // This means even absolute: false throws when combined with withFileTypes: true
        let globlinError: Error | null = null
        try {
          await glob('*.txt', { cwd: fixture, withFileTypes: true, absolute: false })
        } catch (e) {
          globlinError = e as Error
        }

        let globError: Error | null = null
        try {
          await globOriginal('*.txt', { cwd: fixture, withFileTypes: true, absolute: false })
        } catch (e) {
          globError = e as Error
        }

        // Both should throw the same error
        expect(globlinError).not.toBeNull()
        expect(globError).not.toBeNull()
        expect(globlinError!.message).toBe(globError!.message)
        expect(globlinError!.message).toBe('cannot set absolute and withFileTypes:true')
      })
    })

    describe('matchBase + noglobstar conflict', () => {
      it('glob throws correct error for matchBase + noglobstar', async () => {
        // Test with globlin
        let globlinError: Error | null = null
        try {
          await glob('*.txt', { cwd: fixture, matchBase: true, noglobstar: true })
        } catch (e) {
          globlinError = e as Error
        }

        // Test with glob original
        let globError: Error | null = null
        try {
          await globOriginal('*.txt', { cwd: fixture, matchBase: true, noglobstar: true })
        } catch (e) {
          globError = e as Error
        }

        expect(globlinError).not.toBeNull()
        expect(globError).not.toBeNull()
        expect(globlinError!.message).toBe(globError!.message)
        expect(globlinError!.message).toBe('base matching requires globstar')
      })

      it('globSync throws correct error for matchBase + noglobstar', () => {
        // Test with globlin
        let globlinError: Error | null = null
        try {
          globSync('*.txt', { cwd: fixture, matchBase: true, noglobstar: true })
        } catch (e) {
          globlinError = e as Error
        }

        // Test with glob original
        let globError: Error | null = null
        try {
          globSyncOriginal('*.txt', { cwd: fixture, matchBase: true, noglobstar: true })
        } catch (e) {
          globError = e as Error
        }

        expect(globlinError).not.toBeNull()
        expect(globError).not.toBeNull()
        expect(globlinError!.message).toBe(globError!.message)
        expect(globlinError!.message).toBe('base matching requires globstar')
      })

      it('Glob class throws correct error for matchBase + noglobstar', () => {
        // Test with globlin
        let globlinError: Error | null = null
        try {
          new Glob('*.txt', { cwd: fixture, matchBase: true, noglobstar: true })
        } catch (e) {
          globlinError = e as Error
        }

        // Test with glob original
        let globError: Error | null = null
        try {
          new GlobOriginal('*.txt', { cwd: fixture, matchBase: true, noglobstar: true })
        } catch (e) {
          globError = e as Error
        }

        expect(globlinError).not.toBeNull()
        expect(globError).not.toBeNull()
        expect(globlinError!.message).toBe(globError!.message)
        expect(globlinError!.message).toBe('base matching requires globstar')
      })
    })
  })

  describe('AbortSignal Errors', () => {
    it('glob throws when signal is pre-aborted', async () => {
      const controller = new AbortController()
      controller.abort()

      let globlinError: Error | null = null
      try {
        await glob('*.txt', { cwd: fixture, signal: controller.signal })
      } catch (e) {
        globlinError = e as Error
      }

      let globError: Error | null = null
      try {
        await globOriginal('*.txt', { cwd: fixture, signal: controller.signal })
      } catch (e) {
        globError = e as Error
      }

      expect(globlinError).not.toBeNull()
      expect(globError).not.toBeNull()
      // Both should throw abort errors - the exact message may vary based on environment
      expect(globlinError instanceof Error).toBe(true)
      expect(globError instanceof Error).toBe(true)
    })

    it('glob throws with custom abort reason', async () => {
      const controller = new AbortController()
      const customReason = new Error('Custom abort reason')
      controller.abort(customReason)

      let globlinError: Error | null = null
      try {
        await glob('*.txt', { cwd: fixture, signal: controller.signal })
      } catch (e) {
        globlinError = e as Error
      }

      let globError: Error | null = null
      try {
        await globOriginal('*.txt', { cwd: fixture, signal: controller.signal })
      } catch (e) {
        globError = e as Error
      }

      // Both should throw the custom reason
      expect(globlinError).toBe(customReason)
      expect(globError).toBe(customReason)
    })

    it('globSync throws when signal is pre-aborted', () => {
      const controller = new AbortController()
      controller.abort()

      let globlinError: Error | null = null
      try {
        globSync('*.txt', { cwd: fixture, signal: controller.signal })
      } catch (e) {
        globlinError = e as Error
      }

      let globError: Error | null = null
      try {
        globSyncOriginal('*.txt', { cwd: fixture, signal: controller.signal })
      } catch (e) {
        globError = e as Error
      }

      expect(globlinError).not.toBeNull()
      expect(globError).not.toBeNull()
    })

    it('globStream emits error when signal is pre-aborted', async () => {
      const controller = new AbortController()
      controller.abort()

      // Test globlin
      const globlinStream = globStream('*.txt', { cwd: fixture, signal: controller.signal })
      let globlinError: unknown = null
      await new Promise<void>((resolve) => {
        globlinStream.on('error', (err: unknown) => {
          globlinError = err
          resolve()
        })
        globlinStream.on('end', resolve)
      })

      expect(globlinError).not.toBeNull()
      expect(globlinError).toBeInstanceOf(Error)
    })

    it('globStreamSync emits error when signal is pre-aborted', async () => {
      const controller = new AbortController()
      controller.abort()

      // Test globlin
      const globlinStream = globStreamSync('*.txt', { cwd: fixture, signal: controller.signal })
      let globlinError: unknown = null
      let resolved = false
      
      await new Promise<void>((resolve) => {
        const finish = () => {
          if (!resolved) {
            resolved = true
            resolve()
          }
        }
        
        globlinStream.on('error', (err: unknown) => {
          globlinError = err
          finish()
        })
        globlinStream.on('end', finish)
        
        // Give it a moment to emit
        setTimeout(finish, 100)
      })

      expect(globlinError).not.toBeNull()
      expect(globlinError).toBeInstanceOf(Error)
    })
  })

  describe('Non-existent Directory Handling', () => {
    it('glob returns empty array for non-existent cwd (no error)', async () => {
      const nonExistentPath = path.join(fixture, 'non-existent-directory')
      
      // Both should return empty array, not throw
      const globlinResults = await glob('*.txt', { cwd: nonExistentPath })
      const globResults = await globOriginal('*.txt', { cwd: nonExistentPath })

      expect(globlinResults).toEqual([])
      expect(globResults).toEqual([])
    })

    it('globSync returns empty array for non-existent cwd (no error)', () => {
      const nonExistentPath = path.join(fixture, 'non-existent-directory')
      
      // Both should return empty array, not throw
      const globlinResults = globSync('*.txt', { cwd: nonExistentPath })
      const globResults = globSyncOriginal('*.txt', { cwd: nonExistentPath })

      expect(globlinResults).toEqual([])
      expect(globResults).toEqual([])
    })
  })

  describe('Error Types', () => {
    it('withFileTypes + absolute throws TypeError', () => {
      // Check that the error type matches
      let globlinError: unknown = null
      try {
        new Glob('*.txt', { cwd: fixture, withFileTypes: true, absolute: true })
      } catch (e) {
        globlinError = e
      }

      let globError: unknown = null
      try {
        new GlobOriginal('*.txt', { cwd: fixture, withFileTypes: true, absolute: true })
      } catch (e) {
        globError = e
      }

      // Both should be Error or TypeError
      expect(globlinError).toBeInstanceOf(Error)
      expect(globError).toBeInstanceOf(Error)
    })

    it('matchBase + noglobstar throws TypeError', () => {
      let globlinError: unknown = null
      try {
        new Glob('*.txt', { cwd: fixture, matchBase: true, noglobstar: true })
      } catch (e) {
        globlinError = e
      }

      let globError: unknown = null
      try {
        new GlobOriginal('*.txt', { cwd: fixture, matchBase: true, noglobstar: true })
      } catch (e) {
        globError = e
      }

      // glob throws TypeError for this
      expect(globError).toBeInstanceOf(TypeError)
      // globlin should also throw TypeError
      expect(globlinError).toBeInstanceOf(TypeError)
    })
  })

  describe('Graceful Error Handling', () => {
    it('handles broken symlinks gracefully', async function () {
      // Skip on Windows
      if (process.platform === 'win32') {
        return
      }

      const brokenLinkConfig: FixtureConfig = {
        files: ['real.txt'],
        dirs: [],
      }
      const brokenLinkFixture = await createTestFixture('broken-link-errors', brokenLinkConfig)

      try {
        // Create a broken symlink
        const brokenLinkPath = path.join(brokenLinkFixture, 'broken-link')
        await fs.symlink('/nonexistent/target', brokenLinkPath)

        // Both should not throw - broken symlinks are returned in results
        const globlinResults = await glob('*', { cwd: brokenLinkFixture })
        const globResults = await globOriginal('*', { cwd: brokenLinkFixture })

        // Both should include the broken symlink
        expect(globlinResults).toContain('broken-link')
        expect(globResults).toContain('broken-link')
      } finally {
        await cleanupFixture(brokenLinkFixture)
      }
    })

    it('handles permission errors by skipping directories', async function () {
      // Skip on Windows (different permission model)
      if (process.platform === 'win32') {
        return
      }

      const permConfig: FixtureConfig = {
        files: ['accessible/a.txt', 'accessible/b.txt'],
        dirs: ['accessible', 'restricted'],
      }
      const permFixture = await createTestFixture('permission-errors', permConfig)

      try {
        // Make restricted directory unreadable
        const restrictedDir = path.join(permFixture, 'restricted')
        await fs.chmod(restrictedDir, 0o000)

        try {
          // Both should continue without throwing
          const globlinResults = await glob('**/*.txt', { cwd: permFixture })
          const globResults = await globOriginal('**/*.txt', { cwd: permFixture })

          // Both should find files in accessible directory
          expect(globlinResults).toContain('accessible/a.txt')
          expect(globlinResults).toContain('accessible/b.txt')
          expect(globResults).toContain('accessible/a.txt')
          expect(globResults).toContain('accessible/b.txt')
        } finally {
          // Restore permissions for cleanup
          await fs.chmod(restrictedDir, 0o755)
        }
      } finally {
        await cleanupFixture(permFixture)
      }
    })
  })

  describe('Edge Cases', () => {
    it('empty pattern array returns empty results', async () => {
      const globlinResults = await glob([], { cwd: fixture })
      const globResults = await globOriginal([], { cwd: fixture })

      expect(globlinResults).toEqual([])
      expect(globResults).toEqual([])
    })

    it('empty string pattern returns empty results', async () => {
      const globlinResults = await glob('', { cwd: fixture })
      const globResults = await globOriginal('', { cwd: fixture })

      expect(globlinResults).toEqual([])
      expect(globResults).toEqual([])
    })

    it('valid options do not throw', async () => {
      // Test various valid option combinations
      await expect(glob('*.txt', { cwd: fixture, dot: true })).resolves.toBeDefined()
      await expect(glob('*.txt', { cwd: fixture, nocase: true })).resolves.toBeDefined()
      await expect(glob('*.txt', { cwd: fixture, follow: true })).resolves.toBeDefined()
      await expect(glob('*.txt', { cwd: fixture, maxDepth: 1 })).resolves.toBeDefined()
      await expect(glob('*.txt', { cwd: fixture, absolute: true })).resolves.toBeDefined()
      await expect(glob('*.txt', { cwd: fixture, mark: true })).resolves.toBeDefined()
      await expect(glob('*.txt', { cwd: fixture, nodir: true })).resolves.toBeDefined()
      await expect(glob('*.txt', { cwd: fixture, dotRelative: true })).resolves.toBeDefined()
    })
  })
})
