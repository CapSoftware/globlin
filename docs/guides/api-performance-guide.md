# API Performance Guide

This guide provides detailed recommendations for choosing and optimizing globlin's APIs based on Phase 7 performance analysis.

## Quick Reference

| Use Case | Recommended API | Speedup vs glob |
|----------|-----------------|-----------------|
| **Default choice** | `globSync` | 2.5x |
| **Non-blocking code** | `glob` (async) | 2.5x |
| **Process as you find** | `globIterate` | 2.3x |
| **Early termination** | `globIterateSync` | 2.6x |
| **File type info needed** | `withFileTypes: true` | 1.5x |
| **Reusable pattern** | `Glob` class | 2.5x |
| **Pattern analysis** | `hasMagic` | 13x |

## Choosing the Right API

### Decision Flowchart

```
Do you need all results at once?
├─ Yes → Do you need async/non-blocking?
│        ├─ Yes → Use glob()
│        └─ No  → Use globSync() [FASTEST]
│
└─ No  → Do you need early termination?
         ├─ Yes → Use globIterateSync()
         └─ No  → Do you need streaming/backpressure?
                  ├─ Yes → Use globStream()
                  └─ No  → Use globIterate()
```

### API Comparison Table

| API | Best For | Overhead vs globSync | Memory | First Result |
|-----|----------|---------------------|--------|--------------|
| `globSync` | Speed, simplicity | baseline | All results | After completion |
| `glob` | Async contexts | +1-5% | All results | After completion |
| `globIterateSync` | Early termination | +9% | Per-item | Immediate |
| `globIterate` | Async iteration | +12% | Per-item | Immediate |
| `globStream` | Backpressure | +3% | Buffered | Immediate |
| `globStreamSync` | Sync streaming | -3% to +50x* | Buffered | Immediate |
| `Glob.walkSync()` | Reusable instance | -2% | All results | After completion |
| `Glob.walk()` | Async reusable | +1% | All results | After completion |

\* `globStreamSync` shows 30-50x slower performance on large (100k+) result sets due to Node.js stream overhead.

## API Deep Dive

### globSync / glob (Collection APIs)

**Best for:** Most use cases. Fastest when you need all results.

```typescript
import { globSync, glob } from 'globlin'

// Synchronous - fastest option
const files = globSync('**/*.ts', { ignore: ['node_modules/**'] })

// Async - for non-blocking contexts
const files = await glob('**/*.ts', { ignore: ['node_modules/**'] })
```

**Performance characteristics:**
- Small fixtures (304 files): 3.0-3.5x faster than glob
- Medium fixtures (20k files): 1.7-2.2x faster than glob
- Large fixtures (100k files): 2.3-3.1x faster than glob
- Async overhead: ~1-5% slower than sync

**When to use:**
- Building complete file lists
- Running multiple patterns via `Promise.all()`
- Tooling that processes all files together (linters, bundlers)

**When to avoid:**
- When you need the first result immediately
- Memory-constrained environments with huge result sets
- When you'll break after finding N files

### globIterate / globIterateSync (Iterator APIs)

**Best for:** Early termination, memory efficiency, incremental processing.

```typescript
import { globIterate, globIterateSync } from 'globlin'

// Find first matching file
for await (const file of globIterate('**/config.json')) {
  if (isValidConfig(file)) {
    return file // Early termination
  }
}

// Sync version (slightly faster)
for (const file of globIterateSync('**/*.log')) {
  processLogFile(file)
  if (processedEnough) break // 12% average time savings
}
```

**Performance characteristics:**
- Per-yield cost: ~0.03us (sync), ~0.14us (async)
- Iterator vs sync overhead: +9-14%
- Early termination savings: ~12% when breaking early
- Memory: processes one result at a time

**When to use:**
- Finding the first N matching files
- Processing files one at a time
- Memory-constrained environments
- When you might not need all results

**When to avoid:**
- When you need all results anyway (collection is faster)
- When processing order doesn't matter and you need speed

### globStream / globStreamSync (Streaming APIs)

**Best for:** Backpressure handling, pipe integration, stream-based workflows.

```typescript
import { globStream, globStreamSync } from 'globlin'

// Async stream with backpressure
const stream = globStream('**/*.json')
stream.pipe(jsonParser).pipe(database)

// Or consume manually
for await (const file of stream) {
  await processFile(file)
}
```

