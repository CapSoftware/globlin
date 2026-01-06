#!/usr/bin/env npx tsx
/**
 * Debug script to verify directory pruning is working
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { globSync } from '../js/index.js'
import { globSync as globOriginal } from 'glob'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Create a simple test fixture
const fixtureDir = join(__dirname, 'fixtures', 'debug-test')
if (existsSync(fixtureDir)) {
  rmSync(fixtureDir, { recursive: true })
}

// Create structure:
// debug-test/
// ├── src/
// │   ├── lib/
// │   │   └── utils.ts
// │   └── index.ts
// ├── test/
// │   └── test.ts
// ├── docs/
// │   └── readme.md
// └── file.js

mkdirSync(join(fixtureDir, 'src/lib'), { recursive: true })
mkdirSync(join(fixtureDir, 'test'), { recursive: true })
mkdirSync(join(fixtureDir, 'docs'), { recursive: true })

writeFileSync(join(fixtureDir, 'src/lib/utils.ts'), '// utils')
writeFileSync(join(fixtureDir, 'src/index.ts'), '// index')
writeFileSync(join(fixtureDir, 'test/test.ts'), '// test')
writeFileSync(join(fixtureDir, 'docs/readme.md'), '# readme')
writeFileSync(join(fixtureDir, 'file.js'), '// file')

console.log('Created test fixture at:', fixtureDir)
console.log('')

// Test patterns
const patterns = [
  'src/**/*.ts', // Should only traverse src/
  'src/lib/**/*.ts', // Should only traverse src/lib/
  '**/*.ts', // Must traverse all
  'test/**/*.ts', // Should only traverse test/
]

for (const pattern of patterns) {
  console.log(`Pattern: ${pattern}`)

  const globResults = globOriginal(pattern, { cwd: fixtureDir })
  const globlinResults = globSync(pattern, { cwd: fixtureDir })

  console.log(`  glob:    ${JSON.stringify(globResults.sort())}`)
  console.log(`  globlin: ${JSON.stringify(globlinResults.sort())}`)

  const match = JSON.stringify(globResults.sort()) === JSON.stringify(globlinResults.sort())
  console.log(`  match: ${match ? 'ok' : 'MISMATCH'}`)
  console.log('')
}

// Cleanup
rmSync(fixtureDir, { recursive: true })
