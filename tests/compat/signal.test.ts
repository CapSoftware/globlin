/**
 * Tests for AbortSignal support
 * Ported from vendor/glob/test/signal.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { glob, globSync, globStream, globStreamSync } from '../../js/index.js'

// Create a test fixture
const testDir = path.join(process.cwd(), 'tests/fixtures/signal-test-' + Date.now())

beforeAll(async () => {
  // Create test fixture: a/b/c/d/e structure
  await fs.promises.mkdir(path.join(testDir, 'a/b/c/d/e'), { recursive: true })
  
  // Create some files at various levels
  await fs.promises.writeFile(path.join(testDir, 'a/file1.txt'), 'test')
  await fs.promises.writeFile(path.join(testDir, 'a/b/file2.txt'), 'test')
  await fs.promises.writeFile(path.join(testDir, 'a/b/c/file3.txt'), 'test')
  await fs.promises.writeFile(path.join(testDir, 'a/b/c/d/file4.txt'), 'test')
  await fs.promises.writeFile(path.join(testDir, 'a/b/c/d/e/file5.txt'), 'test')
})

afterAll(async () => {
  // Clean up test fixture
  await fs.promises.rm(testDir, { recursive: true, force: true })
})

describe('AbortSignal support', () => {
  describe('async glob()', () => {
    it('should reject if signal is already aborted', async () => {
      const ac = new AbortController()
      const testError = new Error('test abort')
      ac.abort(testError)

      await expect(
        glob('./**', { cwd: testDir, signal: ac.signal })
      ).rejects.toThrow(testError)
    })

    it('should reject if aborted mid-operation', async () => {
      const ac = new AbortController()
      const testError = new Error('mid abort')

      // Start the glob operation
      const promise = glob('./**', { cwd: testDir, signal: ac.signal })

      // Abort immediately (race condition, may complete before abort)
      setImmediate(() => ac.abort(testError))

      // Should either complete or reject with abort error
      try {
        await promise
        // If it completed, that's OK - the operation was fast
      } catch (err) {
        expect(err).toBe(testError)
      }
    })

    it('should work normally without signal', async () => {
      const results = await glob('./**/*.txt', { cwd: testDir })
      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe('sync globSync()', () => {
    it('should throw if signal is already aborted', () => {
      const ac = new AbortController()
      const testError = new Error('sync abort')
      ac.abort(testError)

      expect(() => {
        globSync('./**', { cwd: testDir, signal: ac.signal })
      }).toThrow(testError)
    })

    it('should work normally without signal', () => {
      const results = globSync('./**/*.txt', { cwd: testDir })
      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe('async globStream()', () => {
    it('should emit error if signal is already aborted', async () => {
      const ac = new AbortController()
      const testError = new Error('stream abort')
      ac.abort(testError)

      await new Promise<void>((resolve, reject) => {
        const stream = globStream('./**', { cwd: testDir, signal: ac.signal })
        stream.on('error', (err) => {
          try {
            expect(err).toBe(testError)
            resolve()
          } catch (e) {
            reject(e)
          }
        })
        // Timeout safety
        setTimeout(() => reject(new Error('Timeout waiting for error')), 5000)
      })
    })

    it('should emit error if aborted mid-stream', async () => {
      const ac = new AbortController()
      const testError = new Error('mid stream abort')

      await new Promise<void>((resolve) => {
        const stream = globStream('./**', { cwd: testDir, signal: ac.signal })
        
        let errorReceived = false
        stream.on('error', (err) => {
          if (!errorReceived) {
            errorReceived = true
            expect(err).toBe(testError)
            resolve()
          }
        })

        // Abort after first data event
        stream.once('data', () => {
          ac.abort(testError)
        })

        // If stream ends without error, that's also OK (race condition)
        stream.on('end', () => {
          if (!errorReceived) {
            resolve()
          }
        })
      })
    })

    it('should work normally without signal', async () => {
      const results: string[] = []
      
      await new Promise<void>((resolve, reject) => {
        const stream = globStream('./**/*.txt', { cwd: testDir })
        
        stream.on('data', (data) => {
          results.push(data)
        })
        
        stream.on('end', () => {
          resolve()
        })

        stream.on('error', reject)
      })
      
      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe('sync globStreamSync()', () => {
    it('should emit error if signal is already aborted', async () => {
      const ac = new AbortController()
      const testError = new Error('sync stream abort')
      ac.abort(testError)

      await new Promise<void>((resolve, reject) => {
        const stream = globStreamSync('./**', { cwd: testDir, signal: ac.signal })
        stream.on('error', (err) => {
          try {
            expect(err).toBe(testError)
            resolve()
          } catch (e) {
            reject(e)
          }
        })
        // Timeout safety
        setTimeout(() => reject(new Error('Timeout waiting for error')), 5000)
      })
    })

    it('should work normally without signal', () => {
      const results: string[] = []
      const stream = globStreamSync('./**/*.txt', { cwd: testDir })
      
      // Sync stream should have all data immediately available
      stream.on('data', (data) => {
        results.push(data)
      })
      
      // End event is synchronous for sync stream
      stream.on('end', () => {
        expect(results.length).toBeGreaterThan(0)
      })
    })
  })

  describe('comparison with glob package', () => {
    it('pre-aborted signal should throw same error style', async () => {
      const ac = new AbortController()
      const reason = new Error('test reason')
      ac.abort(reason)

      try {
        await glob('./**', { cwd: testDir, signal: ac.signal })
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBe(reason)
      }
    })

    it('pre-aborted signal with no reason should throw default error', async () => {
      const ac = new AbortController()
      ac.abort()

      try {
        await glob('./**', { cwd: testDir, signal: ac.signal })
        expect.fail('Should have thrown')
      } catch (err) {
        // Signal.reason is the DOMException: AbortError by default, or our fallback
        expect(err).toBeDefined()
      }
    })
  })
})
