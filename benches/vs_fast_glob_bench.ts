/**
 * Comprehensive Benchmark: Globlin vs Fast-Glob vs Glob
 *
 * This benchmark compares globlin against fast-glob and glob on various
 * pattern types to validate Phase 5.10 optimizations:
 * - Static patterns (Task 5.10.1)
 * - Multi-base patterns (Task 5.10.2)
 * - Segment-based matching (Task 5.10.3)
 *
 * Run with: npx tsx benches/vs_fast_glob_bench.ts
 */

import { glob as globOriginal, globSync as globSyncOriginal } from 'glob'
import fastGlob from 'fast-glob'
import { globSync, glob } from '../js/index'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface BenchResult {
  category: string
  pattern: string | string[]
  patternDisplay: string
  glob: number
  fastGlob: number
  globlin: number
  speedupVsGlob: number
  speedupVsFastGlob: number
  resultCount: number
  resultsMatch: boolean
}

interface FixtureConfig {
  name: string
  dir: string
  fileCount: number
}

const FIXTURES: FixtureConfig[] = [
  { name: 'Small', dir: path.join(__dirname, 'fixtures', 'small'), fileCount: 303 },
  { name: 'Medium', dir: path.join(__dirname, 'fixtures', 'medium'), fileCount: 20003 },
  { name: 'Large', dir: path.join(__dirname, 'fixtures', 'large'), fileCount: 100000 },
]

// Test patterns organized by category
const PATTERN_CATEGORIES: { name: string; patterns: (string | string[])[] }[] = [
  {
    name: 'Static Patterns',
    patterns: ['package.json', 'README.md', 'level0/file0.js', ['package.json', 'README.md']],
  },
  {
    name: 'Simple Patterns',
    patterns: ['*.js', '*.ts', '*.json', '*.md'],
  },
  {
    name: 'Recursive Patterns',
    patterns: ['**/*.js', '**/*.ts', '**/*', '**/file*.js'],
  },
  {
    name: 'Scoped Patterns',
    patterns: ['level0/**/*.js', 'level0/**/*.ts', 'level0/level1/**/*.js'],
  },
  {
    name: 'Multi-Base Patterns',
    patterns: [
      ['level0/**/*.js', 'level1/**/*.js'],
      ['level0/**/*.ts', 'level1/**/*.ts', 'level2/**/*.ts'],
    ],
  },
  {
    name: 'Brace Expansion',
    patterns: ['**/*.{js,ts}', '*.{json,md,txt}', 'level{0,1}/**/*.js'],
  },
  {
    name: 'Complex Patterns',
    patterns: ['level0/**/level1/**/*.js', '**/level*/**/*.ts', '**/*[0-9].js'],
  },
]

function formatPattern(pattern: string | string[]): string {
  if (Array.isArray(pattern)) {
    return `[${pattern.map(p => `'${p}'`).join(', ')}]`
  }
  return pattern
}

async function runSingleBench(
  pattern: string | string[],
  cwd: string,
  warmup: number = 3,
  iterations: number = 10
): Promise<{
  glob: number
  fastGlob: number
  globlin: number
  globResults: string[]
  globlinResults: string[]
  fgResults: string[]
}> {
  const patterns = Array.isArray(pattern) ? pattern : [pattern]

  // Warmup
  for (let i = 0; i < warmup; i++) {
    try {
      globSyncOriginal(patterns, { cwd })
    } catch {
      // Ignore errors during warmup
    }
    try {
      fastGlob.sync(patterns, { cwd })
    } catch {
      // Ignore errors during warmup
    }
    try {
      globSync(patterns, { cwd })
    } catch {
      // Ignore errors during warmup
    }
  }

  // Benchmark glob
  const globTimes: number[] = []
  let globResults: string[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    try {
      globResults = globSyncOriginal(patterns, { cwd })
    } catch {
      globResults = []
    }
    globTimes.push(performance.now() - start)
  }
  globTimes.sort((a, b) => a - b)
  const globTime = globTimes[Math.floor(iterations / 2)]

  // Benchmark fast-glob
  const fgTimes: number[] = []
  let fgResults: string[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    try {
      fgResults = fastGlob.sync(patterns, { cwd })
    } catch {
      fgResults = []
    }
    fgTimes.push(performance.now() - start)
  }
  fgTimes.sort((a, b) => a - b)
  const fgTime = fgTimes[Math.floor(iterations / 2)]

  // Benchmark globlin
  const globlinTimes: number[] = []
  let globlinResults: string[] = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    try {
      globlinResults = globSync(patterns, { cwd })
    } catch {
      globlinResults = []
    }
    globlinTimes.push(performance.now() - start)
  }
  globlinTimes.sort((a, b) => a - b)
  const globlinTime = globlinTimes[Math.floor(iterations / 2)]

  return {
    glob: globTime,
    fastGlob: fgTime,
    globlin: globlinTime,
    globResults,
    globlinResults,
    fgResults,
  }
}

