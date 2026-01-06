/**
 * Test fixture management for globlin.
 *
 * All fixtures are REAL files on disk - no mocks or simulations.
 * Re-exports from harness.ts for cleaner imports.
 */

export {
  createTestFixture,
  createLargeFixture,
  cleanupFixture,
  cleanupAllFixtures,
  DEFAULT_FIXTURE,
  type FixtureConfig,
} from './harness.js'

import * as path from 'path'
import * as fs from 'fs'

const fsp = fs.promises

const FIXTURES_ROOT = path.join(__dirname, 'fixtures')

/**
 * Create a random fixture for property-based testing.
 * Generates random file/directory structure.
 */
export async function createRandomFixture(options: {
  fileCount?: number
  depth?: number
  extensions?: string[]
  includeDotFiles?: boolean
  includeSymlinks?: boolean
}): Promise<string> {
  const {
    fileCount = 50,
    depth = 3,
    extensions = ['js', 'ts', 'txt', 'json', 'md'],
    includeDotFiles = true,
    includeSymlinks = false,
  } = options

  const fixtureDir = path.join(
    FIXTURES_ROOT,
    'random',
    `run-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )

  await fsp.mkdir(fixtureDir, { recursive: true })

  const createdFiles: string[] = []

  for (let i = 0; i < fileCount; i++) {
    const currentDepth = Math.floor(Math.random() * depth)
    const ext = extensions[Math.floor(Math.random() * extensions.length)]

    const dirParts: string[] = []
    for (let d = 0; d < currentDepth; d++) {
      const isDotDir = includeDotFiles && Math.random() < 0.1
      const dirName = isDotDir ? `.dir${d}` : `dir${d}_${Math.floor(Math.random() * 10)}`
      dirParts.push(dirName)
    }

    const isDotFile = includeDotFiles && Math.random() < 0.1
    const fileName = isDotFile ? `.file${i}.${ext}` : `file${i}.${ext}`

    const filePath = path.join(fixtureDir, ...dirParts, fileName)
    await fsp.mkdir(path.dirname(filePath), { recursive: true })
    await fsp.writeFile(filePath, `// Random file ${i}\nexport const id = ${i};\n`)
    createdFiles.push(path.relative(fixtureDir, filePath))
  }

  if (includeSymlinks && process.platform !== 'win32' && createdFiles.length > 0) {
    try {
      const targetFile = createdFiles[0]
      const symlinkPath = path.join(fixtureDir, 'symlink-to-file')
      await fsp.symlink(targetFile, symlinkPath)

      const symlinkDirPath = path.join(fixtureDir, 'symlink-to-dir')
      await fsp.symlink('.', symlinkDirPath)
    } catch {
      // Symlinks might fail on some systems
    }
  }

  return fixtureDir
}

/**
 * Create a monorepo-style fixture for testing realistic patterns.
 */
export async function createMonorepoFixture(options: {
  packages?: number
  filesPerPackage?: number
  nodeModulesDepth?: number
}): Promise<string> {
  const { packages = 10, filesPerPackage = 20, nodeModulesDepth = 2 } = options

  const fixtureDir = path.join(FIXTURES_ROOT, 'monorepo', `run-${Date.now()}`)

  await fsp.mkdir(fixtureDir, { recursive: true })

  // Create root package.json
  await fsp.writeFile(
    path.join(fixtureDir, 'package.json'),
    JSON.stringify({ name: 'monorepo', private: true, workspaces: ['packages/*'] }, null, 2)
  )

  // Create packages
  for (let p = 0; p < packages; p++) {
    const pkgDir = path.join(fixtureDir, 'packages', `package-${p}`)
    const srcDir = path.join(pkgDir, 'src')
    const testDir = path.join(pkgDir, 'test')

    await fsp.mkdir(srcDir, { recursive: true })
    await fsp.mkdir(testDir, { recursive: true })

    await fsp.writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: `@monorepo/package-${p}`, version: '1.0.0' }, null, 2)
    )

    for (let f = 0; f < filesPerPackage; f++) {
      const isTest = f < filesPerPackage / 4
      const dir = isTest ? testDir : srcDir
      const ext = f % 2 === 0 ? 'ts' : 'tsx'
      const fileName = isTest ? `file${f}.test.${ext}` : `file${f}.${ext}`

      await fsp.writeFile(
        path.join(dir, fileName),
        `// Package ${p}, File ${f}\nexport const value = ${f};\n`
      )
    }

    // Create nested node_modules
    if (nodeModulesDepth > 0) {
      let nmDir = path.join(pkgDir, 'node_modules')
      for (let d = 0; d < nodeModulesDepth; d++) {
        const depDir = path.join(nmDir, `dep-${d}`)
        await fsp.mkdir(depDir, { recursive: true })
        await fsp.writeFile(path.join(depDir, 'index.js'), `module.exports = ${d};\n`)
        nmDir = path.join(depDir, 'node_modules')
      }
    }
  }

  return fixtureDir
}

