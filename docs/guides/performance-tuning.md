# Performance Tuning Guide

This guide provides actionable advice for maximizing globlin's performance in your projects.

## When to Use Globlin

Globlin is a **20-30x drop-in replacement for glob v13** that provides:

| Scenario | Globlin vs glob | Recommendation |
|----------|-----------------|----------------|
| Large projects (100k+ files) | **2-2.5x faster** | Use globlin |
| Medium projects (10k-100k files) | **1.5-2x faster** | Use globlin |
| Small projects (<10k files) | **1.4x faster** | Either works |
| Build tools and CI | **2+ seconds saved** per large glob | Use globlin |
| Edge cases (nested globstars) | Slight differences | Test your patterns |

**Rule of thumb:** If your glob operations take more than 100ms, globlin will save you meaningful time.

## Pattern Performance

### Pattern Complexity Hierarchy

Patterns are listed from fastest to slowest:

| Pattern Type | Example | Relative Speed | Notes |
|--------------|---------|----------------|-------|
| Simple extension | `*.js` | **Fastest** | Only scans root directory |
| Recursive extension | `**/*.js` | Fast | Full tree, extension check |
| Scoped recursive | `src/**/*.js` | Fast | Only scans `src/` subtree |
| Brace expansion | `**/*.{js,ts}` | Medium | Single walk, multiple matches |
| Character class | `**/*[0-9].js` | Medium | Regex matching |
| Question mark | `**/file?.js` | Medium | Regex matching |
| Nested globstar | `**/*/**/*.js` | Slow | Complex matching |
| Match everything | `**/*` | Slowest | Returns all files |

### Optimization: Use Specific Patterns

```typescript
// Slower - searches everything
const files = await glob('**/*.js')

// Faster - scoped to specific directory
const files = await glob('src/**/*.js')

// Fastest - no recursion needed
const files = globSync('*.js')
```

### Optimization: Prefer Extensions Over Complex Patterns

```typescript
// Slower - regex matching for each file
const files = await glob('**/*spec*.js')

// Faster - simple extension check
const files = await glob('**/*.spec.js')
```

## Ignore Patterns

### Always Ignore Unnecessary Directories

The `ignore` option provides early termination - ignored directories are not traversed:

```typescript
// Recommended ignore patterns
const files = await glob('**/*.js', {
  ignore: [
    'node_modules/**',
    'dist/**', 
    '.git/**',
    'coverage/**',
    'build/**',
    '**/*.min.js'
  ]
})
```

### How Ignore Patterns Work

| Pattern | Behavior |
|---------|----------|
| `node_modules/**` | Ignores directory AND all children (stops traversal) |
| `node_modules` | Only ignores exact match |
| `*.log` | Ignores matching files |
| `**/dist/**` | Ignores `dist/` at any depth |

```typescript
// Most efficient - stops directory traversal
const files = await glob('**/*.js', {
  ignore: ['node_modules/**', 'dist/**']
})

// Less efficient - traverses but filters
const files = await glob('**/*.js', {
  ignore: ['**/*.test.js']
})
```

## Depth Limiting

Use `maxDepth` when you don't need deep searches:

```typescript
// Only search 2 levels deep (root + 1 level)
const files = await glob('**/*.js', { maxDepth: 2 })

// Package.json files near root
const configs = await glob('**/package.json', { maxDepth: 3 })
```

### maxDepth Values

| Value | Behavior |
|-------|----------|
| `0` | Only cwd itself |
| `1` | cwd + immediate children |
| `2` | cwd + 2 levels |
| `-1` | Empty results |
| `undefined` | Unlimited (default) |

## Sync vs Async

### When to Use Sync

For small operations, sync is often faster due to no Promise overhead:

```typescript
// For small directories or simple patterns
const files = globSync('*.js')
const configs = globSync('package.json')
```

### When to Use Async

For large operations or when you need non-blocking behavior:

```typescript
// For large directories
const files = await glob('**/*.js', { cwd: '/large-project' })

// When you need to run multiple globs concurrently
const [jsFiles, tsFiles] = await Promise.all([
  glob('**/*.js'),
  glob('**/*.ts')
])
```

## Streaming Large Results

For very large result sets, use streaming to reduce peak memory:

```typescript
import { globStream } from 'globlin'

const stream = globStream('**/*.js', { cwd: '/huge-project' })

stream.on('data', (file) => {
  // Process one file at a time
  processFile(file)
})

stream.on('end', () => {
  console.log('Done!')
})
```

Or use iterators for cleaner async code:

```typescript
import { globIterate } from 'globlin'

for await (const file of globIterate('**/*.js')) {
  await processFile(file)
}
```

## Parallel Mode

Globlin supports parallel directory walking via the `parallel` option.

### When Parallel Helps

```typescript
// Parallel mode - for HDDs or network filesystems
const files = await glob('**/*.js', { 
  parallel: true,
  cwd: '/mnt/network-share'
})
```

### When Parallel Hurts

On SSDs (most modern systems), parallel mode is **30% slower** due to thread coordination overhead:

| Storage Type | Parallel Speedup |
|--------------|------------------|
| SSD (default) | 0.7x (30% slower) |
| HDD | 1.2-1.5x faster |
| Network FS | 1.5-2x faster |

**Recommendation:** Leave `parallel: false` (default) unless you're on HDD or network storage.

