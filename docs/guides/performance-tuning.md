# Performance Tuning

This guide covers techniques to maximize globlin's performance.

## Use Specific Patterns

More specific patterns are faster:

```typescript
// Slower - searches everything
glob('**/*.js')

// Faster - scoped to directory
glob('src/**/*.js')
```

## Use Ignore Patterns

Ignore directories you don't need to search:

```typescript
glob('**/*.js', {
  ignore: [
    'node_modules/**',
    'dist/**',
    '.git/**',
    'coverage/**'
  ]
})
```

## Limit Depth

Use `maxDepth` when you don't need deep searches:

```typescript
// Only search 3 levels deep
glob('**/*.js', { maxDepth: 3 })
```

## Use Sync for Small Directories

For small directories (<1000 files), sync is often faster due to no Promise overhead:

```typescript
// For small directories
const files = globSync('*.js')

// For large directories
const files = await glob('**/*.js')
```

## Stream Large Results

For very large result sets, use streaming to reduce memory:

```typescript
const stream = globStream('**/*.js')
stream.on('data', (file) => {
  // Process one at a time
})
```

## Reuse Glob Instances

When running multiple globs, reuse the Glob instance to share filesystem cache:

```typescript
const g = new Glob('**/*.js', { cwd: '/project' })
const jsFiles = await g.walk()

// Reuse cache for next glob
const tsFiles = await new Glob('**/*.ts', g).walk()
```

## Avoid `withFileTypes` When Not Needed

`withFileTypes: true` adds overhead for creating Path objects:

```typescript
// Faster - just strings
glob('**/*.js')

// Slower - Path objects
glob('**/*.js', { withFileTypes: true })
```

## Pattern Optimization

| Pattern | Performance | Notes |
|---------|------------|-------|
| `*.js` | Fastest | No recursion |
| `**/*.js` | Medium | Full tree walk |
| `**/*` | Slowest | Matches everything |
| `{a,b,c}/**/*.js` | Good | Brace expansion at root |
| `**/*.{js,ts,jsx,tsx}` | Good | Single walk, multiple matches |

## Benchmarking

Measure your specific use case:

```typescript
const start = performance.now()
const files = await glob('**/*.js', { cwd: '/project' })
console.log(`Found ${files.length} files in ${performance.now() - start}ms`)
```

## Platform Considerations

- **Linux**: Fastest, case-sensitive by default
- **macOS**: Fast, case-insensitive by default
- **Windows**: Slightly slower due to path handling

## See Also

- [Options](../api/options.md)
- [Migration from glob](./migration-from-glob.md)
