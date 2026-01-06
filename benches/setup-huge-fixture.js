#!/usr/bin/env node
/**
 * Generate a huge benchmark fixture (1M files)
 *
 * This creates a very large fixture for stress testing the parallel
 * walking implementation on extreme workloads.
 *
 * WARNING: This will create ~1 million files and may take several minutes!
 *
 * Usage: node benches/setup-huge-fixture.js
 */

const fs = require('fs/promises')
const path = require('path')

const FIXTURES_DIR = path.join(__dirname, 'fixtures')
const TARGET_FILES = 1_000_000

async function createHugeFixture() {
  const fixtureDir = path.join(FIXTURES_DIR, 'huge')

  console.log('Creating HUGE fixture (1M files)')
  console.log(`  Target: ${TARGET_FILES.toLocaleString()} files`)
  console.log('  WARNING: This may take several minutes!\n')

  // Clean existing fixture
  await fs.rm(fixtureDir, { recursive: true, force: true })
  await fs.mkdir(fixtureDir, { recursive: true })

  const startTime = Date.now()
  let filesCreated = 0
  const maxDepth = 8

  // Create files in batches across multiple directories
  // Structure: level0/level1/.../levelN/file_XXXX.js
  // This creates a wide and deep tree to stress test both breadth and depth

  // Calculate distribution
  // We'll create directories at each level, then files at the deepest level
  // With 10 dirs per level and 8 levels, we get 10^7 = 10M potential leaf directories
  // We'll spread 1M files across them, ~100 files per 10k directories

  const dirsPerLevel = 7 // 7^8 = 5.7M directories is too many, we'll use 5 levels deep
  const filesPerDir = Math.ceil(TARGET_FILES / Math.pow(dirsPerLevel, 5))

  console.log(`  Strategy: ${dirsPerLevel} dirs per level, ~${filesPerDir} files per deepest dir`)

  // Track progress
  let lastProgressTime = Date.now()
  let lastProgressFiles = 0

  async function createLevel(currentPath, depth, index) {
    if (filesCreated >= TARGET_FILES) return

    if (depth >= 5) {
      // Create files at this leaf directory
      await fs.mkdir(currentPath, { recursive: true })

      const filesToCreate = Math.min(filesPerDir, TARGET_FILES - filesCreated)
      for (let f = 0; f < filesToCreate && filesCreated < TARGET_FILES; f++) {
        const fileName = `file_${filesCreated}.js`
        await fs.writeFile(path.join(currentPath, fileName), `// File ${filesCreated}\n`)
        filesCreated++

        // Progress update every second
        const now = Date.now()
        if (now - lastProgressTime >= 1000) {
          const rate = Math.round(
            (filesCreated - lastProgressFiles) / ((now - lastProgressTime) / 1000)
          )
          const percent = Math.round((filesCreated / TARGET_FILES) * 100)
          const eta = Math.round((TARGET_FILES - filesCreated) / rate)
          console.log(
            `  Progress: ${filesCreated.toLocaleString()} files (${percent}%) - ${rate}/s - ETA: ${eta}s`
          )
          lastProgressTime = now
          lastProgressFiles = filesCreated
        }
      }
    } else {
      // Create subdirectories
      for (let i = 0; i < dirsPerLevel && filesCreated < TARGET_FILES; i++) {
        const subDir = path.join(currentPath, `level${depth}_${i}`)
        await createLevel(subDir, depth + 1, i)
      }
    }
  }

  await createLevel(fixtureDir, 0, 0)

  const elapsed = (Date.now() - startTime) / 1000
  console.log(`\n  Created ${filesCreated.toLocaleString()} files in ${elapsed.toFixed(1)}s`)
  console.log(`  Rate: ${Math.round(filesCreated / elapsed)} files/s`)

  return fixtureDir
}

async function countFiles(dir) {
  let count = 0

  async function walk(d) {
    try {
      const entries = await fs.readdir(d, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await walk(path.join(d, entry.name))
        } else {
          count++
        }
      }
    } catch {
      // Ignore errors
    }
  }

  await walk(dir)
  return count
}

async function main() {
  console.log('Generating HUGE benchmark fixture...\n')

  await fs.mkdir(FIXTURES_DIR, { recursive: true })

  const hugeDir = await createHugeFixture()

  console.log('\nVerifying...')
  const fileCount = await countFiles(hugeDir)
  console.log(`  Actual files: ${fileCount.toLocaleString()}`)

  console.log('\nDone! Huge fixture is ready.')
  console.log('Run parallel benchmark with: npm run bench:parallel:large -- --huge')
}

main().catch(console.error)