/**
 * Create a build output-style fixture (dist, build directories).
 */
export async function createBuildOutputFixture(options: {
  sourceFiles?: number
  generateDts?: boolean
  generateMaps?: boolean
}): Promise<string> {
  const { sourceFiles = 100, generateDts = true, generateMaps = true } = options

  const fixtureDir = path.join(FIXTURES_ROOT, 'build-output', `run-${Date.now()}`)

  const srcDir = path.join(fixtureDir, 'src')
  const distDir = path.join(fixtureDir, 'dist')

  await fsp.mkdir(srcDir, { recursive: true })
  await fsp.mkdir(distDir, { recursive: true })

  for (let i = 0; i < sourceFiles; i++) {
    const depth = i % 3
    const dirParts = Array.from({ length: depth }, (_, j) => `level${j}`)

    // Source file
    const srcPath = path.join(srcDir, ...dirParts, `file${i}.ts`)
    await fsp.mkdir(path.dirname(srcPath), { recursive: true })
    await fsp.writeFile(srcPath, `export const x${i} = ${i};\n`)

    // Compiled JS
    const jsPath = path.join(distDir, ...dirParts, `file${i}.js`)
    await fsp.mkdir(path.dirname(jsPath), { recursive: true })
    await fsp.writeFile(jsPath, `"use strict";\nexports.x${i} = ${i};\n`)

    if (generateDts) {
      const dtsPath = path.join(distDir, ...dirParts, `file${i}.d.ts`)
      await fsp.writeFile(dtsPath, `export declare const x${i}: number;\n`)
    }

    if (generateMaps) {
      const mapPath = path.join(distDir, ...dirParts, `file${i}.js.map`)
      await fsp.writeFile(mapPath, JSON.stringify({ version: 3, sources: [`file${i}.ts`] }))
    }
  }

  return fixtureDir
}

/**
 * Create a git repo-style fixture with common patterns.
 */
export async function createGitRepoFixture(options: {
  trackedFiles?: number
  ignoredPatterns?: string[]
}): Promise<string> {
  const { trackedFiles = 50, ignoredPatterns = ['node_modules', '*.log', 'dist/', '.env'] } =
    options

  const fixtureDir = path.join(FIXTURES_ROOT, 'git-repo', `run-${Date.now()}`)

  await fsp.mkdir(fixtureDir, { recursive: true })

  // Create .gitignore
  await fsp.writeFile(path.join(fixtureDir, '.gitignore'), ignoredPatterns.join('\n') + '\n')

  // Create tracked files
  for (let i = 0; i < trackedFiles; i++) {
    const depth = i % 3
    const dirParts = Array.from({ length: depth }, (_, j) => `src${j}`)
    const ext = ['ts', 'js', 'json', 'md'][i % 4]

    const filePath = path.join(fixtureDir, ...dirParts, `file${i}.${ext}`)
    await fsp.mkdir(path.dirname(filePath), { recursive: true })
    await fsp.writeFile(filePath, `// File ${i}\n`)
  }

  // Create some ignored files
  await fsp.mkdir(path.join(fixtureDir, 'node_modules', 'some-dep'), { recursive: true })
  await fsp.writeFile(path.join(fixtureDir, 'node_modules', 'some-dep', 'index.js'), '')
  await fsp.mkdir(path.join(fixtureDir, 'dist'), { recursive: true })
  await fsp.writeFile(path.join(fixtureDir, 'dist', 'bundle.js'), '')
  await fsp.writeFile(path.join(fixtureDir, 'app.log'), 'log content')
  await fsp.writeFile(path.join(fixtureDir, '.env'), 'SECRET=value')

  return fixtureDir
}

/**
 * Read .gitignore patterns from a file
 */
export async function readGitignore(gitignorePath: string): Promise<string[]> {
  try {
    const content = await fsp.readFile(gitignorePath, 'utf-8')
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(pattern => {
        // Convert gitignore patterns to glob patterns
        if (pattern.endsWith('/')) {
          return `**/${pattern}**`
        }
        if (!pattern.includes('/')) {
          return `**/${pattern}`
        }
        return pattern
      })
  } catch {
    return []
  }
}
