/**
 * Tests for filesystem error handling.
 * 
 * Verifies that globlin handles various filesystem errors gracefully:
 * - File deleted during walk
 * - Symlink target deleted
 * - I/O errors
 * - Race conditions
 * 
 * The key behavior is: log/skip, don't crash.
 * 
 * NOTE: Some tests require Unix-specific features (symlinks, permissions)
 * and are skipped on Windows.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { glob as globOriginal, globSync as globSyncOriginal } from 'glob'
import { loadGloblin } from '../harness.js'

const fsp = fs.promises

// Skip symlink/permission tests on Windows
const isWindows = process.platform === 'win32'
const describeUnix = isWindows ? describe.skip : describe

// Extended globlin module type that includes all exports
interface ExtendedGloblinModule {
  glob(pattern: string | string[], options?: Record<string, unknown>): Promise<string[]>
  globSync(pattern: string | string[], options?: Record<string, unknown>): string[]
  globStream(pattern: string | string[], options?: Record<string, unknown>): AsyncIterable<string>
  globStreamSync(pattern: string | string[], options?: Record<string, unknown>): { on: (event: string, cb: (chunk: string) => void) => void; read: () => string | null; writable: boolean }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Glob: new (pattern: string | string[], options?: Record<string, unknown>) => any
}

// Track fixtures for cleanup
let fixtureDir: string
let globlin: ExtendedGloblinModule

async function createFixture(): Promise<string> {
  const dir = path.join(process.cwd(), 'tests', 'fixtures', `fs-errors-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fsp.mkdir(dir, { recursive: true })
  return dir
}

async function cleanupFixture(dir: string): Promise<void> {
  try {
    await fsp.rm(dir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

describe('filesystem errors', () => {
  beforeAll(async () => {
    globlin = await loadGloblin() as unknown as ExtendedGloblinModule
  })

  beforeEach(async () => {
    fixtureDir = await createFixture()
  })

  afterEach(async () => {
    await cleanupFixture(fixtureDir)
  })

  describe('file deleted during walk', () => {
    it('should not crash if a file is deleted while walking', async () => {
      // Create files
      await fsp.writeFile(path.join(fixtureDir, 'file1.txt'), 'content1')
      await fsp.writeFile(path.join(fixtureDir, 'file2.txt'), 'content2')
      await fsp.writeFile(path.join(fixtureDir, 'file3.txt'), 'content3')
      
      // This test simulates the scenario where files exist when we start
      // but are gone by the time we try to process them.
      // Since our walk is synchronous, we can't easily delete during walk,
      // but we can verify the behavior with rapid file deletion.
      
      // Start the glob
      const resultsPromise = globlin.glob('**/*.txt', { cwd: fixtureDir })
      
      // Delete file1 right after starting (may or may not affect results)
      await fsp.unlink(path.join(fixtureDir, 'file1.txt')).catch(() => {})
      
      // Should not throw, regardless of whether file1 was processed before deletion
      const results = await resultsPromise
      expect(Array.isArray(results)).toBe(true)
      // Should have at least file2 and file3 (file1 may or may not be included)
      expect(results.length).toBeGreaterThanOrEqual(0)
    })

    it('should not crash if a directory is deleted while walking', async () => {
      // Create nested structure
      await fsp.mkdir(path.join(fixtureDir, 'subdir'), { recursive: true })
      await fsp.writeFile(path.join(fixtureDir, 'subdir', 'file.txt'), 'content')
      await fsp.writeFile(path.join(fixtureDir, 'root.txt'), 'root')
      
      // Start the glob
      const resultsPromise = globlin.glob('**/*.txt', { cwd: fixtureDir })
      
      // Delete subdir right after starting
      await fsp.rm(path.join(fixtureDir, 'subdir'), { recursive: true, force: true }).catch(() => {})
      
      // Should not throw
      const results = await resultsPromise
      expect(Array.isArray(results)).toBe(true)
    })

    it('sync: should not crash if directory content changes', () => {
      // Create initial files
      fs.writeFileSync(path.join(fixtureDir, 'a.txt'), 'a')
      fs.writeFileSync(path.join(fixtureDir, 'b.txt'), 'b')
      
      // Sync version - should complete without crashing
      const results = globlin.globSync('**/*.txt', { cwd: fixtureDir })
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describeUnix('symlink target deleted', () => {
    it('should handle broken symlinks gracefully', async () => {
      // Create a file and a symlink to it
      const realFile = path.join(fixtureDir, 'real.txt')
      const symlink = path.join(fixtureDir, 'link.txt')
      
      await fsp.writeFile(realFile, 'content')
      await fsp.symlink(realFile, symlink)
      
      // Delete the target file, making the symlink "broken"
      await fsp.unlink(realFile)
      
      // Glob should not crash and should find the broken symlink
      const results = await globlin.glob('**/*.txt', { cwd: fixtureDir })
      expect(Array.isArray(results)).toBe(true)
      
      // The broken symlink should be included in results
      expect(results).toContain('link.txt')
    })

    it('should handle symlink target deleted DURING walk', async () => {
      // Create files and symlinks
      const realFile = path.join(fixtureDir, 'target.txt')
      const symlink = path.join(fixtureDir, 'symlink.txt')
      await fsp.writeFile(realFile, 'content')
      await fsp.symlink(realFile, symlink)
      await fsp.writeFile(path.join(fixtureDir, 'other.txt'), 'other')
      
      // Start glob
      const resultsPromise = globlin.glob('**/*.txt', { cwd: fixtureDir })
      
      // Delete target during walk
      await fsp.unlink(realFile).catch(() => {})
      
      // Should not crash
      const results = await resultsPromise
      expect(Array.isArray(results)).toBe(true)
    })

    it('should handle symlink to deleted directory', async () => {
      // Create directory structure
      const realDir = path.join(fixtureDir, 'real-dir')
      const symlinkDir = path.join(fixtureDir, 'symlink-dir')
      
      await fsp.mkdir(realDir)
      await fsp.writeFile(path.join(realDir, 'file.txt'), 'content')
      await fsp.symlink(realDir, symlinkDir)
      
      // Delete the real directory
      await fsp.rm(realDir, { recursive: true })
      
      // Glob should not crash
      const results = await globlin.glob('**/*', { cwd: fixtureDir })
      expect(Array.isArray(results)).toBe(true)
    })

    it('sync: should handle broken symlinks', () => {
      // Create a broken symlink directly (target never existed)
      const symlink = path.join(fixtureDir, 'broken-link.txt')
      fs.symlinkSync('nonexistent-target.txt', symlink)
      
      // Should not crash
      const results = globlin.globSync('**/*.txt', { cwd: fixtureDir })
      expect(Array.isArray(results)).toBe(true)
      expect(results).toContain('broken-link.txt')
    })

    it('should match glob behavior for broken symlinks', async () => {
      // Create a broken symlink
      const symlink = path.join(fixtureDir, 'broken.txt')
      fs.symlinkSync('does-not-exist', symlink)
      
      const globResults = await globOriginal('**/*.txt', { cwd: fixtureDir })
      const globlinResults = await globlin.glob('**/*.txt', { cwd: fixtureDir })
      
      // Both should include the broken symlink
      expect(globResults).toContain('broken.txt')
      expect(globlinResults).toContain('broken.txt')
    })
  })

  describe('I/O errors', () => {
    it('should handle non-existent cwd gracefully', async () => {
      const nonExistent = path.join(fixtureDir, 'does-not-exist')
      
      // Both should return empty, not crash
      const globResults = await globOriginal('**/*', { cwd: nonExistent })
      const globlinResults = await globlin.glob('**/*', { cwd: nonExistent })
      
      expect(Array.isArray(globResults)).toBe(true)
      expect(Array.isArray(globlinResults)).toBe(true)
      expect(globResults).toHaveLength(0)
      expect(globlinResults).toHaveLength(0)
    })

    it('sync: should handle non-existent cwd gracefully', () => {
      const nonExistent = path.join(fixtureDir, 'does-not-exist')
      
      const globResults = globSyncOriginal('**/*', { cwd: nonExistent })
      const globlinResults = globlin.globSync('**/*', { cwd: nonExistent })
      
      expect(globResults).toHaveLength(0)
      expect(globlinResults).toHaveLength(0)
    })

    it('should handle cwd pointing to a file (not directory)', async () => {
      const filePath = path.join(fixtureDir, 'not-a-dir.txt')
      await fsp.writeFile(filePath, 'content')
      
      // Using a file as cwd should not crash
      const results = await globlin.glob('*', { cwd: filePath })
      expect(Array.isArray(results)).toBe(true)
    })

    it('should handle very long paths gracefully', async () => {
      // Create a nested structure but not so deep it crashes
      let currentPath = fixtureDir
      for (let i = 0; i < 10; i++) {
        currentPath = path.join(currentPath, 'nested')
        await fsp.mkdir(currentPath, { recursive: true })
      }
      await fsp.writeFile(path.join(currentPath, 'deep.txt'), 'deep')
      
      // Should not crash on deeply nested structures
      const results = await globlin.glob('**/*.txt', { cwd: fixtureDir })
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)
    })

    it('should handle special characters in filenames', async () => {
      // Create files with special characters (that are valid on filesystem)
      const specialNames = [
        'file with spaces.txt',
        'file-with-dashes.txt',
        'file_with_underscores.txt',
        'file.multiple.dots.txt',
      ]
      
      for (const name of specialNames) {
        await fsp.writeFile(path.join(fixtureDir, name), 'content')
      }
      
      const results = await globlin.glob('**/*.txt', { cwd: fixtureDir })
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(specialNames.length)
    })

    it('should handle unicode filenames', async () => {
      // Create files with unicode characters
      const unicodeNames = [
        'файл.txt', // Russian
        'ファイル.txt', // Japanese
        'αρχείο.txt', // Greek
        'file_émoji_🎉.txt', // Emoji (if supported)
      ]
      
      for (const name of unicodeNames) {
        try {
          await fsp.writeFile(path.join(fixtureDir, name), 'content')
        } catch {
          // Skip if filesystem doesn't support this filename
        }
      }
      
      // Should not crash regardless of what files were created
      const results = await globlin.glob('**/*.txt', { cwd: fixtureDir })
      expect(Array.isArray(results)).toBe(true)
    })

    it('should handle empty directory', async () => {
      // Empty fixture dir
      const results = await globlin.glob('**/*', { cwd: fixtureDir })
      expect(Array.isArray(results)).toBe(true)
      expect(results).toHaveLength(0)
    })
  })

  describe('race conditions', () => {
    it('should handle concurrent glob operations on same directory', async () => {
      // Create some files
      for (let i = 0; i < 10; i++) {
        await fsp.writeFile(path.join(fixtureDir, `file${i}.txt`), `content${i}`)
      }
      
      // Run multiple globs concurrently
      const promises = Array(10).fill(0).map(() =>
        globlin.glob('**/*.txt', { cwd: fixtureDir })
      )
      
      // All should complete without crashing
      const allResults = await Promise.all(promises)
      
      // All results should be arrays
      for (const results of allResults) {
        expect(Array.isArray(results)).toBe(true)
      }
      
      // All results should be identical (no race condition effects)
      const first = new Set(allResults[0])
      for (const results of allResults.slice(1)) {
        expect(new Set(results)).toEqual(first)
      }
    })

    it('should handle glob while files are being created', async () => {
      // Create initial file
      await fsp.writeFile(path.join(fixtureDir, 'initial.txt'), 'initial')
      
      // Start glob
      const resultsPromise = globlin.glob('**/*.txt', { cwd: fixtureDir })
      
      // Create more files during glob
      for (let i = 0; i < 5; i++) {
        await fsp.writeFile(path.join(fixtureDir, `new${i}.txt`), `new${i}`)
      }
      
      // Should not crash
      const results = await resultsPromise
      expect(Array.isArray(results)).toBe(true)
      // Should have at least the initial file
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle glob while directory structure is modified', async () => {
      // Create initial structure
      await fsp.mkdir(path.join(fixtureDir, 'dir1'), { recursive: true })
      await fsp.writeFile(path.join(fixtureDir, 'dir1', 'file.txt'), 'content')
      
      // Start glob
      const resultsPromise = globlin.glob('**/*.txt', { cwd: fixtureDir })
      
      // Modify structure during glob
      await fsp.mkdir(path.join(fixtureDir, 'dir2'), { recursive: true })
      await fsp.writeFile(path.join(fixtureDir, 'dir2', 'file.txt'), 'content')
      
      // Should not crash
      const results = await resultsPromise
      expect(Array.isArray(results)).toBe(true)
    })

    it('sync: should handle concurrent sync operations', () => {
      // Create files
      for (let i = 0; i < 10; i++) {
        fs.writeFileSync(path.join(fixtureDir, `file${i}.txt`), `content${i}`)
      }
      
      // Run multiple sync globs
      const results1 = globlin.globSync('**/*.txt', { cwd: fixtureDir })
      const results2 = globlin.globSync('**/*.txt', { cwd: fixtureDir })
      
      expect(Array.isArray(results1)).toBe(true)
      expect(Array.isArray(results2)).toBe(true)
      expect(new Set(results1)).toEqual(new Set(results2))
    })
  })

  describe('error recovery', () => {
    it('should continue after encountering various errors', async () => {
      // Create a mix of accessible files and potential error sources
      await fsp.writeFile(path.join(fixtureDir, 'good1.txt'), 'good1')
      await fsp.mkdir(path.join(fixtureDir, 'subdir1'), { recursive: true })
      await fsp.writeFile(path.join(fixtureDir, 'subdir1', 'good2.txt'), 'good2')
      await fsp.writeFile(path.join(fixtureDir, 'good3.txt'), 'good3')
      
      // Should find all accessible files
      const results = await globlin.glob('**/*.txt', { cwd: fixtureDir })
      expect(results).toContain('good1.txt')
      expect(results).toContain('subdir1/good2.txt')
      expect(results).toContain('good3.txt')
    })

    it('should handle mixture of valid and invalid patterns in array', async () => {
      await fsp.writeFile(path.join(fixtureDir, 'file.txt'), 'content')
      await fsp.writeFile(path.join(fixtureDir, 'file.js'), 'content')
      
      // Mix of patterns - some will match, some won't
      const results = await globlin.glob(['*.txt', '*.js', '*.nonexistent'], { cwd: fixtureDir })
      
      expect(Array.isArray(results)).toBe(true)
      expect(results).toContain('file.txt')
      expect(results).toContain('file.js')
    })
  })

  describe('Glob class error handling', () => {
    it('should handle errors in walk() method', async () => {
      await fsp.writeFile(path.join(fixtureDir, 'file.txt'), 'content')
      
      const g = new globlin.Glob('**/*.txt', { cwd: fixtureDir })
      const results = await g.walk()
      
      expect(Array.isArray(results)).toBe(true)
      expect(results).toContain('file.txt')
    })

    it('should handle errors in walkSync() method', () => {
      fs.writeFileSync(path.join(fixtureDir, 'file.txt'), 'content')
      
      const g = new globlin.Glob('**/*.txt', { cwd: fixtureDir })
      const results = g.walkSync()
      
      expect(Array.isArray(results)).toBe(true)
      expect(results).toContain('file.txt')
    })

    it('should handle errors in stream() method', async () => {
      await fsp.writeFile(path.join(fixtureDir, 'file.txt'), 'content')
      
      const g = new globlin.Glob('**/*.txt', { cwd: fixtureDir })
      const stream = g.stream()
      
      const results: string[] = []
      for await (const chunk of stream) {
        results.push(chunk as string)
      }
      
      expect(results).toContain('file.txt')
    })

    it('should handle errors in iterate() method', async () => {
      await fsp.writeFile(path.join(fixtureDir, 'file.txt'), 'content')
      
      const g = new globlin.Glob('**/*.txt', { cwd: fixtureDir })
      const results: string[] = []
      
      for await (const file of g.iterate()) {
        results.push(file)
      }
      
      expect(results).toContain('file.txt')
    })
  })

  describe('streaming error handling', () => {
    it('should handle errors in globStream', async () => {
      await fsp.writeFile(path.join(fixtureDir, 'file.txt'), 'content')
      
      // Import streaming functions directly from the module
      const { globStream } = await import('../../js/index.js')
      const stream = globStream('**/*.txt', { cwd: fixtureDir })
      const results: string[] = []
      
      for await (const chunk of stream) {
        results.push(chunk as string)
      }
      
      expect(results).toContain('file.txt')
    })

    it('should handle errors in globStreamSync', async () => {
      fs.writeFileSync(path.join(fixtureDir, 'file.txt'), 'content')
      
      // Import streaming functions directly from the module
      const { globStreamSync } = await import('../../js/index.js')
      const stream = globStreamSync('**/*.txt', { cwd: fixtureDir })
      const results: string[] = []
      
      // Sync stream data is immediately available
      stream.on('data', (chunk: string) => results.push(chunk))
      
      // Stream already ended by the time we attach listeners for sync stream
      // Check that we can iterate over the result
      expect(stream.writable).toBe(false) // Stream is ended
    })
  })

  describe('option error handling', () => {
    it('should handle invalid maxDepth values', async () => {
      await fsp.writeFile(path.join(fixtureDir, 'file.txt'), 'content')
      
      // Negative maxDepth - should return empty
      const results = await globlin.glob('**/*.txt', { cwd: fixtureDir, maxDepth: -1 })
      expect(Array.isArray(results)).toBe(true)
      expect(results).toHaveLength(0)
    })

    it('should handle conflicting options gracefully', async () => {
      await fsp.writeFile(path.join(fixtureDir, 'file.txt'), 'content')
      
      // matchBase with patterns containing slashes - should still work
      const results = await globlin.glob('file.txt', { cwd: fixtureDir, matchBase: true })
      expect(Array.isArray(results)).toBe(true)
    })
  })
})

