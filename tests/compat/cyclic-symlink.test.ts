// Tests for cyclic symlink handling
// Ensures globlin doesn't infinite loop when encountering symlink cycles
//
// Key behavioral difference from glob:
// - glob uses path-scurry which follows symlinks up to a certain depth (can be slow or OOM on some cycles)
// - globlin uses walkdir which detects cycles by inode and stops traversal
// - Both approaches prevent infinite loops, but produce different results
// - globlin's approach is MORE efficient for cycle handling

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { loadGloblin, GloblinModule } from '../harness'

// Skip these tests on Windows - symlinks require special permissions
const isWindows = process.platform === 'win32'

describe.skipIf(isWindows)('Cyclic Symlinks - Self-referencing', () => {
  let globlin: GloblinModule | null = null
  let fixtureDir: string

  beforeAll(async () => {
    globlin = await loadGloblin()

    // Create fixture directory with self-referencing symlink
    fixtureDir = path.join(__dirname, '..', '..', 'test-fixtures-cyclic-self')

    // Clean up if exists
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }

    // Create structure:
    // test-fixtures-cyclic-self/
    //   dir/
    //     file.txt
    //     self -> . (symlink to itself)
    fs.mkdirSync(path.join(fixtureDir, 'dir'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'dir', 'file.txt'), 'content')

    // Create a symlink that points to current directory (self-reference)
    fs.symlinkSync('.', path.join(fixtureDir, 'dir', 'self'))
  })

  afterAll(() => {
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('globlin: should handle self-referencing symlink without infinite loop', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    const startTime = Date.now()
    const results = await globlin.glob('**/*', { cwd: fixtureDir, follow: true, posix: true })
    const elapsed = Date.now() - startTime

    // Should complete within reasonable time (not hanging)
    expect(elapsed).toBeLessThan(5000)

    // Should return finite results (walkdir's cycle detection stops traversal)
    expect(results.length).toBeLessThan(100)
    expect(results.length).toBeGreaterThan(0)

    // Should find the actual file
    expect(results).toContain('dir/file.txt')
  })

  it('globlinSync: should handle self-referencing symlink without infinite loop', () => {
    if (!globlin) throw new Error('globlin not loaded')

    const startTime = Date.now()
    const results = globlin.globSync('**/*', { cwd: fixtureDir, follow: true, posix: true })
    const elapsed = Date.now() - startTime

    // Should complete within reasonable time (not hanging)
    expect(elapsed).toBeLessThan(5000)

    // Should return finite results
    expect(results.length).toBeLessThan(100)
    expect(results.length).toBeGreaterThan(0)
  })

  it('without follow option, symlinks are reported but not traversed', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    const results = await globlin.glob('**/*', { cwd: fixtureDir, posix: true })

    // Should find the file and symlink
    expect(results).toContain('dir/file.txt')
    expect(results).toContain('dir/self')

    // Should NOT have any deeply nested paths
    expect(results.filter(r => r.includes('self/self'))).toHaveLength(0)
  })
})

describe.skipIf(isWindows)('Cyclic Symlinks - Parent reference', () => {
  let globlin: GloblinModule | null = null
  let fixtureDir: string

  beforeAll(async () => {
    globlin = await loadGloblin()

    // Create fixture directory with symlink to parent
    fixtureDir = path.join(__dirname, '..', '..', 'test-fixtures-cyclic-parent')

    // Clean up if exists
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }

    // Create structure:
    // test-fixtures-cyclic-parent/
    //   root.txt
    //   child/
    //     child.txt
    //     back -> .. (symlink to parent)
    fs.mkdirSync(path.join(fixtureDir, 'child'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'root.txt'), 'root content')
    fs.writeFileSync(path.join(fixtureDir, 'child', 'child.txt'), 'child content')

    // Create symlink to parent directory (creates cycle)
    fs.symlinkSync('..', path.join(fixtureDir, 'child', 'back'))
  })

  afterAll(() => {
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('globlin: should handle parent symlink cycle without infinite loop', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    const startTime = Date.now()
    const results = await globlin.glob('**/*', { cwd: fixtureDir, follow: true, posix: true })
    const elapsed = Date.now() - startTime

    // Should complete within reasonable time
    expect(elapsed).toBeLessThan(5000)

    // Should return finite results
    expect(results.length).toBeLessThan(100)
    expect(results.length).toBeGreaterThan(0)

    // Should find actual files
    expect(results).toContain('root.txt')
    expect(results).toContain('child/child.txt')
  })

  it('should not produce deeply nested paths from cycle', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    const results = await globlin.glob('**/*', { cwd: fixtureDir, follow: true, posix: true })

    // walkdir detects cycle by inode, so should not produce repeated patterns
    // The cycle is detected at the inode level before it can cause repetition
    expect(results.filter(r => (r.match(/back/g) || []).length > 2)).toHaveLength(0)
  })
})