**Performance characteristics:**
- Stream vs sync overhead: -3% to +5% (stream can be faster!)
- Throughput: 1.95x better than glob streams
- Minipass overhead: 3-5% (minimal)
- Memory: ~50 bytes per result

**IMPORTANT:** Avoid `globStreamSync` on large result sets (100k+). Use `globSync` or `globIterateSync` instead.

```typescript
// BAD: 50x slower on large fixtures
const stream = globStreamSync('**/*', { cwd: '/large-dir' })

// GOOD: Use sync or async for large result sets
const files = globSync('**/*', { cwd: '/large-dir' })
// or
const stream = globStream('**/*', { cwd: '/large-dir' })
```

**When to use:**
- Integration with stream pipelines
- Backpressure-aware processing
- Minipass-based workflows

**When to avoid:**
- `globStreamSync` with large result sets (>50k files)
- When you don't need streaming semantics

### Glob Class API

**Best for:** Multiple operations with same options, pattern reuse.

```typescript
import { Glob } from 'globlin'

// Create once, use multiple times
const g = new Glob('**/*.ts', { ignore: ['node_modules/**'] })

// Multiple operations
const allFiles = await g.walk()
const syncFiles = g.walkSync()

for await (const file of g) {
  // async iteration
}

// Option inheritance (patterns are cached globally)
const subGlob = new Glob('src/**/*.ts', g)
```

**Performance characteristics:**
- Construction: 115-317x faster than glob's Glob class
- Method overhead: 0-4% vs standalone functions
- Cache reuse: minimal benefit (global LRU handles caching)
- Options processing: <1us overhead

**When to use:**
- Running the same pattern multiple times
- Creating derived patterns with shared options
- Object-oriented code style

**When to avoid:**
- One-off glob operations (use standalone functions)
- When you need maximum speed (standalone is ~2% faster)

### withFileTypes API

**Best for:** When you need file type information (isFile, isDirectory, etc.).

```typescript
import { globSync } from 'globlin'

// Returns GloblinPath objects with cached type info
const paths = globSync('**/*', { withFileTypes: true })

for (const path of paths) {
  // Fast: uses cached values from Rust (~0.001us)
  if (path.isDirectory()) {
    console.log('Dir:', path.fullpath())
  } else if (path.isFile()) {
    console.log('File:', path.name)
  }
}
```

**Performance characteristics:**
- Overhead vs string results: ~5%
- Path creation: 0.52us per result (96.8% faster than PathScurry)
- Method calls: ~0.001us (cached from Rust)
- stat: true adds ~6% overhead

**GloblinPath vs PathScurry:**
- Memory: 2.3x smaller (241 bytes vs 549 bytes)
- Creation: 35x faster (0.52us vs 18.5us)
- Type methods: instant (cached vs computed)
- Advanced features: use `path.toPath()` for PathScurry compatibility

**When to use:**
- Separating files from directories
- Checking symlinks
- When you need path metadata

**When to avoid:**
- When you only need path strings (5% overhead)
- When processing paths immediately (use string then stat)

### Utility Functions

**Best for:** Pattern analysis before glob operations.

```typescript
import { hasMagic, escape, unescape } from 'globlin'

// Check if pattern needs globbing (13x faster than glob)
if (hasMagic(pattern)) {
  return globSync(pattern)
} else {
  return [pattern] // Static path, skip glob
}

// Safely escape user input
const safe = escape(userInput) // ~0.2us per call
const original = unescape(safe)
```

**Performance characteristics:**
- `hasMagic`: 13x faster than glob (character scan vs AST parsing)
- `escape`/`unescape`: equivalent to glob (~0.2us)
- All utilities: <1us per call

**When to use:**
- Pre-filtering static vs glob patterns
- Sanitizing user input for patterns
- Pattern validation/analysis

## Performance by Fixture Size

### Small Fixtures (<1k files)

All APIs perform within 1ms. Differences are negligible.

**Recommendation:** Use whatever is most convenient.

### Medium Fixtures (1k-50k files)

Collection APIs are fastest. Iterator/stream overhead becomes measurable.

| API | Time (20k files) | Recommendation |
|-----|------------------|----------------|
| `globSync` | ~16ms | Default choice |
| `glob` | ~17ms | Async contexts |
| `globIterateSync` | ~17ms | Memory efficiency |
| `globStream` | ~18ms | Streaming workflows |

