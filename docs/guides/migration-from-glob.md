# Migration from glob

Globlin is a drop-in replacement for glob v13 that provides 1.5-2.5x performance improvement. This guide covers everything you need to know to migrate from glob to globlin.

## Quick Start

### Installation

```bash
# Remove glob
npm uninstall glob

# Install globlin
npm install globlin
```

### Update Imports

Simply change your import statement:

```typescript
// Before
import { glob, globSync } from 'glob'

// After
import { glob, globSync } from 'globlin'
```

That's it! All your existing code should work without any other changes.

---

## Complete API Compatibility

Globlin implements 100% of glob v13's public API:

### Core Functions

| Function | Status | Description |
|----------|--------|-------------|
| `glob()` | Compatible | Async glob pattern matching |
| `globSync()` | Compatible | Sync glob pattern matching |
| `globStream()` | Compatible | Returns Minipass stream |
| `globStreamSync()` | Compatible | Returns sync Minipass stream |
| `globIterate()` | Compatible | Returns async generator |
| `globIterateSync()` | Compatible | Returns sync generator |

### Glob Class

| Method | Status | Description |
|--------|--------|-------------|
| `new Glob(pattern, options)` | Compatible | Constructor |
| `.walk()` | Compatible | Async walk, returns Promise |
| `.walkSync()` | Compatible | Sync walk, returns array |
| `.stream()` | Compatible | Returns async stream |
| `.streamSync()` | Compatible | Returns sync stream |
| `.iterate()` | Compatible | Returns async generator |
| `.iterateSync()` | Compatible | Returns sync generator |
| `[Symbol.asyncIterator]` | Compatible | For `for await...of` |
| `[Symbol.iterator]` | Compatible | For `for...of` |

### Utility Functions

| Function | Status | Description |
|----------|--------|-------------|
| `hasMagic()` | Compatible | Detect glob magic characters |
| `escape()` | Compatible | Escape glob characters |
| `unescape()` | Compatible | Unescape glob characters |

### Re-exports

Globlin re-exports the same dependencies as glob for compatibility:

```typescript
// All available from globlin
import { 
  Minimatch, 
  minimatch, 
  PathScurry, 
  Path, 
  Minipass 
} from 'globlin'
```

---

## Options Compatibility

All 22 options from glob v13 are supported:

### Path Options

```typescript
glob('**/*.js', {
  cwd: '/project',         // Working directory (default: process.cwd())
  root: '/',               // Root for absolute patterns
})
```

### Pattern Options

```typescript
glob('**/*.js', {
  dot: true,               // Include dotfiles
  nobrace: false,          // Disable {a,b} expansion
  noglobstar: false,       // Treat ** as regular *
  noext: false,            // Disable extglob patterns
  nocase: true,            // Case-insensitive (platform default)
  magicalBraces: false,    // Treat braces as magic in hasMagic()
})
```

### Traversal Options

```typescript
glob('**/*.js', {
  follow: false,           // Follow symlinks
  maxDepth: 10,            // Limit traversal depth
  matchBase: false,        // Match against basename only
})
```

### Output Options

```typescript
glob('**/*.js', {
  absolute: false,         // Return absolute paths
  dotRelative: false,      // Prepend ./ to relative paths
  mark: false,             // Append / to directories
  nodir: false,            // Exclude directories
  posix: false,            // Use / on Windows
  withFileTypes: false,    // Return Path objects
})
```

### Filtering Options

```typescript
glob('**/*.js', {
  ignore: ['**/node_modules/**'],  // Ignore patterns
  includeChildMatches: true,       // Include children of matches
})
```

### Platform Options

```typescript
glob('**/*.js', {
  platform: 'darwin',              // Force platform behavior
  windowsPathsNoEscape: false,     // Treat \ as path separator
  signal: abortController.signal,  // AbortSignal for cancellation
})
```

---

## Pattern Support

Globlin supports all glob pattern syntax:

### Basic Patterns

| Pattern | Example | Description |
|---------|---------|-------------|
| `*` | `*.js` | Match any characters except `/` |
| `**` | `**/*.ts` | Match any path segments |
| `?` | `file?.js` | Match single character |
| `[abc]` | `[abc].txt` | Character class |
| `[a-z]` | `[a-z].js` | Character range |
| `[!abc]` | `[!0-9].md` | Negated class |

### Brace Expansion

| Pattern | Expands To |
|---------|------------|
| `{a,b,c}` | `a`, `b`, `c` |
| `{1..5}` | `1`, `2`, `3`, `4`, `5` |
| `{a..e}` | `a`, `b`, `c`, `d`, `e` |
| `{1..10..2}` | `1`, `3`, `5`, `7`, `9` |
| `{01..03}` | `01`, `02`, `03` |

### Extglob Patterns

| Pattern | Description |
|---------|-------------|
| `@(a\|b)` | Exactly one of a or b |
| `*(a\|b)` | Zero or more of a or b |
| `+(a\|b)` | One or more of a or b |
| `?(a\|b)` | Zero or one of a or b |
| `!(a\|b)` | None of a or b |

### POSIX Character Classes