describe.skipIf(isWindows)('Cyclic Symlinks - Mutual reference (A -> B -> A)', () => {
  let globlin: GloblinModule | null = null
  let fixtureDir: string

  beforeAll(async () => {
    globlin = await loadGloblin()

    // Create fixture directory with mutual symlink cycle
    fixtureDir = path.join(__dirname, '..', '..', 'test-fixtures-cyclic-mutual')

    // Clean up if exists
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }

    // Create structure:
    // test-fixtures-cyclic-mutual/
    //   a/
    //     a.txt
    //     to-b -> ../b (symlink to b)
    //   b/
    //     b.txt
    //     to-a -> ../a (symlink to a, creating cycle)
    fs.mkdirSync(path.join(fixtureDir, 'a'), { recursive: true })
    fs.mkdirSync(path.join(fixtureDir, 'b'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'a', 'a.txt'), 'a content')
    fs.writeFileSync(path.join(fixtureDir, 'b', 'b.txt'), 'b content')

    // Create mutual symlinks (A -> B -> A)
    fs.symlinkSync('../b', path.join(fixtureDir, 'a', 'to-b'))
    fs.symlinkSync('../a', path.join(fixtureDir, 'b', 'to-a'))
  })

  afterAll(() => {
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('globlin: should handle mutual symlink cycle without infinite loop', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    const startTime = Date.now()
    const results = await globlin.glob('**/*', { cwd: fixtureDir, follow: true, posix: true })
    const elapsed = Date.now() - startTime

    // Should complete within reasonable time
    expect(elapsed).toBeLessThan(5000)

    // Should return finite results
    expect(results.length).toBeLessThan(100)
    expect(results.length).toBeGreaterThan(0)

    // Should find actual files
    expect(results).toContain('a/a.txt')
    expect(results).toContain('b/b.txt')
  })

  it('should find files accessed through symlinks (one level)', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    const results = await globlin.glob('**/*', { cwd: fixtureDir, follow: true, posix: true })

    // When following symlinks, walkdir may find files through symlink paths
    // But should stop at cycles
    expect(results).toContain('a/a.txt')
    expect(results).toContain('b/b.txt')
  })
})

describe.skipIf(isWindows)('Cyclic Symlinks - Deep nested cycle', () => {
  let globlin: GloblinModule | null = null
  let fixtureDir: string

  beforeAll(async () => {
    globlin = await loadGloblin()

    // Create fixture directory with deeply nested symlink cycle
    fixtureDir = path.join(__dirname, '..', '..', 'test-fixtures-cyclic-deep')

    // Clean up if exists
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }

    // Create structure:
    // test-fixtures-cyclic-deep/
    //   level1/
    //     level2/
    //       level3/
    //         file.txt
    //         back-to-top -> ../../.. (symlink to root, creates deep cycle)
    fs.mkdirSync(path.join(fixtureDir, 'level1', 'level2', 'level3'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'level1', 'level2', 'level3', 'file.txt'), 'content')

    // Create symlink back to root
    fs.symlinkSync('../../..', path.join(fixtureDir, 'level1', 'level2', 'level3', 'back-to-top'))
  })

  afterAll(() => {
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('globlin: should handle deep nested symlink cycle without infinite loop', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    const startTime = Date.now()
    const results = await globlin.glob('**/*', { cwd: fixtureDir, follow: true, posix: true })
    const elapsed = Date.now() - startTime

    // Should complete within reasonable time
    expect(elapsed).toBeLessThan(5000)

    // Should return finite results
    expect(results.length).toBeLessThan(100)
    expect(results.length).toBeGreaterThan(0)

    // Should find the actual file
    expect(results).toContain('level1/level2/level3/file.txt')
  })

  it('should find intermediate directories', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    const results = await globlin.glob('**/*', { cwd: fixtureDir, follow: true, posix: true })

    expect(results).toContain('level1')
    expect(results).toContain('level1/level2')
    expect(results).toContain('level1/level2/level3')
  })
})

describe.skipIf(isWindows)('Cyclic Symlinks - Behavior comparison without follow: true', () => {
  let globlin: GloblinModule | null = null
  let fixtureDir: string

  beforeAll(async () => {
    globlin = await loadGloblin()

    // Use the self-referencing fixture
    fixtureDir = path.join(__dirname, '..', '..', 'test-fixtures-cyclic-default')

    // Clean up if exists
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }

    // Create structure:
    // test-fixtures-cyclic-default/
    //   dir/
    //     file.txt
    //     self -> . (symlink to itself)
    fs.mkdirSync(path.join(fixtureDir, 'dir'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'dir', 'file.txt'), 'content')
    fs.symlinkSync('.', path.join(fixtureDir, 'dir', 'self'))
  })

  afterAll(() => {
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('without follow option, symlinks are not traversed (no cycle possible)', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    // Without follow:true, the symlink should be listed but not followed
    const results = await globlin.glob('**/*', { cwd: fixtureDir, posix: true })

    // Should find the file and the symlink
    expect(results).toContain('dir/file.txt')
    expect(results).toContain('dir/self')

    // Should NOT find infinite recursion results
    expect(results.filter(r => r.includes('self/self'))).toHaveLength(0)
  })

  it('with follow: false explicitly, symlinks are not traversed', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    const results = await globlin.glob('**/*', { cwd: fixtureDir, follow: false, posix: true })

    // Should find the file and the symlink
    expect(results).toContain('dir/file.txt')
    expect(results).toContain('dir/self')

    // Should NOT have infinite recursion
    expect(results.length).toBeLessThan(50)
  })
})