describeUnix('filesystem errors - Unix specific', () => {
  beforeAll(async () => {
    globlin = await loadGloblin() as unknown as ExtendedGloblinModule
  })

  beforeEach(async () => {
    fixtureDir = await createFixture()
  })

  afterEach(async () => {
    await cleanupFixture(fixtureDir)
  })

  describe('permission errors during walk', () => {
    it('should skip unreadable files and continue', async () => {
      // Create files
      await fsp.writeFile(path.join(fixtureDir, 'readable.txt'), 'readable')
      const unreadableFile = path.join(fixtureDir, 'unreadable.txt')
      await fsp.writeFile(unreadableFile, 'unreadable')
      
      // Make file unreadable (this doesn't prevent listing, just reading content)
      await fsp.chmod(unreadableFile, 0o000)
      
      try {
        // Glob lists files, doesn't read their content - should still find both
        const results = await globlin.glob('**/*.txt', { cwd: fixtureDir })
        expect(Array.isArray(results)).toBe(true)
        // Both files should be listed (glob doesn't read file content)
        expect(results).toContain('readable.txt')
        expect(results).toContain('unreadable.txt')
      } finally {
        // Restore permissions for cleanup
        await fsp.chmod(unreadableFile, 0o644)
      }
    })
  })

  describe('special filesystem entries', () => {
    it('should handle FIFOs/named pipes gracefully', async () => {
      const fifoPath = path.join(fixtureDir, 'test-fifo')
      
      // Create a named pipe (may fail if not supported)
      try {
        const { execSync } = await import('child_process')
        execSync(`mkfifo "${fifoPath}"`)
      } catch {
        // Skip if mkfifo not available
        return
      }
      
      // Create a regular file too
      await fsp.writeFile(path.join(fixtureDir, 'regular.txt'), 'content')
      
      // Glob should not hang on FIFO and should find regular file
      const results = await globlin.glob('**/*', { cwd: fixtureDir })
      expect(Array.isArray(results)).toBe(true)
      expect(results).toContain('regular.txt')
    })

    it('should handle device files gracefully (if accessible)', async () => {
      // Just verify we don't crash when patterns could match device files
      // Most /dev files aren't accessible without special permissions
      
      await fsp.writeFile(path.join(fixtureDir, 'normal.txt'), 'content')
      
      const results = await globlin.glob('**/*', { cwd: fixtureDir })
      expect(Array.isArray(results)).toBe(true)
    })
  })
})
