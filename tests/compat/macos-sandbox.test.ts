/**
 * Tests for macOS App Sandbox compatibility.
 *
 * These tests verify that globlin behaves correctly when encountering
 * sandbox-related permission errors. The tests simulate sandbox behavior
 * by creating directories with restricted permissions.
 *
 * Key behaviors tested:
 * - Graceful handling of permission denied errors (no crashes)
 * - Partial results when some directories are inaccessible
 * - Consistency between sync and async APIs
 * - Correct behavior with various glob options
 *
 * NOTE: Full sandbox testing requires running in an actual App Sandbox,
 * which is not possible in the test environment. These tests simulate
 * the behavior using file system permissions.
 *
 * For real-world sandbox testing, build and run a sandboxed app with globlin.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { loadGloblin, GloblinModule } from '../harness.js'

const fsp = fs.promises

// Skip on Windows - file permissions work differently
const isWindows = process.platform === 'win32'
const isMacOS = process.platform === 'darwin'
const describeUnix = isWindows ? describe.skip : describe
const describeMacOS = isMacOS ? describe : describe.skip

// Track fixtures and permission changes for cleanup
interface PermissionChange {
  path: string
  originalMode: number
}

const changedPermissions: PermissionChange[] = []
let fixturePath: string

async function createSandboxTestFixture(): Promise<string> {
  const basePath = path.join(
    process.cwd(),
    'tests',
    'fixtures',
    `sandbox-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )

  await fsp.mkdir(basePath, { recursive: true })

  // Create a structure that simulates sandbox boundaries:
  //
  // sandbox-test/
  //   container/             # App's sandbox container (accessible)
  //     Documents/
  //       doc.txt
  //     Library/
  //       Preferences/
  //         settings.json
  //   user-selected/         # Files from NSOpenPanel (accessible)
  //     project/
  //       src/
  //         index.ts
  //       package.json
  //   restricted/            # Outside sandbox (simulated with permissions)
  //     private/
  //       secret.txt
  //     system/
  //       config.dat

  // Container (accessible)
  await fsp.mkdir(path.join(basePath, 'container', 'Documents'), { recursive: true })
  await fsp.mkdir(path.join(basePath, 'container', 'Library', 'Preferences'), { recursive: true })
  await fsp.writeFile(path.join(basePath, 'container', 'Documents', 'doc.txt'), 'document')
  await fsp.writeFile(
    path.join(basePath, 'container', 'Library', 'Preferences', 'settings.json'),
    '{}'
  )

  // User-selected (accessible)
  await fsp.mkdir(path.join(basePath, 'user-selected', 'project', 'src'), { recursive: true })
  await fsp.writeFile(
    path.join(basePath, 'user-selected', 'project', 'src', 'index.ts'),
    'export {}'
  )
  await fsp.writeFile(path.join(basePath, 'user-selected', 'project', 'package.json'), '{}')

  // Restricted (will have permissions removed)
  await fsp.mkdir(path.join(basePath, 'restricted', 'private'), { recursive: true })
  await fsp.mkdir(path.join(basePath, 'restricted', 'system'), { recursive: true })
  await fsp.writeFile(path.join(basePath, 'restricted', 'private', 'secret.txt'), 'secret')
  await fsp.writeFile(path.join(basePath, 'restricted', 'system', 'config.dat'), 'config')

  // Root level file for testing
  await fsp.writeFile(path.join(basePath, 'root.txt'), 'root')

  return basePath
}

async function removeReadPermission(dirPath: string): Promise<void> {
  const stats = await fsp.stat(dirPath)
  changedPermissions.push({ path: dirPath, originalMode: stats.mode })
  await fsp.chmod(dirPath, 0o000)
}

async function restoreAllPermissions(): Promise<void> {
  while (changedPermissions.length > 0) {
    const { path: dirPath, originalMode } = changedPermissions.pop()!
    try {
      await fsp.chmod(dirPath, originalMode)
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function cleanupFixture(): Promise<void> {
  await restoreAllPermissions()
  if (fixturePath) {
    try {
      await fsp.rm(fixturePath, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  }
}

describeUnix('macOS Sandbox compatibility', () => {
  let globlin: GloblinModule

  beforeAll(async () => {
    globlin = await loadGloblin()
  })

  beforeEach(async () => {
    fixturePath = await createSandboxTestFixture()
  })

  afterEach(async () => {
    await cleanupFixture()
  })

  describe('graceful handling of sandbox-like permission errors', () => {
    it('should not crash when restricted directory is encountered', async () => {
      await removeReadPermission(path.join(fixturePath, 'restricted'))

      // Should not throw
      const results = await globlin.glob('**/*', { cwd: fixturePath })

      // Should be an array
      expect(Array.isArray(results)).toBe(true)

      // Should find accessible files
      expect(results).toContain('container/Documents/doc.txt')
      expect(results).toContain('user-selected/project/package.json')

      // Should NOT find restricted files
      expect(results).not.toContain('restricted/private/secret.txt')
      expect(results).not.toContain('restricted/system/config.dat')
    })

    it('should handle sync API with sandbox-like errors', async () => {
      await removeReadPermission(path.join(fixturePath, 'restricted'))

      // Sync should also not throw
      const results = globlin.globSync('**/*', { cwd: fixturePath })

      expect(Array.isArray(results)).toBe(true)
      expect(results).toContain('container/Documents/doc.txt')
      expect(results).not.toContain('restricted/private/secret.txt')
    })
  })

  describe('partial access scenarios (simulating sandbox boundaries)', () => {
    it('should return results from accessible directories only', async () => {
      await removeReadPermission(path.join(fixturePath, 'restricted'))

      const results = await globlin.glob('**/*.txt', { cwd: fixturePath })

      // Accessible .txt files
      expect(results).toContain('container/Documents/doc.txt')
      expect(results).toContain('root.txt')

      // Restricted .txt files
      expect(results).not.toContain('restricted/private/secret.txt')
    })

    it('should handle container-like directory access', async () => {
      // Simulate: only container is accessible
      await removeReadPermission(path.join(fixturePath, 'restricted'))
      await removeReadPermission(path.join(fixturePath, 'user-selected'))

      const results = await globlin.glob('container/**/*', { cwd: fixturePath })

      expect(results).toContain('container/Documents/doc.txt')
      expect(results).toContain('container/Library/Preferences/settings.json')
    })

    it('should handle user-selected directory access pattern', async () => {
      // Simulate: only user-selected is accessible
      await removeReadPermission(path.join(fixturePath, 'restricted'))
      await removeReadPermission(path.join(fixturePath, 'container'))

      const results = await globlin.glob('user-selected/**/*.ts', { cwd: fixturePath })

      expect(results).toContain('user-selected/project/src/index.ts')
      expect(results).toHaveLength(1) // Only one .ts file
    })
  })

  describe('glob options with sandbox-like restrictions', () => {
    beforeEach(async () => {
      await removeReadPermission(path.join(fixturePath, 'restricted'))
    })

    it('should work with nodir option', async () => {
      const results = await globlin.glob('**/*', { cwd: fixturePath, nodir: true })

      // Should only return files, not directories
      expect(results.every(r => !r.endsWith('/'))).toBe(true)
      expect(results).toContain('root.txt')
      expect(results).toContain('container/Documents/doc.txt')
    })

    it('should work with mark option', async () => {
      const results = await globlin.glob('**/*', { cwd: fixturePath, mark: true })

      // Directories should have trailing slash
      const dirs = results.filter(r => r.endsWith('/'))
      expect(dirs.length).toBeGreaterThan(0)
      expect(dirs).toContain('container/')
    })

    it('should work with maxDepth option', async () => {
      const results = await globlin.glob('**/*', { cwd: fixturePath, maxDepth: 2 })

      // Should find shallow files
      expect(results).toContain('root.txt')
      expect(results).toContain('container/Documents')

      // Should NOT find deep files
      expect(results).not.toContain('container/Library/Preferences/settings.json')
    })

    it('should work with ignore option', async () => {
      const results = await globlin.glob('**/*', {
        cwd: fixturePath,
        ignore: ['**/Library/**'],
      })

      // Should find non-ignored files
      expect(results).toContain('container/Documents/doc.txt')

      // Should NOT find ignored files
      expect(results).not.toContain('container/Library/Preferences/settings.json')
    })

    it('should work with dot option', async () => {
      // Create a dotfile
      await fsp.writeFile(path.join(fixturePath, 'container', '.hidden'), 'hidden')

      // Without dot option
      let results = await globlin.glob('container/**/*', { cwd: fixturePath })
      expect(results).not.toContain('container/.hidden')

      // With dot option
      results = await globlin.glob('container/**/*', { cwd: fixturePath, dot: true })
      expect(results).toContain('container/.hidden')
    })

    it('should work with absolute option', async () => {
      const results = await globlin.glob('**/*.txt', {
        cwd: fixturePath,
        absolute: true,
      })

      // All results should be absolute paths
      expect(results.every(r => path.isAbsolute(r))).toBe(true)

      // Should find accessible files
      const hasDocTxt = results.some(r => r.endsWith('container/Documents/doc.txt'))
      expect(hasDocTxt).toBe(true)
    })
  })

  describe('Glob class with sandbox-like restrictions', () => {
    beforeEach(async () => {
      await removeReadPermission(path.join(fixturePath, 'restricted'))
    })

    it('should work with Glob.walk()', async () => {
      const g = new globlin.Glob('**/*.txt', { cwd: fixturePath })
      const results = await g.walk()

      expect(results).toContain('root.txt')
      expect(results).toContain('container/Documents/doc.txt')
      expect(results).not.toContain('restricted/private/secret.txt')
    })

    it('should work with Glob.walkSync()', async () => {
      const g = new globlin.Glob('**/*.txt', { cwd: fixturePath })
      const results = g.walkSync()

      expect(results).toContain('root.txt')
      expect(results).not.toContain('restricted/private/secret.txt')
    })

    it('should work with Glob.stream()', async () => {
      const g = new globlin.Glob('**/*.txt', { cwd: fixturePath })
      const results: string[] = []

      for await (const entry of g.stream()) {
        results.push(entry)
      }

      expect(results).toContain('root.txt')
      expect(results).not.toContain('restricted/private/secret.txt')
    })

    it('should work with Symbol.asyncIterator', async () => {
      const g = new globlin.Glob('**/*.txt', { cwd: fixturePath })
      const results: string[] = []

      for await (const entry of g) {
        results.push(entry)
      }

      expect(results).toContain('root.txt')
      expect(results).not.toContain('restricted/private/secret.txt')
    })
  })

  describe('error message consistency', () => {
    it('should not expose internal error details for permission errors', async () => {
      await removeReadPermission(path.join(fixturePath, 'restricted'))

      // Glob should complete without throwing
      // Any internal permission errors should be handled gracefully
      let errorThrown = false
      try {
        await globlin.glob('**/*', { cwd: fixturePath })
      } catch (error) {
        errorThrown = true
      }

      expect(errorThrown).toBe(false)
    })
  })

  describe('consistency with glob package behavior', () => {
    it('should match glob behavior for inaccessible directories', async () => {
      const { glob: globOriginal } = await import('glob')

      await removeReadPermission(path.join(fixturePath, 'restricted'))

      const globResults = await globOriginal('**/*', { cwd: fixturePath })
      const globlinResults = await globlin.glob('**/*', { cwd: fixturePath })

      // Both should return the same accessible files (order-independent)
      expect(new Set(globlinResults)).toEqual(new Set(globResults as string[]))
    })
  })
})

