/**
 * Dot file handling tests
 * Tests the `dot` option for including/excluding dotfiles (.hidden, .git, etc.)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { glob } from 'glob'
import { createTestFixture, cleanupFixture, loadGloblin, type GloblinModule } from '../harness'

let fixtureDir: string
let globlin: GloblinModule

// Normalize paths for cross-platform comparison (replace backslashes with forward slashes)
const normalize = (paths: string[]): string[] => paths.map(p => p.replace(/\\/g, '/'))
const normalizeStr = (path: string): string => path.replace(/\\/g, '/')

// Fixture with dotfiles
const DOT_FILE_FIXTURE = {
  files: [
    'foo.txt',
    'bar.txt',
    '.hidden',
    '.gitignore',
    'src/main.js',
    'src/util.js',
    'src/.env',
    '.git/config',
    '.git/HEAD',
    'nested/.config/settings.json',
    'nested/visible/file.txt',
  ],
}

beforeAll(async () => {
  globlin = await loadGloblin()
  fixtureDir = await createTestFixture('dot-test', DOT_FILE_FIXTURE)
})

afterAll(async () => {
  if (fixtureDir) {
    await cleanupFixture(fixtureDir)
  }
})

describe('Dot file handling', () => {
  describe('dot: false (default)', () => {
    it('should exclude dotfiles at root with *', async () => {
      const globResults = await glob('*', { cwd: fixtureDir })
      const globlinResults = await globlin.glob('*', { cwd: fixtureDir })

      // Both should exclude dotfiles
      expect(globResults).not.toContain('.hidden')
      expect(globResults).not.toContain('.gitignore')
      expect(globResults).not.toContain('.git')

      expect(globlinResults).not.toContain('.hidden')
      expect(globlinResults).not.toContain('.gitignore')
      expect(globlinResults).not.toContain('.git')

      // But include regular files
      expect(globResults).toContain('foo.txt')
      expect(globlinResults).toContain('foo.txt')
    })

    it('should exclude dotfiles with **/*', async () => {
      const globResults = await glob('**/*', { cwd: fixtureDir })
      const globlinResults = await globlin.glob('**/*', { cwd: fixtureDir })

      // Should not include any dotfiles or files inside dot directories
      const hasDotFiles = (results: string[]) =>
        results.some(
          r => r.includes('/.') || r.startsWith('.') || r.includes('.git') || r.includes('.config')
        )

      expect(hasDotFiles(globResults)).toBe(false)
      expect(hasDotFiles(globlinResults)).toBe(false)
    })

    it('should include visible nested files', async () => {
      const globResults = await glob('nested/**/*', { cwd: fixtureDir })
      const globlinResults = await globlin.glob('nested/**/*', { cwd: fixtureDir })

      // Normalize paths for cross-platform comparison
      const normalizedGlob = normalize(globResults)
      const normalizedGloblin = normalize(globlinResults)

      // Should include visible files
      expect(normalizedGlob).toContain('nested/visible')
      expect(normalizedGlob).toContain('nested/visible/file.txt')

      // Globlin should match
      expect(normalizedGloblin).toContain('nested/visible')
      expect(normalizedGloblin).toContain('nested/visible/file.txt')
    })
  })

  describe('dot: true', () => {
    it('should include dotfiles at root with *', async () => {
      const globResults = await glob('*', { cwd: fixtureDir, dot: true })
      const globlinResults = await globlin.glob('*', { cwd: fixtureDir, dot: true })

      // Both should include dotfiles
      expect(globResults).toContain('.hidden')
      expect(globResults).toContain('.gitignore')
      expect(globResults).toContain('.git')

      expect(globlinResults).toContain('.hidden')
      expect(globlinResults).toContain('.gitignore')
      expect(globlinResults).toContain('.git')
    })

    it('should include dotfiles with **/*', async () => {
      const globResults = await glob('**/*', { cwd: fixtureDir, dot: true })
      const globlinResults = await globlin.glob('**/*', { cwd: fixtureDir, dot: true })

      // Normalize paths for cross-platform comparison
      const normalizedGlob = normalize(globResults)
      const normalizedGloblin = normalize(globlinResults)

      // Should include dotfiles
      expect(normalizedGlob).toContain('.hidden')
      expect(normalizedGlob).toContain('.git/config')
      expect(normalizedGlob).toContain('src/.env')
      expect(normalizedGlob).toContain('nested/.config')

      expect(normalizedGloblin).toContain('.hidden')
      expect(normalizedGloblin).toContain('.git/config')
      expect(normalizedGloblin).toContain('src/.env')
      expect(normalizedGloblin).toContain('nested/.config')
    })

    it('should include files inside dotdirs with **/*', async () => {
      const globResults = await glob('**/*', { cwd: fixtureDir, dot: true })
      const globlinResults = await globlin.glob('**/*', { cwd: fixtureDir, dot: true })

      // Normalize paths for cross-platform comparison
      const normalizedGlob = normalize(globResults)
      const normalizedGloblin = normalize(globlinResults)

      expect(normalizedGlob).toContain('.git/config')
      expect(normalizedGlob).toContain('.git/HEAD')
      expect(normalizedGlob).toContain('nested/.config/settings.json')

      expect(normalizedGloblin).toContain('.git/config')
      expect(normalizedGloblin).toContain('.git/HEAD')
      expect(normalizedGloblin).toContain('nested/.config/settings.json')
    })
  })

  describe('Explicit dot patterns', () => {
    it('should match explicit .hidden pattern without dot option', async () => {
      const globResults = await glob('.hidden', { cwd: fixtureDir })
      const globlinResults = await globlin.glob('.hidden', { cwd: fixtureDir })

      expect(globResults).toContain('.hidden')
      expect(globlinResults).toContain('.hidden')
    })

    it('should match explicit .git/* pattern without dot option', async () => {
      const globResults = await glob('.git/*', { cwd: fixtureDir })
      const globlinResults = await globlin.glob('.git/*', { cwd: fixtureDir })

      // Normalize paths for cross-platform comparison
      expect(normalize(globResults).sort()).toEqual(['.git/HEAD', '.git/config'].sort())
      expect(normalize(globlinResults).sort()).toEqual(['.git/HEAD', '.git/config'].sort())
    })

    it('should match **/.env without dot option', async () => {
      const globResults = await glob('**/.env', { cwd: fixtureDir })
      const globlinResults = await globlin.glob('**/.env', { cwd: fixtureDir })

      // Normalize paths for cross-platform comparison
      expect(normalize(globResults)).toContain('src/.env')
      expect(normalize(globlinResults)).toContain('src/.env')
    })

    it('should match nested dotdir pattern without dot option', async () => {
      const globResults = await glob('nested/.config/*', { cwd: fixtureDir })
      const globlinResults = await globlin.glob('nested/.config/*', { cwd: fixtureDir })

      // Normalize paths for cross-platform comparison
      expect(normalize(globResults)).toContain('nested/.config/settings.json')
      expect(normalize(globlinResults)).toContain('nested/.config/settings.json')
    })
  })

  describe('Result comparison', () => {
    it('should match glob results for * pattern (dot: false)', async () => {
      const globResults = await glob('*', { cwd: fixtureDir })
      const globlinResults = await globlin.glob('*', { cwd: fixtureDir })

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should match glob results for * pattern (dot: true)', async () => {
      const globResults = await glob('*', { cwd: fixtureDir, dot: true })
      const globlinResults = await globlin.glob('*', { cwd: fixtureDir, dot: true })

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should match glob results for **/* pattern (dot: false)', async () => {
      const globResults = await glob('**/*', { cwd: fixtureDir })
      const globlinResults = await globlin.glob('**/*', { cwd: fixtureDir })

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })

    it('should match glob results for **/* pattern (dot: true)', async () => {
      const globResults = await glob('**/*', { cwd: fixtureDir, dot: true })
      const globlinResults = await globlin.glob('**/*', { cwd: fixtureDir, dot: true })

      expect(new Set(globlinResults)).toEqual(new Set(globResults))
    })
  })
})