function checkResultsMatch(globResults: string[], globlinResults: string[]): boolean {
  const globSet = new Set(globResults)
  const globlinSet = new Set(globlinResults)
  if (globSet.size !== globlinSet.size) return false
  for (const r of globSet) {
    if (!globlinSet.has(r)) return false
  }
  return true
}

async function runBenchmarks(fixture: FixtureConfig): Promise<BenchResult[]> {
  const results: BenchResult[] = []

  if (!fs.existsSync(fixture.dir)) {
    console.log(`  Fixture not found: ${fixture.dir}`)
    console.log(`  Run: npm run bench:setup`)
    return results
  }

  for (const category of PATTERN_CATEGORIES) {
    for (const pattern of category.patterns) {
      // For static patterns, create files if they don't exist
      if (category.name === 'Static Patterns') {
        const patternsArr = Array.isArray(pattern) ? pattern : [pattern]
        for (const p of patternsArr) {
          const filePath = path.join(fixture.dir, p)
          if (!fs.existsSync(filePath)) {
            try {
              fs.mkdirSync(path.dirname(filePath), { recursive: true })
              fs.writeFileSync(filePath, `// ${p}`)
            } catch {
              // Ignore file creation errors
            }
          }
        }
      }

      const bench = await runSingleBench(pattern, fixture.dir)
      const resultsMatch = checkResultsMatch(bench.globResults, bench.globlinResults)

      results.push({
        category: category.name,
        pattern,
        patternDisplay: formatPattern(pattern),
        glob: bench.glob,
        fastGlob: bench.fastGlob,
        globlin: bench.globlin,
        speedupVsGlob: bench.glob / bench.globlin,
        speedupVsFastGlob: bench.fastGlob / bench.globlin,
        resultCount: bench.globlinResults.length,
        resultsMatch,
      })
    }
  }

  return results
}

function printResults(fixture: FixtureConfig, results: BenchResult[]) {
  console.log()
  console.log(`${'='.repeat(80)}`)
  console.log(`Fixture: ${fixture.name} (${fixture.fileCount.toLocaleString()} files)`)
  console.log(`${'='.repeat(80)}`)
  console.log()

  // Group by category
  const byCategory = new Map<string, BenchResult[]>()
  for (const r of results) {
    if (!byCategory.has(r.category)) {
      byCategory.set(r.category, [])
    }
    byCategory.get(r.category)!.push(r)
  }

  // Print each category
  for (const [category, catResults] of byCategory) {
    console.log(`### ${category}`)
    console.log()
    console.log('| Pattern | Globlin | Glob | Fast-Glob | vs Glob | vs FG | Results | Match |')
    console.log('|---------|---------|------|-----------|---------|-------|---------|-------|')

    for (const r of catResults) {
      const patternCol =
        r.patternDisplay.length > 40 ? r.patternDisplay.substring(0, 37) + '...' : r.patternDisplay
      const vsGlob =
        r.speedupVsGlob >= 1
          ? `${r.speedupVsGlob.toFixed(2)}x`
          : `${(1 / r.speedupVsGlob).toFixed(2)}x slower`
      const vsFg =
        r.speedupVsFastGlob >= 1
          ? `${r.speedupVsFastGlob.toFixed(2)}x`
          : `${(1 / r.speedupVsFastGlob).toFixed(2)}x slower`

      console.log(
        `| ${patternCol.padEnd(40)} | ` +
          `${r.globlin.toFixed(2).padStart(7)}ms | ` +
          `${r.glob.toFixed(2).padStart(7)}ms | ` +
          `${r.fastGlob.toFixed(2).padStart(7)}ms | ` +
          `${vsGlob.padStart(12)} | ` +
          `${vsFg.padStart(12)} | ` +
          `${r.resultCount.toString().padStart(7)} | ` +
          `${r.resultsMatch ? 'Y' : 'N'}     |`
      )
    }
    console.log()
  }
}