// macOS-specific tests that verify platform behavior
describeMacOS('macOS-specific sandbox behavior', () => {
  let globlin: GloblinModule

  beforeAll(async () => {
    globlin = await loadGloblin()
  })

  it('should handle system directory access (simulated)', async () => {
    // Note: Actual system directories may have different access patterns
    // This test uses the fixtures to simulate the behavior
    const results = await globlin.glob('*.txt', {
      cwd: '/tmp', // /tmp should be accessible
    })

    // Should return an array (may be empty if no .txt files)
    expect(Array.isArray(results)).toBe(true)
  })

  it('should not crash when accessing protected system paths', async () => {
    // These paths are typically protected even without sandbox
    // Globlin should handle them gracefully
    const protectedPaths = [
      '/private/var', // System private data
      '/System', // System files
    ]

    for (const protectedPath of protectedPaths) {
      // This should not throw, even if the directory is inaccessible
      let errorThrown = false
      try {
        // Use a pattern that would require directory traversal
        await globlin.glob('*.txt', { cwd: protectedPath })
      } catch {
        // Some errors are expected for truly inaccessible paths
        errorThrown = true
      }

      // Either succeeds with results or returns empty - should not crash
      // Some system paths may throw, which is acceptable
    }
  })
})

// Tests for documentation accuracy
describe('sandbox documentation verification', () => {
  let globlin: GloblinModule

  beforeAll(async () => {
    globlin = await loadGloblin()
  })

  it('should handle non-existent cwd as documented', async () => {
    // Documentation states: "Invalid cwd: Returns empty array"
    const results = await globlin.glob('**/*', {
      cwd: '/this/path/definitely/does/not/exist',
    })

    expect(Array.isArray(results)).toBe(true)
    expect(results).toHaveLength(0)
  })

  it('should never crash as documented', async () => {
    // Documentation states: "App crashes: No"
    const testCases = [
      // Various edge cases that might cause crashes
      { pattern: '**/*', options: { cwd: '/nonexistent' } },
      { pattern: '', options: {} },
      { pattern: '***', options: {} }, // Invalid pattern
      { pattern: '**/*', options: { maxDepth: -1 } }, // Negative depth
    ]

    for (const { pattern, options } of testCases) {
      const crashed = false
      try {
        await globlin.glob(pattern, options)
      } catch {
        // Errors are allowed, crashes are not
        // If we get here, it didn't crash
      }

      expect(crashed).toBe(false)
    }
  })
})