describe.skipIf(isWindows)('Cyclic Symlinks - inode-based cycle detection', () => {
  let globlin: GloblinModule | null = null
  let fixtureDir: string

  beforeAll(async () => {
    globlin = await loadGloblin()

    // Create fixture to test inode-based detection
    fixtureDir = path.join(__dirname, '..', '..', 'test-fixtures-cyclic-inode')

    // Clean up if exists
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }

    // Create structure:
    // test-fixtures-cyclic-inode/
    //   real-dir/
    //     file.txt
    //   link1 -> real-dir
    //   link2 -> real-dir (same target as link1)
    //   nested/
    //     link3 -> ../real-dir (another path to same target)
    fs.mkdirSync(path.join(fixtureDir, 'real-dir'), { recursive: true })
    fs.mkdirSync(path.join(fixtureDir, 'nested'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'real-dir', 'file.txt'), 'content')

    // Multiple symlinks to same target
    fs.symlinkSync('real-dir', path.join(fixtureDir, 'link1'))
    fs.symlinkSync('real-dir', path.join(fixtureDir, 'link2'))
    fs.symlinkSync('../real-dir', path.join(fixtureDir, 'nested', 'link3'))
  })

  afterAll(() => {
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('should detect same inode accessed via different paths', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    const startTime = Date.now()
    const results = await globlin.glob('**/*', { cwd: fixtureDir, follow: true, posix: true })
    const elapsed = Date.now() - startTime

    // Should complete quickly
    expect(elapsed).toBeLessThan(5000)

    // Should find the file
    expect(results).toContain('real-dir/file.txt')

    // The same directory accessed via different symlinks should be detected
    // and not cause exponential explosion in results
    expect(results.length).toBeLessThan(50)
  })

  it('should return results for files accessed via symlinks', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    const results = await globlin.glob('**/*.txt', { cwd: fixtureDir, follow: true, posix: true })

    // Should find the file through at least one path
    expect(results.some(r => r.includes('file.txt'))).toBe(true)
  })
})

describe.skipIf(isWindows)('Cyclic Symlinks - Specific patterns with cycles', () => {
  let globlin: GloblinModule | null = null
  let fixtureDir: string

  beforeAll(async () => {
    globlin = await loadGloblin()

    fixtureDir = path.join(__dirname, '..', '..', 'test-fixtures-cyclic-patterns')

    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }

    // Create structure:
    // test-fixtures-cyclic-patterns/
    //   src/
    //     main.js
    //     lib/
    //       helper.js
    //       loop -> ../.. (symlink back to root)
    fs.mkdirSync(path.join(fixtureDir, 'src', 'lib'), { recursive: true })
    fs.writeFileSync(path.join(fixtureDir, 'src', 'main.js'), 'main')
    fs.writeFileSync(path.join(fixtureDir, 'src', 'lib', 'helper.js'), 'helper')
    fs.symlinkSync('../..', path.join(fixtureDir, 'src', 'lib', 'loop'))
  })

  afterAll(() => {
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('should handle **/*.js pattern with cycle', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    const startTime = Date.now()
    const results = await globlin.glob('**/*.js', { cwd: fixtureDir, follow: true, posix: true })
    const elapsed = Date.now() - startTime

    expect(elapsed).toBeLessThan(2000)
    expect(results).toContain('src/main.js')
    expect(results).toContain('src/lib/helper.js')
  })

  it('should handle scoped pattern src/**/*.js with cycle', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    const startTime = Date.now()
    const results = await globlin.glob('src/**/*.js', {
      cwd: fixtureDir,
      follow: true,
      posix: true,
    })
    const elapsed = Date.now() - startTime

    expect(elapsed).toBeLessThan(2000)
    expect(results).toContain('src/main.js')
    expect(results).toContain('src/lib/helper.js')
  })

  it('should handle specific file pattern with cycle in parent', async () => {
    if (!globlin) throw new Error('globlin not loaded')

    const results = await globlin.glob('src/lib/helper.js', {
      cwd: fixtureDir,
      follow: true,
      posix: true,
    })

    expect(results).toContain('src/lib/helper.js')
    expect(results).toHaveLength(1)
  })
})
