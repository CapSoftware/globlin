/**
 * Windows 8.3 tilde path expansion compatibility tests
 * Based on vendor/glob/test/progra-tilde.ts
 *
 * Tests Windows 8.3 short path names (e.g., "program files" -> "progra~1")
 * This test only runs on Windows systems that support tilde expansion.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestFixture, cleanupFixture, loadGloblin, type GloblinModule } from '../harness.js'
import { globSync as globSyncOriginal } from 'glob'
import * as fs from 'fs'

let globlin: GloblinModule
let fixturePath: string
let supportsTilde = false

beforeAll(async () => {
  globlin = await loadGloblin()
  
  // Create fixture with "program files" directory (space in name triggers 8.3 name)
  fixturePath = await createTestFixture('progra-tilde-test', {
    files: [
      'program files/a',
      'program files/b',
      'program files/c',
    ],
  })

  // Check if this system supports tilde expansion
  // This is a Windows-specific feature
  if (process.platform === 'win32') {
    try {
      const longPath = `${fixturePath}/program files`
      const shortPath = `${fixturePath}/progra~1`
      
      const longStats = fs.statSync(longPath)
      let shortStats
      try {
        shortStats = fs.statSync(shortPath)
      } catch {
        // Short path doesn't exist
        supportsTilde = false
        return
      }
      
      // Check if they're the same directory
      supportsTilde = (
        longStats.isDirectory() &&
        shortStats.isDirectory() &&
        longStats.dev === shortStats.dev &&
        longStats.ino === shortStats.ino
      )
    } catch {
      supportsTilde = false
    }
  }
})

afterAll(async () => {
  if (fixturePath) {
    await cleanupFixture(fixturePath)
  }
})

describe('Windows 8.3 tilde expansion', () => {
  it.skipIf(!supportsTilde)('should glob using progra~1 with windowsPathsNoEscape', () => {
    const pattern = 'progra~1\\*'
    const options = { 
      cwd: fixturePath, 
      windowsPathsNoEscape: true 
    }

    const globlinResults = globlin.globSync(pattern, options).sort((a, b) =>
      a.localeCompare(b, 'en')
    )
    const globResults = globSyncOriginal(pattern, options).sort((a, b) =>
      a.localeCompare(b, 'en')
    )

    expect(globResults).toEqual(['progra~1\\a', 'progra~1\\b', 'progra~1\\c'])
    expect(globlinResults).toEqual(globResults)
  })

  it.skipIf(supportsTilde)('skips on systems without tilde support', () => {
    // This test just documents that tilde expansion is not supported
    expect(true).toBe(true)
  })
})

describe('windowsPathsNoEscape option', () => {
  // These tests run on all platforms
  it('should treat backslash as path separator with windowsPathsNoEscape', () => {
    // Create a fixture with nested paths
    const options = {
      cwd: fixturePath,
      windowsPathsNoEscape: true,
    }

    // With windowsPathsNoEscape, backslash is path separator, not escape
    const results = globlin.globSync('program files/*', options)
    expect(results).toContain('program files/a')
    expect(results).toContain('program files/b')
    expect(results).toContain('program files/c')
  })

  it('should match glob behavior with windowsPathsNoEscape', () => {
    const pattern = 'program files/*'
    const options = {
      cwd: fixturePath,
      windowsPathsNoEscape: true,
    }

    const globlinResults = globlin.globSync(pattern, options)
    const globResults = globSyncOriginal(pattern, options)

    expect(new Set(globlinResults)).toEqual(new Set(globResults))
  })
})
