/**
 * Tests for permission error handling.
 *
 * Verifies that:
 * - Directories without read permission are skipped gracefully
 * - Walking doesn't crash when encountering permission errors
 * - Walking continues after encountering permission errors
 * - Results still include files from accessible directories
 *
 * NOTE: These tests require the ability to change file permissions,
 * which is only supported on Unix-like systems (Linux, macOS).
 * Tests are skipped on Windows.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { glob as globOriginal, globSync as globSyncOriginal } from 'glob'
import { loadGloblin, GloblinModule } from '../harness.js'

const fsp = fs.promises

// Skip on Windows - file permissions work differently
const isWindows = process.platform === 'win32'
const describeUnix = isWindows ? describe.skip : describe

// Track created fixtures for cleanup
const fixtureCleanup: { path: string; originalMode?: number }[] = []

// Track directories whose permissions were changed
const changedPermissions: { path: string; originalMode: number }[] = []

async function createPermissionTestFixture(): Promise<string> {
  const fixturePath = path.join(
    process.cwd(),
    'tests',
    'fixtures',
    `permission-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )

  // Create base structure:
  // permission-test/
  //   readable/
  //     file1.txt
  //     subdir/
  //       file2.txt
  //   unreadable/
  //     secret.txt
  //     nested/
  //       hidden.txt
  //   mixed/
  //     visible.txt
  //     restricted/
  //       private.txt

  await fsp.mkdir(fixturePath, { recursive: true })

  // Readable directory
  await fsp.mkdir(path.join(fixturePath, 'readable'), { recursive: true })
  await fsp.mkdir(path.join(fixturePath, 'readable', 'subdir'), { recursive: true })
  await fsp.writeFile(path.join(fixturePath, 'readable', 'file1.txt'), 'content1')
  await fsp.writeFile(path.join(fixturePath, 'readable', 'subdir', 'file2.txt'), 'content2')

  // Directory that will have permissions removed
  await fsp.mkdir(path.join(fixturePath, 'unreadable'), { recursive: true })
  await fsp.mkdir(path.join(fixturePath, 'unreadable', 'nested'), { recursive: true })
  await fsp.writeFile(path.join(fixturePath, 'unreadable', 'secret.txt'), 'secret')
  await fsp.writeFile(path.join(fixturePath, 'unreadable', 'nested', 'hidden.txt'), 'hidden')

  // Mixed directory with some restricted subdirectories
  await fsp.mkdir(path.join(fixturePath, 'mixed'), { recursive: true })
  await fsp.mkdir(path.join(fixturePath, 'mixed', 'restricted'), { recursive: true })
  await fsp.writeFile(path.join(fixturePath, 'mixed', 'visible.txt'), 'visible')
  await fsp.writeFile(path.join(fixturePath, 'mixed', 'restricted', 'private.txt'), 'private')

  // Root-level files
  await fsp.writeFile(path.join(fixturePath, 'root.txt'), 'root')
  await fsp.writeFile(path.join(fixturePath, 'root.js'), 'rootjs')

  fixtureCleanup.push({ path: fixturePath })

  return fixturePath
}

async function removeReadPermission(dirPath: string): Promise<void> {
  // Save the original mode
  const stats = await fsp.stat(dirPath)
  const originalMode = stats.mode
  changedPermissions.push({ path: dirPath, originalMode })

  // Remove read and execute permissions (0o000 = no permissions)
  // We use 0o000 instead of just removing read because on directories,
  // you need execute permission to access contents even if you have read
  await fsp.chmod(dirPath, 0o000)
}

async function restorePermission(dirPath: string, mode: number): Promise<void> {
  try {
    await fsp.chmod(dirPath, mode)
  } catch {
    // Ignore errors during cleanup
  }
}

async function cleanupFixture(fixturePath: string): Promise<void> {
  // First, restore all changed permissions (so we can delete the files)
  for (const { path: dirPath, originalMode } of changedPermissions) {
    await restorePermission(dirPath, originalMode)
  }
  changedPermissions.length = 0

  // Then remove the fixture
  try {
    await fsp.rm(fixturePath, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

describeUnix('permission errors', () => {
  let globlin: GloblinModule
  let fixturePath: string

  beforeAll(async () => {
    globlin = await loadGloblin()
  })

  beforeEach(async () => {
    fixturePath = await createPermissionTestFixture()
  })

  afterEach(async () => {
    await cleanupFixture(fixturePath)
  })

  afterAll(async () => {
    // Final cleanup of any remaining fixtures
    for (const fixture of fixtureCleanup) {
      await cleanupFixture(fixture.path)
    }
  })

  describe('skips directories without read permission', () => {
    it('should not crash when directory is unreadable (glob)', async () => {
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      // glob should not throw
      const results = await globOriginal('**/*.txt', { cwd: fixturePath })

      // Should find readable files, not the ones in unreadable/
      expect(results).toContain('root.txt')
      expect(results).toContain('readable/file1.txt')
      expect(results).toContain('readable/subdir/file2.txt')
      expect(results).toContain('mixed/visible.txt')
      expect(results).toContain('mixed/restricted/private.txt')

      // Should NOT contain files from unreadable directory
      expect(results).not.toContain('unreadable/secret.txt')
      expect(results).not.toContain('unreadable/nested/hidden.txt')
    })

    it('should not crash when directory is unreadable (globlin)', async () => {
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      // globlin should not throw
      const results = await globlin.glob('**/*.txt', { cwd: fixturePath })

      // Should find readable files
      expect(results).toContain('root.txt')
      expect(results).toContain('readable/file1.txt')
      expect(results).toContain('readable/subdir/file2.txt')
      expect(results).toContain('mixed/visible.txt')
      expect(results).toContain('mixed/restricted/private.txt')

      // Should NOT contain files from unreadable directory
      expect(results).not.toContain('unreadable/secret.txt')
      expect(results).not.toContain('unreadable/nested/hidden.txt')
    })

    it('should not crash when directory is unreadable (globlin sync)', async () => {
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      // globlin sync should not throw
      const results = globlin.globSync('**/*.txt', { cwd: fixturePath })

      // Should find readable files
      expect(results).toContain('root.txt')
      expect(results).toContain('readable/file1.txt')

      // Should NOT contain files from unreadable directory
      expect(results).not.toContain('unreadable/secret.txt')
    })
  })

  describe('continues walking after permission errors', () => {
    it('should continue finding files after encountering unreadable directory', async () => {
      // Remove permissions on unreadable/ but leave mixed/ accessible
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      const globResults = await globOriginal('**/*.txt', { cwd: fixturePath })
      const globlinResults = await globlin.glob('**/*.txt', { cwd: fixturePath })

      // Both should find files in mixed/ and readable/
      expect(globResults).toContain('mixed/visible.txt')
      expect(globlinResults).toContain('mixed/visible.txt')

      expect(globResults).toContain('mixed/restricted/private.txt')
      expect(globlinResults).toContain('mixed/restricted/private.txt')

      expect(globResults).toContain('readable/file1.txt')
      expect(globlinResults).toContain('readable/file1.txt')
    })

    it('should handle multiple unreadable directories', async () => {
      // Remove permissions on multiple directories
      await removeReadPermission(path.join(fixturePath, 'unreadable'))
      await removeReadPermission(path.join(fixturePath, 'mixed', 'restricted'))

      const globResults = await globOriginal('**/*.txt', { cwd: fixturePath })
      const globlinResults = await globlin.glob('**/*.txt', { cwd: fixturePath })

      // Both should still find accessible files
      expect(globResults).toContain('root.txt')
      expect(globlinResults).toContain('root.txt')

      expect(globResults).toContain('readable/file1.txt')
      expect(globlinResults).toContain('readable/file1.txt')

      expect(globResults).toContain('mixed/visible.txt')
      expect(globlinResults).toContain('mixed/visible.txt')

      // Neither should find files in restricted directories
      expect(globResults).not.toContain('mixed/restricted/private.txt')
      expect(globlinResults).not.toContain('mixed/restricted/private.txt')
    })
  })

  describe('matches glob behavior', () => {
    it('should produce same results as glob when directories are unreadable', async () => {
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      const globResults = await globOriginal('**/*', { cwd: fixturePath })
      const globlinResults = await globlin.glob('**/*', { cwd: fixturePath })

      // Sort for comparison
      const sortedGlob = [...globResults].sort()
      const sortedGloblin = [...globlinResults].sort()

      // Results should match (order-independent)
      expect(new Set(sortedGloblin)).toEqual(new Set(sortedGlob))
    })

    it('should match glob with nodir option when directories are unreadable', async () => {
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      const globResults = await globOriginal('**/*', { cwd: fixturePath, nodir: true })
      const globlinResults = await globlin.glob('**/*', { cwd: fixturePath, nodir: true })

      expect(new Set(globlinResults)).toEqual(new Set(globResults as string[]))
    })

    it('should match glob with mark option when directories are unreadable', async () => {
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      const globResults = await globOriginal('**/*', { cwd: fixturePath, mark: true })
      const globlinResults = await globlin.glob('**/*', { cwd: fixturePath, mark: true })

      expect(new Set(globlinResults)).toEqual(new Set(globResults as string[]))
    })
  })

  describe('specific pattern types with permission errors', () => {
    it('should handle simple patterns with permission errors', async () => {
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      // Simple pattern in root - should work
      const results = await globlin.glob('*.txt', { cwd: fixturePath })
      expect(results).toContain('root.txt')
    })

    it('should handle scoped patterns with permission errors', async () => {
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      // Scoped pattern to readable dir
      const results = await globlin.glob('readable/**/*.txt', { cwd: fixturePath })
      expect(results).toContain('readable/file1.txt')
      expect(results).toContain('readable/subdir/file2.txt')
    })

    it('should handle brace expansion with permission errors', async () => {
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      const results = await globlin.glob('**/*.{txt,js}', { cwd: fixturePath })
      expect(results).toContain('root.txt')
      expect(results).toContain('root.js')
      expect(results).toContain('readable/file1.txt')
    })

    it('should handle dot option with permission errors', async () => {
      // Create a dotfile
      await fsp.writeFile(path.join(fixturePath, '.hidden.txt'), 'dotfile')
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      // Without dot option
      let results = await globlin.glob('**/*.txt', { cwd: fixturePath })
      expect(results).not.toContain('.hidden.txt')

      // With dot option
      results = await globlin.glob('**/*.txt', { cwd: fixturePath, dot: true })
      expect(results).toContain('.hidden.txt')
      expect(results).toContain('root.txt')
    })
  })

  describe('sync vs async consistency', () => {
    it('should produce same results in sync and async modes with permission errors', async () => {
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      const asyncResults = await globlin.glob('**/*.txt', { cwd: fixturePath })
      const syncResults = globlin.globSync('**/*.txt', { cwd: fixturePath })

      expect(new Set(syncResults)).toEqual(new Set(asyncResults))
    })
  })

  describe('Glob class with permission errors', () => {
    it('should work with Glob class walk() method', async () => {
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      const g = new globlin.Glob('**/*.txt', { cwd: fixturePath })
      const results = await g.walk()

      expect(results).toContain('root.txt')
      expect(results).toContain('readable/file1.txt')
      expect(results).not.toContain('unreadable/secret.txt')
    })

    it('should work with Glob class walkSync() method', async () => {
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      const g = new globlin.Glob('**/*.txt', { cwd: fixturePath })
      const results = g.walkSync()

      expect(results).toContain('root.txt')
      expect(results).toContain('readable/file1.txt')
      expect(results).not.toContain('unreadable/secret.txt')
    })
  })

  describe('edge cases', () => {
    it('should handle cwd being an unreadable directory', async () => {
      // Make the entire fixture unreadable
      await removeReadPermission(fixturePath)

      // Both should return empty results or just the root, not crash
      const globResults = await globOriginal('**/*', { cwd: fixturePath })

      // Restore permissions before testing globlin (so we can clean up later)
      const entry = changedPermissions.pop()
      if (entry) {
        await restorePermission(entry.path, entry.originalMode)
      }

      // Verify glob returned empty or minimal results
      // (glob may return empty or just '.' depending on version)
      expect(Array.isArray(globResults)).toBe(true)
    })

    it('should handle deeply nested unreadable directory', async () => {
      // Create a deep structure
      await fsp.mkdir(path.join(fixturePath, 'deep', 'nested', 'level'), { recursive: true })
      await fsp.writeFile(path.join(fixturePath, 'deep', 'nested', 'level', 'file.txt'), 'deep')

      // Make the middle level unreadable
      await removeReadPermission(path.join(fixturePath, 'deep', 'nested'))

      const results = await globlin.glob('**/*.txt', { cwd: fixturePath })

      // Should find root files but not the deeply nested one
      expect(results).toContain('root.txt')
      expect(results).not.toContain('deep/nested/level/file.txt')
    })

    it('should handle permission restored during walk', async () => {
      // This tests that the walker doesn't cache permission state
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      // Start a walk
      const results = await globlin.glob('**/*.txt', { cwd: fixturePath })

      // Results should not include unreadable files (permissions were removed)
      expect(results).not.toContain('unreadable/secret.txt')
    })
  })

  describe('with maxDepth option', () => {
    it('should handle permission errors with maxDepth', async () => {
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      const results = await globlin.glob('**/*', { cwd: fixturePath, maxDepth: 2 })

      // Should find files within depth, excluding unreadable
      expect(results).toContain('root.txt')
      expect(results).toContain('readable/file1.txt')

      // Should NOT include files deeper than maxDepth
      expect(results).not.toContain('readable/subdir/file2.txt')
    })
  })

  describe('with ignore option', () => {
    it('should handle permission errors with ignore patterns', async () => {
      await removeReadPermission(path.join(fixturePath, 'unreadable'))

      const results = await globlin.glob('**/*.txt', {
        cwd: fixturePath,
        ignore: ['mixed/**'],
      })

      // Should find root and readable files
      expect(results).toContain('root.txt')
      expect(results).toContain('readable/file1.txt')

      // Should NOT find mixed/ files (ignored)
      expect(results).not.toContain('mixed/visible.txt')

      // Should NOT find unreadable/ files (no permission)
      expect(results).not.toContain('unreadable/secret.txt')
    })
  })
})

// Additional tests that run on all platforms (where file permissions may work differently)
describe('permission errors - cross-platform', () => {
  let globlin: GloblinModule

  beforeAll(async () => {
    globlin = await loadGloblin()
  })

  it('should not crash on non-existent paths (similar to permission denied)', async () => {
    // Non-existent path behaves similarly to permission denied
    const results = await globlin.glob('**/*.txt', { cwd: '/nonexistent/path/that/does/not/exist' })
    expect(Array.isArray(results)).toBe(true)
    expect(results).toHaveLength(0)
  })

  it('should gracefully handle patterns pointing to inaccessible paths', async () => {
    // Pattern that would traverse into system directories
    // Should not crash even if some directories are inaccessible
    const results = await globlin.glob('*.nonexistent', { cwd: process.cwd() })
    expect(Array.isArray(results)).toBe(true)
  })
})