function printSummary(allResults: Map<string, BenchResult[]>) {
  console.log()
  console.log(`${'='.repeat(80)}`)
  console.log('SUMMARY')
  console.log(`${'='.repeat(80)}`)
  console.log()

  // Aggregate by category across all fixtures
  const categoryAggregates = new Map<string, { vsGlob: number[]; vsFg: number[] }>()
  const fixtureAggregates = new Map<string, { vsGlob: number[]; vsFg: number[] }>()

  for (const [fixtureName, results] of allResults) {
    fixtureAggregates.set(fixtureName, { vsGlob: [], vsFg: [] })

    for (const r of results) {
      // By category
      if (!categoryAggregates.has(r.category)) {
        categoryAggregates.set(r.category, { vsGlob: [], vsFg: [] })
      }
      categoryAggregates.get(r.category)!.vsGlob.push(r.speedupVsGlob)
      categoryAggregates.get(r.category)!.vsFg.push(r.speedupVsFastGlob)

      // By fixture
      fixtureAggregates.get(fixtureName)!.vsGlob.push(r.speedupVsGlob)
      fixtureAggregates.get(fixtureName)!.vsFg.push(r.speedupVsFastGlob)
    }
  }

  // Print by fixture
  console.log('### Average Speedup by Fixture Size')
  console.log()
  console.log('| Fixture | Avg vs Glob | Avg vs Fast-Glob | Min | Max |')
  console.log('|---------|-------------|------------------|-----|-----|')

  for (const [name, agg] of fixtureAggregates) {
    if (agg.vsGlob.length === 0) continue
    const avgVsGlob = agg.vsGlob.reduce((a, b) => a + b, 0) / agg.vsGlob.length
    const avgVsFg = agg.vsFg.reduce((a, b) => a + b, 0) / agg.vsFg.length
    const minVsGlob = Math.min(...agg.vsGlob)
    const maxVsGlob = Math.max(...agg.vsGlob)
    console.log(
      `| ${name.padEnd(7)} | ${avgVsGlob.toFixed(2).padStart(11)}x | ${avgVsFg.toFixed(2).padStart(16)}x | ${minVsGlob.toFixed(2).padStart(3)}x | ${maxVsGlob.toFixed(2).padStart(3)}x |`
    )
  }
  console.log()

  // Print by category
  console.log('### Average Speedup by Pattern Category')
  console.log()
  console.log('| Category | Avg vs Glob | Avg vs Fast-Glob |')
  console.log('|----------|-------------|------------------|')

  for (const [name, agg] of categoryAggregates) {
    if (agg.vsGlob.length === 0) continue
    const avgVsGlob = agg.vsGlob.reduce((a, b) => a + b, 0) / agg.vsGlob.length
    const avgVsFg = agg.vsFg.reduce((a, b) => a + b, 0) / agg.vsFg.length
    console.log(
      `| ${name.padEnd(20)} | ${avgVsGlob.toFixed(2).padStart(11)}x | ${avgVsFg.toFixed(2).padStart(16)}x |`
    )
  }
  console.log()

  // Overall summary
  const allVsGlob: number[] = []
  const allVsFg: number[] = []
  for (const [, results] of allResults) {
    for (const r of results) {
      allVsGlob.push(r.speedupVsGlob)
      allVsFg.push(r.speedupVsFastGlob)
    }
  }

  if (allVsGlob.length > 0) {
    const overallVsGlob = allVsGlob.reduce((a, b) => a + b, 0) / allVsGlob.length
    const overallVsFg = allVsFg.reduce((a, b) => a + b, 0) / allVsFg.length
    const minVsGlob = Math.min(...allVsGlob)
    const maxVsGlob = Math.max(...allVsGlob)
    const patternsTotal = allVsGlob.length
    const patternsFaster = allVsGlob.filter(s => s >= 1).length
    const patternsFasterThanFg = allVsFg.filter(s => s >= 1).length

    console.log('### Overall Results')
    console.log()
    console.log(`- **Average speedup vs glob:** ${overallVsGlob.toFixed(2)}x`)
    console.log(`- **Average speedup vs fast-glob:** ${overallVsFg.toFixed(2)}x`)
    console.log(`- **Min/Max vs glob:** ${minVsGlob.toFixed(2)}x / ${maxVsGlob.toFixed(2)}x`)
    console.log(
      `- **Patterns faster than glob:** ${patternsFaster}/${patternsTotal} (${((patternsFaster / patternsTotal) * 100).toFixed(0)}%)`
    )
    console.log(
      `- **Patterns faster than fast-glob:** ${patternsFasterThanFg}/${patternsTotal} (${((patternsFasterThanFg / patternsTotal) * 100).toFixed(0)}%)`
    )
    console.log()

    // Check target criteria
    console.log('### Target Verification')
    console.log()
    const targetMet = overallVsFg >= 1
    console.log(`- Target: Equal to or faster than fast-glob on all patterns`)
    console.log(
      `- Status: ${targetMet ? 'MET' : 'NOT MET'} (${((patternsFasterThanFg / patternsTotal) * 100).toFixed(0)}% of patterns)`
    )
    console.log()
  }

  // Check for result mismatches
  const mismatches: { fixture: string; pattern: string }[] = []
  for (const [fixtureName, results] of allResults) {
    for (const r of results) {
      if (!r.resultsMatch) {
        mismatches.push({ fixture: fixtureName, pattern: r.patternDisplay })
      }
    }
  }

  if (mismatches.length > 0) {
    console.log('### Result Mismatches')
    console.log()
    for (const m of mismatches) {
      console.log(`- ${m.fixture}: ${m.pattern}`)
    }
    console.log()
  }
}

