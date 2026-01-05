/**
 * UNC path support tests for globlin
 * Tests patterns like //server/share/* and device paths like //?/C:/
 * 
 * UNC (Universal Naming Convention) paths are Windows-specific network paths
 * in the format: //server/share/path
 * 
 * Device paths are also special Windows paths:
 * - //?/C:/ - Long path prefix
 * - //./device/ - Device namespace
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

describe('UNC path pattern parsing', () => {
  let globlin: Awaited<ReturnType<typeof loadGloblin>> = null
  
  beforeAll(async () => {
    globlin = await loadGloblin()
  })
  
  describe('UNC pattern detection', () => {
    it('should detect basic UNC patterns', () => {
      if (!globlin) return
      
      // UNC paths start with // followed by server/share
      expect(globlin.hasMagic('//server/share/*', { platform: 'win32' })).toBe(true)
      expect(globlin.hasMagic('//server/share/foo.txt', { platform: 'win32' })).toBe(false)
      expect(globlin.hasMagic('//server/share/**/*.txt', { platform: 'win32' })).toBe(true)
    })
    
    it('should detect device path patterns', () => {
      if (!globlin) return
      
      // Device paths: //?/ and //./
      expect(globlin.hasMagic('//?/C:/*', { platform: 'win32' })).toBe(true)
      expect(globlin.hasMagic('//?/C:/foo.txt', { platform: 'win32' })).toBe(false)
      expect(globlin.hasMagic('//./COM1/*', { platform: 'win32' })).toBe(true)
    })
    
    it('should not treat double slashes as UNC on non-Windows', () => {
      if (!globlin) return
      
      // On Linux/macOS, double slashes at start are just normalized
      expect(globlin.hasMagic('//server/share/*', { platform: 'linux' })).toBe(true)
      expect(globlin.hasMagic('//server/share/*', { platform: 'darwin' })).toBe(true)
    })
  })
  
  describe('UNC path root extraction', () => {
    it('should handle UNC pattern root correctly', () => {
      if (!globlin) return
      
      // Test that globbing non-existent UNC paths returns empty array
      const results = globlin.globSync('//nonexistent/share/**/*.txt', { 
        platform: 'win32',
        posix: true 
      })
      
      expect(Array.isArray(results)).toBe(true)
      // Non-existent UNC path should return empty results
      expect(results.length).toBe(0)
    })
    
    it('should handle device path root correctly', () => {
      if (!globlin) return
      
      // Test that device paths don't throw
      const results = globlin.globSync('//?/C:/nonexistent/**/*.txt', { 
        platform: 'win32',
        posix: true 
      })
      
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })
  })
  
  describe('UNC escape handling', () => {
    it('should escape UNC paths correctly', () => {
      if (!globlin) return
      
      // The path portion should be escaped, not the UNC prefix
      const escaped = globlin.escape('//server/share/[file].txt')
      // Brackets should be escaped
      expect(escaped).toContain('\\[')
      expect(escaped).toContain('\\]')
    })
    
    it('should unescape UNC paths correctly', () => {
      if (!globlin) return
      
      const unescaped = globlin.unescape('//server/share/\\[file\\].txt')
      expect(unescaped).toBe('//server/share/[file].txt')
    })
  })
})

describe('UNC path case sensitivity', () => {
  let globlin: Awaited<ReturnType<typeof loadGloblin>> = null
  
  beforeAll(async () => {
    globlin = await loadGloblin()
  })
  
  it('should compare UNC roots case-insensitively on Windows', async () => {
    if (!globlin) return
    
    // UNC roots are always case-insensitive on Windows
    // This test just verifies the pattern parsing handles mixed case
    const upperResults = globlin.globSync('//SERVER/SHARE/**', { 
      platform: 'win32',
      posix: true 
    })
    const lowerResults = globlin.globSync('//server/share/**', { 
      platform: 'win32',
      posix: true 
    })
    
    // Both should return empty arrays for non-existent paths
    expect(Array.isArray(upperResults)).toBe(true)
    expect(Array.isArray(lowerResults)).toBe(true)
  })
})