**Recommendation:** Use `globSync` for speed, `globIterateSync` for memory.

### Large Fixtures (50k+ files)

Performance differences become significant. Choose carefully.

| API | Time (100k files) | Notes |
|-----|-------------------|-------|
| `globSync` | ~95ms | Fastest |
| `glob` | ~94ms | Similar to sync |
| `globIterateSync` | ~103ms | +8% overhead |
| `globStream` | ~98ms | Good option |
| `globStreamSync` | ~5000ms | AVOID |

**Recommendation:** Avoid `globStreamSync` on large fixtures. Use `globSync`, `glob`, or `globStream`.

## Performance by Pattern Type

### Simple Patterns (`*.js`)

Best performers: All APIs similar. `globSync` is marginally fastest.

```typescript
// ~10ms on 100k files
const files = globSync('*.js')
```

### Recursive Patterns (`**/*.js`)

Best performers: `globSync`, `Glob.walk()`.

```typescript
// ~95ms on 100k files
const files = globSync('**/*.js')
```

### Scoped Patterns (`src/**/*.js`)

Best performers: All sync APIs perform similarly.

```typescript
// ~100ms on 100k files (only scans src/)
const files = globSync('src/**/*.js')
```

### Brace Expansion (`**/*.{js,ts}`)

Best performers: `Glob.walkSync()` slightly faster due to pattern caching.

```typescript
// ~100ms on 100k files
const files = new Glob('**/*.{js,ts}').walkSync()
```

## Trade-offs Summary

| Priority | Recommended API | Trade-off |
|----------|-----------------|-----------|
| **Speed** | `globSync` | Blocks thread |
| **Non-blocking** | `glob` | ~1-5% slower |
| **Memory** | `globIterateSync` | ~9% slower |
| **First result latency** | `globStream` | Slightly slower total |
| **Early termination** | `globIterateSync` | Saves ~12% on break |
| **Type info** | `withFileTypes` | ~5% overhead |
| **Pattern analysis** | `hasMagic` | 13x faster than glob |

## Anti-patterns to Avoid

### 1. Using globStreamSync on Large Fixtures

```typescript
// BAD: 50x slower
const stream = globStreamSync('**/*', { cwd: '/large-dir' })

// GOOD: Use async stream or sync collection
const files = globSync('**/*', { cwd: '/large-dir' })
```

### 2. Creating New Glob Instances for Same Pattern

```typescript
// UNNECESSARY: Pattern cache is global
const g1 = new Glob('**/*.ts', opts)
const g2 = new Glob('**/*.ts', opts) // Cache hit anyway

// ACCEPTABLE: Global cache handles this
const files = globSync('**/*.ts', opts)
```

### 3. Using Async When Sync Would Work

```typescript
// SLOWER in sync context
await glob('*.js') // Promise overhead

// FASTER for sync code
globSync('*.js')
```

### 4. Not Using Ignore for node_modules

```typescript
// SLOW: Traverses node_modules
globSync('**/*.js')

// FAST: Skips node_modules entirely
globSync('**/*.js', { ignore: ['node_modules/**'] })
```

## Benchmarking Your Use Case

```typescript
import { globSync, glob, globIterate, globStream, Glob } from 'globlin'

async function benchmarkAPIs(pattern, options) {
  const apis = {
    globSync: () => globSync(pattern, options),
    glob: () => glob(pattern, options),
    globIterateSync: () => [...new Glob(pattern, options)],
    Glob: () => new Glob(pattern, options).walkSync(),
  }
  
  for (const [name, fn] of Object.entries(apis)) {
    const start = performance.now()
    const results = await fn()
    const time = performance.now() - start
    console.log(`${name}: ${time.toFixed(2)}ms (${results.length} files)`)
  }
}

// Run your benchmark
await benchmarkAPIs('**/*.ts', { ignore: ['node_modules/**'] })
```

## Conclusion

1. **Default to `globSync`** - It's the fastest option for most cases
2. **Use `glob` for async contexts** - Only ~1-5% overhead
3. **Use `globIterateSync` for early termination** - Saves ~12% when breaking
4. **Avoid `globStreamSync` on large fixtures** - Up to 50x slower
5. **Use `withFileTypes` when needed** - Only ~5% overhead
6. **Always ignore `node_modules`** - Significant performance improvement

For the complete cross-API benchmark data, see [Cross-API Comparison](../performance/api/cross-api-comparison.md).