## Caching

### Directory Cache

Globlin provides optional directory caching:

```typescript
// Enable caching for repeated operations
const files = await glob('**/*.js', { cache: true })
```

### Cache Performance

| Scenario | Cache Benefit |
|----------|---------------|
| Single glob call | Slight overhead |
| 5+ repeated calls | ~10-20% faster |
| Simple patterns (`*.txt`) | 20-30% faster |
| Network filesystems | Significant |

**Recommendation:** Only enable cache for hot loops or network filesystems.

### Glob Class Cache Reuse

When running multiple globs with shared options, reuse the Glob instance:

```typescript
import { Glob } from 'globlin'

// Create base glob with shared options
const g = new Glob('**/*.js', { 
  cwd: '/project',
  ignore: ['node_modules/**']
})

const jsFiles = await g.walk()

// Reuse options for next glob (inherits cwd, ignore, etc.)
const tsFiles = await new Glob('**/*.ts', g).walk()
```

## Avoid withFileTypes When Not Needed

`withFileTypes: true` adds overhead for creating Path objects:

```typescript
// Faster - just strings
const files = await glob('**/*.js')

// Slower - Path objects with stats
const paths = await glob('**/*.js', { withFileTypes: true })
```

Only use `withFileTypes` when you need:
- `isFile()`, `isDirectory()` methods
- `fullpath()`, `relative()` methods
- PathScurry compatibility

## Platform Considerations

### Performance by Platform

| Platform | Speed | Default nocase | Notes |
|----------|-------|----------------|-------|
| Linux | Fastest | `false` | Case-sensitive FS |
| macOS | Fast | `true` | Case-insensitive FS |
| Windows | Slightly slower | `true` | Path handling overhead |

### Case Sensitivity

Case-insensitive matching (`nocase: true`) has minimal overhead but affects results:

```typescript
// On macOS/Windows, these match the same files
const files1 = await glob('**/*.JS')
const files2 = await glob('**/*.js')

// Force case-sensitive (faster on macOS)
const files = await glob('**/*.js', { nocase: false })
```

## Benchmarking Your Use Case

Always measure your specific patterns and directories:

```typescript
async function benchmarkGlob(pattern: string, options = {}) {
  const start = performance.now()
  const files = await glob(pattern, options)
  const time = performance.now() - start
  
  console.log(`Pattern: ${pattern}`)
  console.log(`Files found: ${files.length}`)
  console.log(`Time: ${time.toFixed(2)}ms`)
  
  return { files, time }
}

// Compare different approaches
await benchmarkGlob('**/*.js')
await benchmarkGlob('**/*.js', { ignore: ['node_modules/**'] })
await benchmarkGlob('src/**/*.js')
```

### npm Scripts for Benchmarking

```json
{
  "scripts": {
    "bench:glob": "tsx benches/my-glob-benchmark.ts"
  }
}
```

## Performance Checklist

Use this checklist when optimizing glob operations:

- [ ] **Scope your patterns** - Use `src/**/*.js` instead of `**/*.js`
- [ ] **Ignore unnecessary directories** - Add `node_modules/**`, `dist/**`, etc.
- [ ] **Limit depth** - Use `maxDepth` if you don't need deep searches
- [ ] **Use simple patterns** - Prefer `*.js` over `*spec*.js`
- [ ] **Use sync for small operations** - Avoid Promise overhead
- [ ] **Stream large results** - Use `globStream` or `globIterate`
- [ ] **Reuse Glob instances** - Share options across related globs
- [ ] **Leave parallel disabled** - Unless on HDD/network storage
- [ ] **Leave cache disabled** - Unless running many repeated globs
- [ ] **Skip withFileTypes** - Unless you need Path object methods

## Real-World Examples

### Build Tool

```typescript
// Collecting source files for bundling
const sourceFiles = await glob('src/**/*.{ts,tsx}', {
  ignore: [
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/__tests__/**',
    '**/__mocks__/**'
  ]
})
```

### Test Runner

```typescript
// Finding test files
const testFiles = await glob('**/*.test.ts', {
  ignore: ['node_modules/**', 'dist/**'],
  maxDepth: 5
})
```

### Linter

```typescript
// ESLint-style file collection
const files = await glob([
  'src/**/*.{js,ts,jsx,tsx}',
  'tests/**/*.{js,ts}'
], {
  ignore: [
    'node_modules/**',
    'dist/**',
    'coverage/**',
    '**/*.d.ts',
    '**/*.min.js'
  ]
})
```

### Monorepo Package Discovery

```typescript
// Finding workspace packages
const packages = await glob('packages/*/package.json', {
  maxDepth: 3
})
```

## Summary

| Technique | Impact | When to Use |
|-----------|--------|-------------|
| Scope patterns | High | Always |
| Ignore patterns | High | Always |
| Limit depth | Medium | Shallow searches |
| Sync API | Low | Small operations |
| Streaming | Medium | Large results |
| Parallel mode | Negative* | HDD/network only |
| Caching | Low | Repeated operations |
| Skip withFileTypes | Low | When not needed |

*Parallel mode is slower on SSDs due to thread overhead.

## See Also

- [API Reference - Options](../api/options.md)
- [Migration from glob](./migration-from-glob.md)
- [Troubleshooting](./troubleshooting.md)
