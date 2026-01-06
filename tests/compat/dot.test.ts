/**
 * Dot file handling tests
 * Tests the `dot` option for including/excluding dotfiles (.hidden, .git, etc.)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { glob } from 'glob'
import { createTestFixture, cleanupFixture, loadGloblin, type GloblinModule } from '../harness'

let fixtureDir: string
let globlin: GloblinModule

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

      // Should include visible files
      expect(globResults).toContain('nested/visible')
      expect(globResults).toContain('nested/visible/file.txt')

      // Globlin should match
      expect(globlinResults).toContain('nested/visible')
      expect(globlinResults).toContain('nested/visible/file.txt')
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

      // Should include dotfiles
      expect(globResults).toContain('.hidden')
      expect(globResults).toContain('.git/config')
      expect(globResults).toContain('src/.env')
      expect(globResults).toContain('nested/.config')

      expect(globlinResults).toContain('.hidden')
      expect(globlinResults).toContain('.git/config')
      expect(globlinResults).toContain('src/.env')
      expect(globlinResults).toContain('nested/.config')
    })

    it('should include files inside dotdirs with **/*', async () => {
      const globResults = await glob('**/*', { cwd: fixtureDir, dot: true })
      const globlinResults = await globlin.glob('**/*', { cwd: fixtureDir, dot: true })

      expect(globResults).toContain('.git/config')
      expect(globResults).toContain('.git/HEAD')
      expect(globResults).toContain('nested/.config/settings.json')

      expect(globlinResults).toContain('.git/config')
      expect(globlinResults).toContain('.git/HEAD')
      expect(globlinResults).toContain('nested/.config/settings.json')
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

      expect(globResults.sort()).toEqual(['.git/HEAD', '.git/config'].sort())
      expect(globlinResults.sort()).toEqual(['.git/HEAD', '.git/config'].sort())
    })

    it('should match **/.env without dot option', async () => {
      const globResults = await glob('**/.env', { cwd: fixtureDir })
      const globlinResults = await globlin.glob('**/.env', { cwd: fixtureDir })

      expect(globResults).toContain('src/.env')
      expect(globlinResults).toContain('src/.env')
    })

    it('should match nested dotdir pattern without dot option', async () => {
      const globResults = await glob('nested/.config/*', { cwd: fixtureDir })
      const globlinResults = await globlin.glob('nested/.config/*', { cwd: fixtureDir })

      expect(globResults).toContain('nested/.config/settings.json')
      expect(globlinResults).toContain('nested/.config/settings.json')
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