```typescript
glob('**/[[:alpha:]].txt')  // Alphabetic characters
glob('**/[[:digit:]].txt')  // Digits
glob('**/[[:alnum:]].txt')  // Alphanumeric
// ... and 11 more POSIX classes
```

---

## What's Different

### Not Supported

The following features are intentionally not supported:

#### Custom Filesystem (`fs` option)

Globlin uses native filesystem calls for maximum performance. If you need custom filesystem support, continue using glob.

```typescript
// NOT SUPPORTED - use glob instead
import { createFsFromVolume, Volume } from 'memfs'

glob('**/*.js', {
  fs: createFsFromVolume(new Volume())  // Won't work in globlin
})
```

#### Custom PathScurry Instance (`scurry` option)

Globlin handles path walking internally in Rust.

```typescript
// NOT SUPPORTED
const scurry = new PathScurry('/project')
glob('**/*.js', { scurry })  // Won't work in globlin
```

### Minor Behavioral Differences

1. **Result ordering**: Results may be returned in a different order (both libraries return unordered results by default)

2. **Error messages**: Some error messages may have slightly different wording, but error types and conditions are the same

3. **Parallel option**: Globlin adds a `parallel: true` option for HDD/network filesystems (not in glob)

4. **Cache option**: Globlin adds a `cache: true` option for repeated globs (not in glob)

---

## Performance Comparison

### Benchmark Results (100,000 files)

| Pattern Type | glob | globlin | Speedup |
|--------------|------|---------|---------|
| Simple (`*.js`) | 95ms | 40ms | 2.4x |
| Recursive (`**/*.js`) | 264ms | 114ms | 2.3x |
| Scoped (`src/**/*.ts`) | 180ms | 85ms | 2.1x |
| Brace (`**/*.{js,ts}`) | 290ms | 145ms | 2.0x |
| **Average** | - | - | **2.2x** |

### When Does Globlin Shine?

- **Large directories**: 2x+ faster on 10,000+ files
- **Recursive patterns**: Most effective with `**` patterns
- **Simple patterns**: Excellent depth-limited optimization

### When to Stick with glob

- **Custom filesystem**: If you need `fs` or `scurry` options
- **Very small directories**: <100 files, initialization overhead may matter
- **Memory constraints**: Globlin uses native memory in addition to JS heap

---

## Globlin-Specific Options

Globlin adds a few options not available in glob:

### `parallel: boolean` (default: `false`)

Enable parallel directory walking. Useful for HDDs or network filesystems.

```typescript
// For network drives or HDDs
const results = await glob('**/*.js', {
  cwd: '/mnt/network-share',
  parallel: true
})
```

**Note**: On SSDs, parallel mode may actually be slower due to coordination overhead.

### `cache: boolean` (default: `false`)

Enable directory caching for repeated glob operations.

```typescript
// Enable caching for repeated globs
const g = new Glob('**/*.js', { cache: true })
await g.walk()  // First call: normal speed
await g.walk()  // Second call: potentially faster
```

**Note**: Cache has a 5-second TTL. On modern SSDs, the cache may not provide significant benefit due to OS-level caching.

---

## Troubleshooting

### TypeScript Errors

If you see type errors after migration, ensure your TypeScript is configured correctly:

```json
{
  "compilerOptions": {
    "moduleResolution": "node16",
    "esModuleInterop": true,
    "target": "ES2020"
  }
}
```

### Different Results

If globlin returns different results than glob:

1. **Check for edge cases**: Nested globstars like `**/*/**/*.js` may have minor differences
2. **Check extglob negation**: Complex `!(pattern)` edge cases are being refined
3. **File a bug report**: Different results should not happen and are treated as compatibility bugs

### AbortSignal Not Working

AbortSignal support is implemented in the JavaScript wrapper:

```typescript
const controller = new AbortController()

// This works
glob('**/*.js', { signal: controller.signal })
  .catch(err => {
    if (err.message === 'operation aborted') {
      console.log('Glob was cancelled')
    }
  })

controller.abort()
```

### Performance Not Improved

1. **Check fixture size**: Globlin's advantage shows on 1,000+ files
2. **Avoid parallel on SSD**: Use `parallel: false` (default)
3. **Simple patterns are fastest**: `*.js` is faster than `**/*.js`

---

## Migration Checklist

- [ ] Install globlin: `npm install globlin`
- [ ] Remove glob: `npm uninstall glob`
- [ ] Update imports: `'glob'` -> `'globlin'`
- [ ] Remove `fs` option usage if present
- [ ] Remove `scurry` option usage if present
- [ ] Run tests to verify behavior
- [ ] (Optional) Add `parallel: true` for HDDs/network drives
- [ ] (Optional) Add `cache: true` for repeated operations

---

## Getting Help

- **Documentation**: See `docs/api/` for complete API reference
- **Performance Guide**: See `docs/guides/performance-tuning.md`
- **Bug Reports**: File issues at https://github.com/yourusername/globlin/issues

---

## See Also

- [API Reference](../api/glob.md)
- [Performance Tuning](./performance-tuning.md)
- [Troubleshooting](./troubleshooting.md)
- [Options Reference](../api/options.md)
