/**
 * Windows drive letter support tests for globlin
 * Tests patterns like C:/*.txt and drive letter handling in cwd
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as os from 'os'
import { glob as globOriginal, globSync as globSyncOriginal } from 'glob'

// Function to load globlin
async function loadGloblin() {
  try {
    return await import('../../js/index.js')
  } catch {
    return null
  }
}

const isWindows = process.platform === 'win32'

describe('Windows drive letter support', () => {
  let testDir: string | null = null
  let globlin: Awaited<ReturnType<typeof loadGloblin>> = null

  beforeAll(async () => {
    globlin = await loadGloblin()
    if (!isWindows || !globlin) return

    // Create a temporary directory for tests
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'globlin-drive-test-'))

    // Create test files
    await fs.writeFile(path.join(testDir, 'file1.txt'), '')
    await fs.writeFile(path.join(testDir, 'file2.txt'), '')
    await fs.writeFile(path.join(testDir, 'script.js'), '')
    await fs.mkdir(path.join(testDir, 'subdir'))
    await fs.writeFile(path.join(testDir, 'subdir', 'nested.txt'), '')
  })

  afterAll(async () => {
    if (!testDir) return
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it('should handle patterns with drive letters (C:/*.txt)', async () => {
    if (!isWindows || !globlin || !testDir) {
      // Skip if not Windows or globlin not built
      return
    }

    // Get the drive letter from testDir (e.g., C:)
    const driveLetter = path.parse(testDir).root // e.g., "C:\\"
    const drivePattern = driveLetter.replace(/\\/g, '/') + '*.txt' // e.g., "C:/*.txt"

    // This pattern won't match our test files (they're in a subdir)
    // But it should execute without error
    const results = globlin.globSync(drivePattern, { posix: true })

    // Results should be an array (even if empty)
    expect(Array.isArray(results)).toBe(true)
  })

  it('should handle absolute patterns starting with drive letter', async () => {
    if (!isWindows || !globlin || !testDir) return

    // Convert testDir to POSIX-style path for pattern
    const posixTestDir = testDir.replace(/\\/g, '/')
    const pattern = `${posixTestDir}/*.txt`

    const globResults = globSyncOriginal(pattern, { posix: true })
    const globlinResults = globlin.globSync(pattern, { posix: true })

    expect(new Set(globlinResults)).toEqual(new Set(globResults))
    expect(globlinResults.length).toBe(2) // file1.txt, file2.txt
  })

  it('should handle recursive patterns with drive letter', async () => {
    if (!isWindows || !globlin || !testDir) return

    const posixTestDir = testDir.replace(/\\/g, '/')
    const pattern = `${posixTestDir}/**/*.txt`

    const globResults = globSyncOriginal(pattern, { posix: true })
    const globlinResults = globlin.globSync(pattern, { posix: true })

    expect(new Set(globlinResults)).toEqual(new Set(globResults))
    expect(globlinResults.length).toBe(3) // file1.txt, file2.txt, subdir/nested.txt
  })

  it('should match glob behavior for cwd with drive letter', async () => {
    if (!isWindows || !globlin || !testDir) return

    const globResults = globSyncOriginal('*.txt', { cwd: testDir, posix: true })
    const globlinResults = globlin.globSync('*.txt', { cwd: testDir, posix: true })

    expect(new Set(globlinResults)).toEqual(new Set(globResults))
    expect(globlinResults.length).toBe(2)
  })
})

describe('Drive letter pattern parsing', () => {
  let globlin: Awaited<ReturnType<typeof loadGloblin>> = null

  beforeAll(async () => {
    globlin = await loadGloblin()
  })

  it('should detect drive letter patterns', () => {
    if (!globlin) return

    // Test that we can check if a pattern has magic characters
    // Patterns like C:/*.txt should have magic
    expect(globlin.hasMagic('C:/*.txt', { platform: 'win32' })).toBe(true)
    expect(globlin.hasMagic('C:/foo.txt', { platform: 'win32' })).toBe(false)
    expect(globlin.hasMagic('C:/**/*.txt', { platform: 'win32' })).toBe(true)
  })

  it('should handle escaped drive letter patterns', () => {
    if (!globlin) return

    // When not using windowsPathsNoEscape, backslashes are escapes
    const escaped = globlin.escape('C:')
    expect(escaped).toBe('C:') // No magic chars to escape

    const unescaped = globlin.unescape('C:')
    expect(unescaped).toBe('C:')
  })
})

describe('UNC path support', () => {
  let globlin: Awaited<ReturnType<typeof loadGloblin>> = null

  beforeAll(async () => {
    globlin = await loadGloblin()
  })

  it('should detect UNC patterns', () => {
    if (!globlin) return

    // UNC paths start with // followed by server/share
    expect(globlin.hasMagic('//server/share/*', { platform: 'win32' })).toBe(true)
    expect(globlin.hasMagic('//server/share/foo.txt', { platform: 'win32' })).toBe(false)
  })
})

describe('Pattern root detection', () => {
  let globlin: Awaited<ReturnType<typeof loadGloblin>> = null

  beforeAll(async () => {
    globlin = await loadGloblin()
  })

  it('should handle Windows absolute patterns with platform option', () => {
    if (!globlin) return

    // When platform is win32, C:/ patterns should be treated as absolute
    const results = globlin.globSync('C:/nonexistent/**', {
      platform: 'win32',
      posix: true,
    })

    // Should return empty array for non-existent path, not throw
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBe(0)
  })
})
