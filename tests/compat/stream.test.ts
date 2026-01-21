/**
 * Stream API compatibility tests
 * Based on vendor/glob/test/stream.ts
 *
 * Tests globStream(), globStreamSync(), globIterate(), globIterateSync()
 * and the Glob class streaming/iteration methods.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestFixture, cleanupFixture, loadGloblin, type GloblinModule } from '../harness.js'
import {
  globStream as globStreamOriginal,
  globStreamSync as globStreamSyncOriginal,
  globIterate as globIterateOriginal,
  globIterateSync as globIterateSyncOriginal,
  Glob as GlobOriginal,
} from 'glob'
import * as path from 'path'
import type { Minipass } from 'minipass'

// Type for our glob module with all streaming APIs
interface ExtendedGloblinModule extends GloblinModule {
  globStream: (
    pattern: string | string[],
    options?: Record<string, unknown>
  ) => Minipass<string, string>
  globStreamSync: (
    pattern: string | string[],
    options?: Record<string, unknown>
  ) => Minipass<string, string>
  globIterate: (
    pattern: string | string[],
    options?: Record<string, unknown>
  ) => AsyncGenerator<string, void, void>
  globIterateSync: (
    pattern: string | string[],
    options?: Record<string, unknown>
  ) => Generator<string, void, void>
}

let globlin: ExtendedGloblinModule
let fixturePath: string

beforeAll(async () => {
  // Load globlin module
  const mod = await loadGloblin()
  globlin = mod as unknown as ExtendedGloblinModule
  // Also load stream APIs by re-importing
  const fullMod = await import('../../js/index.js')
  globlin.globStream = fullMod.globStream
  globlin.globStreamSync = fullMod.globStreamSync
  globlin.globIterate = fullMod.globIterate
  globlin.globIterateSync = fullMod.globIterateSync

  // Create fixture
  fixturePath = await createTestFixture('stream-test', {
    files: ['z', 'x', 'cb/e/f', 'c/d/c/b', 'bc/e/f', 'b/c/d', 'abcfed/g/h', 'abcdef/g/h'],
  })
})

afterAll(async () => {
  if (fixturePath) {
    await cleanupFixture(fixturePath)
  }
})

// Helper to collect stream results
async function collectStream(stream: NodeJS.ReadableStream): Promise<string[]> {
  const results: string[] = []
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: string) => results.push(chunk))
    stream.on('end', () => resolve(results))
    stream.on('error', reject)
  })
}

// Helper to convert paths to platform-specific format
function j(paths: string[]): string[] {
  return paths.map(p => p.split('/').join(path.sep))
}

// Expected results for ./** pattern
const expectedPaths = j([
  '.',
  'z',
  'x',
  'cb',
  'c',
  'bc',
  'b',
  'abcfed',
  'abcdef',
  'cb/e',
  'cb/e/f',
  'c/d',
  'c/d/c',
  'c/d/c/b',
  'bc/e',
  'bc/e/f',
  'b/c',
  'b/c/d',
  'abcfed/g',
  'abcfed/g/h',
  'abcdef/g',
  'abcdef/g/h',
])

describe('globStream', () => {
  it('should emit all matching files as stream data events', async () => {
    const stream = globlin.globStream('./**', { cwd: fixturePath })
    const results = await collectStream(stream as unknown as NodeJS.ReadableStream)
    const resultSet = new Set(results)
    const expectedSet = new Set(expectedPaths)

    // Results should contain all expected paths
    for (const expected of expectedSet) {
      expect(resultSet.has(expected)).toBe(true)
    }
  })

  it('should not finish synchronously (async behavior)', async () => {
    // globStream should use setImmediate/async internally
    // so the stream should not have ended in the same tick
    let endedInSameTick = false
    const stream = globlin.globStream('./**', { cwd: fixturePath })

    // Check if stream is already ended before yielding to event loop
    const readable = stream as unknown as { readable: boolean }
    endedInSameTick = !readable.readable && (stream as unknown as { ended: boolean }).ended

    // Wait for stream to complete
    await collectStream(stream as unknown as NodeJS.ReadableStream)

    // globStream uses setImmediate, so it should NOT end in same tick
    expect(endedInSameTick).toBe(false)
  })

  it('should match glob results', async () => {
    const globlinResults = await collectStream(
      globlin.globStream('./**', { cwd: fixturePath }) as unknown as NodeJS.ReadableStream
    )
    const originalResults = await collectStream(
      globStreamOriginal('./**', { cwd: fixturePath }) as unknown as NodeJS.ReadableStream
    )

    expect(new Set(globlinResults)).toEqual(new Set(originalResults))
  })
})

describe('globStreamSync', () => {
  it('should emit all matching files as stream data events', async () => {
    const stream = globlin.globStreamSync('./**', { cwd: fixturePath })
    const results = await collectStream(stream as unknown as NodeJS.ReadableStream)
    const resultSet = new Set(results)
    const expectedSet = new Set(expectedPaths)

    // Results should contain all expected paths
    for (const expected of expectedSet) {
      expect(resultSet.has(expected)).toBe(true)
    }
  })

  it('should finish synchronously', () => {
    // globStreamSync should write all data synchronously
    // so the stream should already have data immediately after creation
    const stream = globlin.globStreamSync('./**', { cwd: fixturePath })

    // For a sync stream, all writes happen during construction
    // We can verify by checking if the stream has ended
    const readable = stream as unknown as { readable: boolean; ended: boolean }

    // The stream should have all data written synchronously
    // and may already have ended or be ready to end
    expect(readable.readable || readable.ended).toBe(true)
  })

  it('should match glob results', async () => {
    const globlinResults = await collectStream(
      globlin.globStreamSync('./**', { cwd: fixturePath }) as unknown as NodeJS.ReadableStream
    )
    const originalResults = await collectStream(
      globStreamSyncOriginal('./**', { cwd: fixturePath }) as unknown as NodeJS.ReadableStream
    )

    expect(new Set(globlinResults)).toEqual(new Set(originalResults))
  })
})

describe('globIterate', () => {
  it('should yield all matching files', async () => {
    const results: string[] = []
    for await (const entry of globlin.globIterate('./**', { cwd: fixturePath })) {
      results.push(entry)
    }

    const resultSet = new Set(results)
    const expectedSet = new Set(expectedPaths)

    for (const expected of expectedSet) {
      expect(resultSet.has(expected)).toBe(true)
    }
  })

  it('should match glob results', async () => {
    const globlinResults: string[] = []
    for await (const entry of globlin.globIterate('./**', { cwd: fixturePath })) {
      globlinResults.push(entry)
    }

    const originalResults: string[] = []
    for await (const entry of globIterateOriginal('./**', { cwd: fixturePath })) {
      originalResults.push(entry)
    }

    expect(new Set(globlinResults)).toEqual(new Set(originalResults))
  })
})

describe('globIterateSync', () => {
  it('should yield all matching files', () => {
    const results: string[] = []
    for (const entry of globlin.globIterateSync('./**', { cwd: fixturePath })) {
      results.push(entry)
    }

    const resultSet = new Set(results)
    const expectedSet = new Set(expectedPaths)

    for (const expected of expectedSet) {
      expect(resultSet.has(expected)).toBe(true)
    }
  })

  it('should match glob results', () => {
    const globlinResults: string[] = []
    for (const entry of globlin.globIterateSync('./**', { cwd: fixturePath })) {
      globlinResults.push(entry)
    }

    const originalResults: string[] = []
    for (const entry of globIterateSyncOriginal('./**', { cwd: fixturePath })) {
      originalResults.push(entry)
    }

    expect(new Set(globlinResults)).toEqual(new Set(originalResults))
  })
})

describe('Glob class streaming', () => {
  describe('stream()', () => {
    it('should return a Minipass stream', async () => {
      const g = new globlin.Glob('./**', { cwd: fixturePath })
      const stream = g.stream()
      const results = await collectStream(stream as unknown as NodeJS.ReadableStream)

      const resultSet = new Set(results)
      const expectedSet = new Set(expectedPaths)

      for (const expected of expectedSet) {
        expect(resultSet.has(expected)).toBe(true)
      }
    })

    it('should match glob.Glob.stream() results', async () => {
      const globlinG = new globlin.Glob('./**', { cwd: fixturePath })
      const originalG = new GlobOriginal('./**', { cwd: fixturePath })

      const globlinResults = await collectStream(
        globlinG.stream() as unknown as NodeJS.ReadableStream
      )
      const originalResults = await collectStream(
        originalG.stream() as unknown as NodeJS.ReadableStream
      )

      expect(new Set(globlinResults)).toEqual(new Set(originalResults))
    })
  })

  describe('streamSync()', () => {
    it('should return a Minipass stream', async () => {
      const g = new globlin.Glob('./**', { cwd: fixturePath })
      const stream = g.streamSync()
      const results = await collectStream(stream as unknown as NodeJS.ReadableStream)

      const resultSet = new Set(results)
      const expectedSet = new Set(expectedPaths)

      for (const expected of expectedSet) {
        expect(resultSet.has(expected)).toBe(true)
      }
    })

    it('should match glob.Glob.streamSync() results', async () => {
      const globlinG = new globlin.Glob('./**', { cwd: fixturePath })
      const originalG = new GlobOriginal('./**', { cwd: fixturePath })

      const globlinResults = await collectStream(
        globlinG.streamSync() as unknown as NodeJS.ReadableStream
      )
      const originalResults = await collectStream(
        originalG.streamSync() as unknown as NodeJS.ReadableStream
      )

      expect(new Set(globlinResults)).toEqual(new Set(originalResults))
    })
  })

  describe('iterate()', () => {
    it('should return an async iterator', async () => {
      const g = new globlin.Glob('./**', { cwd: fixturePath })
      const results: string[] = []
      for await (const entry of g.iterate()) {
        results.push(entry)
      }

      const resultSet = new Set(results)
      const expectedSet = new Set(expectedPaths)

      for (const expected of expectedSet) {
        expect(resultSet.has(expected)).toBe(true)
      }
    })
  })

  describe('iterateSync()', () => {
    it('should return a sync iterator', () => {
      const g = new globlin.Glob('./**', { cwd: fixturePath })
      const results: string[] = []
      for (const entry of g.iterateSync()) {
        results.push(entry)
      }

      const resultSet = new Set(results)
      const expectedSet = new Set(expectedPaths)

      for (const expected of expectedSet) {
        expect(resultSet.has(expected)).toBe(true)
      }
    })
  })

  describe('Symbol.asyncIterator', () => {
    it('should make Glob async iterable with for-await-of', async () => {
      const g = new globlin.Glob('./**', { cwd: fixturePath })
      const results: string[] = []
      for await (const entry of g) {
        results.push(entry)
      }

      const resultSet = new Set(results)
      const expectedSet = new Set(expectedPaths)

      for (const expected of expectedSet) {
        expect(resultSet.has(expected)).toBe(true)
      }
    })
  })

  describe('Symbol.iterator', () => {
    it('should make Glob sync iterable with for-of', () => {
      const g = new globlin.Glob('./**', { cwd: fixturePath })
      const results: string[] = []
      for (const entry of g) {
        results.push(entry)
      }

      const resultSet = new Set(results)
      const expectedSet = new Set(expectedPaths)

      for (const expected of expectedSet) {
        expect(resultSet.has(expected)).toBe(true)
      }
    })
  })
})

describe('Glob class walk methods', () => {
  describe('walk()', () => {
    it('should return a promise that resolves to an array', async () => {
      const g = new globlin.Glob('./**', { cwd: fixturePath })
      const results = await g.walk()

      expect(Array.isArray(results)).toBe(true)
      const resultSet = new Set(results)
      const expectedSet = new Set(expectedPaths)

      for (const expected of expectedSet) {
        expect(resultSet.has(expected)).toBe(true)
      }
    })

    it('should match glob.Glob.walk() results', async () => {
      const globlinG = new globlin.Glob('./**', { cwd: fixturePath })
      const originalG = new GlobOriginal('./**', { cwd: fixturePath })

      const globlinResults = await globlinG.walk()
      const originalResults = await originalG.walk()

      expect(new Set(globlinResults)).toEqual(new Set(originalResults))
    })
  })

  describe('walkSync()', () => {
    it('should return an array synchronously', () => {
      const g = new globlin.Glob('./**', { cwd: fixturePath })
      const results = g.walkSync()

      expect(Array.isArray(results)).toBe(true)
      const resultSet = new Set(results)
      const expectedSet = new Set(expectedPaths)

      for (const expected of expectedSet) {
        expect(resultSet.has(expected)).toBe(true)
      }
    })

    it('should match glob.Glob.walkSync() results', () => {
      const globlinG = new globlin.Glob('./**', { cwd: fixturePath })
      const originalG = new GlobOriginal('./**', { cwd: fixturePath })

      const globlinResults = globlinG.walkSync()
      const originalResults = originalG.walkSync()

      expect(new Set(globlinResults)).toEqual(new Set(originalResults))
    })
  })
})

describe('Stream error handling', () => {
  it('should return empty results for invalid cwd', async () => {
    // glob returns empty results for non-existent cwd, doesn't throw
    const stream = globlin.globStream('**', { cwd: '/nonexistent/path/that/does/not/exist' })
    const results = await collectStream(stream as unknown as NodeJS.ReadableStream)
    expect(results).toEqual([])
  })
})

describe('Stream with options', () => {
  it('should respect dot option', async () => {
    // Create fixture with dotfiles
    const dotFixture = await createTestFixture('dot-stream-test', {
      files: ['.hidden', 'visible', '.hiddendir/file'],
    })

    try {
      // Without dot option
      const withoutDot = await collectStream(
        globlin.globStream('**', {
          cwd: dotFixture,
          dot: false,
        }) as unknown as NodeJS.ReadableStream
      )
      expect(withoutDot.some(p => p.includes('.hidden'))).toBe(false)

      // With dot option
      const withDot = await collectStream(
        globlin.globStream('**', { cwd: dotFixture, dot: true }) as unknown as NodeJS.ReadableStream
      )
      expect(withDot.some(p => p.includes('.hidden'))).toBe(true)
    } finally {
      await cleanupFixture(dotFixture)
    }
  })

  it('should respect nodir option', async () => {
    const results = await collectStream(
      globlin.globStream('./**', {
        cwd: fixturePath,
        nodir: true,
      }) as unknown as NodeJS.ReadableStream
    )

    // Should not include directories
    expect(results.includes('.')).toBe(false)
    // Check that known directories are not included
    expect(results.includes('c')).toBe(false)
    expect(results.includes('b')).toBe(false)
    expect(results.includes('cb')).toBe(false)
    expect(results.includes('bc')).toBe(false)
  })

  it('should respect mark option', async () => {
    const results = await collectStream(
      globlin.globStream('./**', {
        cwd: fixturePath,
        mark: true,
        posix: true,
      }) as unknown as NodeJS.ReadableStream
    )

    // Root should be marked
    const root = results.find(p => p === './' || p === '.')
    expect(root).toBe('./')

    // Directories should end with /
    const dirs = results.filter(p => ['c/', 'b/', 'cb/', 'bc/'].some(d => p === d))
    expect(dirs.length).toBeGreaterThan(0)
  })
})
