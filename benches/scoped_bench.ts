import { glob as nodejsGlob } from 'glob'
import fg from 'fast-glob'
import { globSync } from '../index.js'

const FIXTURE = 'benches/fixtures/large'
const PATTERN = 'level0/**/*.js'
const ITERATIONS = 10

async function benchmark() {
    console.log(`\nBenchmarking scoped pattern: ${PATTERN}`)
    console.log(`Fixture: ${FIXTURE}`)
    console.log(`Iterations: ${ITERATIONS}\n`)

    // Warmup
    for (let i = 0; i < 3; i++) {
        await nodejsGlob(PATTERN, { cwd: FIXTURE })
        await fg(PATTERN, { cwd: FIXTURE })
        globSync(PATTERN, { cwd: FIXTURE })
    }

    // Benchmark glob
    const globTimes: number[] = []
    for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now()
        await nodejsGlob(PATTERN, { cwd: FIXTURE })
        globTimes.push(performance.now() - start)
    }

    // Benchmark fast-glob
    const fgTimes: number[] = []
    for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now()
        await fg(PATTERN, { cwd: FIXTURE })
        fgTimes.push(performance.now() - start)
    }

    // Benchmark globlin
    const globlinTimes: number[] = []
    for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now()
        globSync(PATTERN, { cwd: FIXTURE })
        globlinTimes.push(performance.now() - start)
    }

    const median = (arr: number[]) => {
        const sorted = [...arr].sort((a, b) => a - b)
        return sorted[Math.floor(sorted.length / 2)]
    }

    const globMedian = median(globTimes)
    const fgMedian = median(fgTimes)
    const globlinMedian = median(globlinTimes)

    console.log('Results:')
    console.log(`  glob:      ${globMedian.toFixed(2)}ms`)
    console.log(`  fast-glob: ${fgMedian.toFixed(2)}ms`)
    console.log(`  globlin:   ${globlinMedian.toFixed(2)}ms`)
    console.log('')
    console.log(`  vs glob:      ${(globMedian / globlinMedian).toFixed(2)}x faster`)
    console.log(`  vs fast-glob: ${(fgMedian / globlinMedian).toFixed(2)}x faster`)
    console.log('')
    
    const diff = ((globlinMedian - fgMedian) / fgMedian * 100)
    if (diff > 0) {
        console.log(`  Gap from fast-glob: ${diff.toFixed(1)}% slower`)
    } else {
        console.log(`  Ahead of fast-glob: ${Math.abs(diff).toFixed(1)}% faster`)
    }
}

benchmark().catch(console.error)
