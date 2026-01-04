#!/usr/bin/env node
/**
 * Generate real benchmark fixtures on disk
 *
 * This script creates actual files for benchmarking globlin against
 * real filesystem operations.
 *
 * Usage: node benches/setup-fixtures.js
 */

const fs = require('fs/promises')
const path = require('path')

const FIXTURES_DIR = path.join(__dirname, 'fixtures')

/**
 * Create a benchmark fixture with specified configuration
 */
async function createBenchmarkFixture(name, config) {
  const fixtureDir = path.join(FIXTURES_DIR, name)

  console.log(`Creating fixture: ${name}`)
  console.log(`  Files: ${config.fileCount}`)
  console.log(`  Max depth: ${config.maxDepth}`)
  console.log(`  Extensions: ${config.extensions.join(', ')}`)

  // Clean existing fixture
  await fs.rm(fixtureDir, { recursive: true, force: true })
  await fs.mkdir(fixtureDir, { recursive: true })

  const startTime = Date.now()

  // Create directory structure
  for (let i = 0; i < config.fileCount; i++) {
    const depth = i % config.maxDepth
    const dirParts = Array(depth)
      .fill(0)
      .map((_, j) => `level${j}`)

    const dirPath = path.join(fixtureDir, ...dirParts)
    await fs.mkdir(dirPath, { recursive: true })

    // Create files with different extensions
    for (const ext of config.extensions) {
      const fileName = `file${i}.${ext}`
      const filePath = path.join(dirPath, fileName)
      await fs.writeFile(filePath, `// Benchmark file ${i}\n// Extension: ${ext}\n`)
    }
  }

  // Create some special files if requested
  if (config.dotFiles) {
    await fs.writeFile(path.join(fixtureDir, '.gitignore'), 'node_modules\n')
    await fs.writeFile(path.join(fixtureDir, '.env'), 'SECRET=value\n')
    await fs.mkdir(path.join(fixtureDir, '.hidden'), { recursive: true })
    await fs.writeFile(path.join(fixtureDir, '.hidden', 'secret.txt'), 'hidden content')
  }

  // Create symlinks if requested (skip on Windows if needed)
  if (config.symlinks && process.platform !== 'win32') {
    try {
      await fs.symlink(
        path.join(fixtureDir, 'level0', 'file0.js'),
        path.join(fixtureDir, 'link.js')
      )
    } catch (err) {
      console.log('  Warning: Could not create symlinks:', err.message)
    }
  }

  const elapsed = Date.now() - startTime
  console.log(`  Created in ${elapsed}ms`)

  return fixtureDir
}

/**
 * Count files in fixture for verification
 */
async function countFiles(dir) {
  let count = 0

  async function walk(d) {
    const entries = await fs.readdir(d, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await walk(path.join(d, entry.name))
      } else {
        count++
      }
    }
  }

  await walk(dir)
  return count
}

async function main() {
  console.log('Generating benchmark fixtures...\n')

  // Ensure fixtures directory exists
  await fs.mkdir(FIXTURES_DIR, { recursive: true })

  // Small fixture (for quick tests)
  const small = await createBenchmarkFixture('small', {
    fileCount: 100,
    maxDepth: 3,
    extensions: ['js', 'ts', 'txt'],
    dotFiles: true,
    symlinks: true,
  })

  // Medium fixture (typical project)
  const medium = await createBenchmarkFixture('medium', {
    fileCount: 10000,
    maxDepth: 5,
    extensions: ['js', 'ts'],
    dotFiles: true,
    symlinks: true,
  })

  // Large fixture (monorepo)
  const large = await createBenchmarkFixture('large', {
    fileCount: 100000,
    maxDepth: 7,
    extensions: ['js'],
    dotFiles: false,
    symlinks: false,
  })

  console.log('\nFixture verification:')
  console.log(`  small: ${await countFiles(small)} files`)
  console.log(`  medium: ${await countFiles(medium)} files`)
  console.log(`  large: ${await countFiles(large)} files`)

  console.log('\nDone! Fixtures are ready for benchmarking.')
  console.log('Run benchmarks with: npm run bench')
}

main().catch(console.error)