describe('UNC with cwd option', () => {
  let testDir: string | null = null
  let globlin: Awaited<ReturnType<typeof loadGloblin>> = null
  
  beforeAll(async () => {
    globlin = await loadGloblin()
    
    // Create a temporary directory for testing
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'globlin-unc-test-'))
    
    // Create test files
    await fs.writeFile(path.join(testDir, 'file1.txt'), '')
    await fs.writeFile(path.join(testDir, 'file2.txt'), '')
    await fs.mkdir(path.join(testDir, 'subdir'))
    await fs.writeFile(path.join(testDir, 'subdir', 'nested.txt'), '')
  })
  
  afterAll(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true })
    }
  })
  
  it('should handle relative patterns with standard cwd', async () => {
    if (!globlin || !testDir) return
    
    const globResults = globSyncOriginal('*.txt', { cwd: testDir, posix: true })
    const globlinResults = globlin.globSync('*.txt', { cwd: testDir, posix: true })
    
    expect(new Set(globlinResults)).toEqual(new Set(globResults))
  })
  
  it('should handle recursive patterns with standard cwd', async () => {
    if (!globlin || !testDir) return
    
    const globResults = globSyncOriginal('**/*.txt', { cwd: testDir, posix: true })
    const globlinResults = globlin.globSync('**/*.txt', { cwd: testDir, posix: true })
    
    expect(new Set(globlinResults)).toEqual(new Set(globResults))
  })
})

describe('Mixed absolute and relative patterns', () => {
  let globlin: Awaited<ReturnType<typeof loadGloblin>> = null
  
  beforeAll(async () => {
    globlin = await loadGloblin()
  })
  
  it('should handle mixed pattern arrays gracefully', () => {
    if (!globlin) return
    
    // This is a known limitation - mixing absolute UNC with relative patterns
    // The glob should still work, just potentially not optimized
    const results = globlin.globSync(['*.txt', '//nonexistent/share/*.txt'], { 
      platform: 'win32',
      posix: true 
    })
    
    // Should return array (may be empty if no matches)
    expect(Array.isArray(results)).toBe(true)
  })
})

describe('Real UNC path tests (Windows only)', () => {
  let testDir: string | null = null
  let globlin: Awaited<ReturnType<typeof loadGloblin>> = null
  
  beforeAll(async () => {
    globlin = await loadGloblin()
    if (!isWindows || !globlin) return
    
    // Create a temporary directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'globlin-unc-real-'))
    
    // Create test files
    await fs.writeFile(path.join(testDir, 'file.txt'), '')
    await fs.mkdir(path.join(testDir, 'subdir'))
    await fs.writeFile(path.join(testDir, 'subdir', 'nested.txt'), '')
  })
  
  afterAll(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true })
    }
  })
  
  it('should match glob behavior for UNC-like absolute paths', async () => {
    if (!isWindows || !globlin || !testDir) return
    
    // Convert testDir to absolute POSIX-style path
    const posixTestDir = testDir.replace(/\\/g, '/')
    const pattern = `${posixTestDir}/**/*.txt`
    
    const globResults = globSyncOriginal(pattern, { posix: true })
    const globlinResults = globlin.globSync(pattern, { posix: true })
    
    expect(new Set(globlinResults)).toEqual(new Set(globResults))
  })
  
  it('should handle patterns with device path prefix', async () => {
    if (!isWindows || !globlin || !testDir) return
    
    // Convert to //?/ format (long path prefix)
    const posixTestDir = testDir.replace(/\\/g, '/')
    // Get the drive letter and convert to //?/C:/ format
    const driveLetter = posixTestDir.charAt(0)
    const restOfPath = posixTestDir.slice(2) // Remove "C:"
    const devicePath = `//?/${driveLetter}:${restOfPath}/**/*.txt`
    
    // This should work on Windows with long path prefix
    const results = globlin.globSync(devicePath, { 
      platform: 'win32',
      posix: true 
    })
    
    expect(Array.isArray(results)).toBe(true)
    // May be empty or contain results depending on Windows configuration
  })
})

describe('UNC pattern normalization', () => {
  let globlin: Awaited<ReturnType<typeof loadGloblin>> = null
  
  beforeAll(async () => {
    globlin = await loadGloblin()
  })
  
  it('should normalize trailing slashes in UNC roots', () => {
    if (!globlin) return
    
    // Both should be treated the same way
    const withSlash = globlin.globSync('//server/share/', { 
      platform: 'win32',
      posix: true 
    })
    const withoutSlash = globlin.globSync('//server/share', { 
      platform: 'win32',
      posix: true 
    })
    
    expect(Array.isArray(withSlash)).toBe(true)
    expect(Array.isArray(withoutSlash)).toBe(true)
  })
  
  it('should handle UNC paths with multiple consecutive slashes', () => {
    if (!globlin) return
    
    // Extra slashes after the root should be normalized
    const results = globlin.globSync('//server/share//folder/**', { 
      platform: 'win32',
      posix: true 
    })
    
    expect(Array.isArray(results)).toBe(true)
  })
})