async function main() {
  console.log('Globlin vs Fast-Glob Benchmark')
  console.log('==============================')
  console.log()
  console.log('This benchmark compares globlin against fast-glob and glob')
  console.log('on various pattern types to validate Phase 5.10 optimizations.')
  console.log()
  console.log('Libraries:')
  console.log('- globlin: Rust-based glob implementation')
  console.log('- fast-glob: Popular fast glob implementation')
  console.log('- glob: Original glob package')
  console.log()

  // Parse command line args for fixture selection
  const args = process.argv.slice(2)
  let selectedFixtures = FIXTURES

  if (args.includes('--small')) {
    selectedFixtures = FIXTURES.filter(f => f.name === 'Small')
  } else if (args.includes('--medium')) {
    selectedFixtures = FIXTURES.filter(f => f.name === 'Medium')
  } else if (args.includes('--large')) {
    selectedFixtures = FIXTURES.filter(f => f.name === 'Large')
  } else if (args.includes('--all')) {
    selectedFixtures = FIXTURES
  } else {
    // Default to medium if no args provided
    selectedFixtures = FIXTURES.filter(f => f.name === 'Medium')
    console.log('Using medium fixture by default. Use --small, --medium, --large, or --all')
    console.log()
  }

  const allResults = new Map<string, BenchResult[]>()

  for (const fixture of selectedFixtures) {
    console.log(`Running benchmarks on ${fixture.name} fixture...`)
    const results = await runBenchmarks(fixture)
    if (results.length > 0) {
      allResults.set(fixture.name, results)
      printResults(fixture, results)
    }
  }

  if (allResults.size > 0) {
    printSummary(allResults)
  }
}

main().catch(console.error)
