# globIterate() / globIterateSync()

Generator-based iteration functions for glob results. Provides a clean, idiomatic way to iterate over matching files.

## Signatures

```typescript
async function* globIterate(
  pattern: string | string[],
  options?: GlobOptions
): AsyncGenerator<string, void, void>

function* globIterateSync(
  pattern: string | string[],
  options?: GlobOptions
): Generator<string, void, void>
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `string \| string[]` | A glob pattern or array of patterns to match |
| `options` | `GlobOptions` | Optional configuration options |

## Returns

- `globIterate()` - Returns an `AsyncGenerator<string>` for use with `for await...of`
- `globIterateSync()` - Returns a `Generator<string>` for use with `for...of`

**Note:** Iterator APIs always return strings, even when `withFileTypes: true` is set. Use `glob()` or `globSync()` for Path objects.

## Examples

### Async Iteration

```typescript
import { globIterate } from 'globlin'

// Iterate over all JavaScript files
for await (const file of globIterate('**/*.js')) {
  console.log('Processing:', file)
  // Process each file as it's found
}
```

### Sync Iteration

```typescript
import { globIterateSync } from 'globlin'

// Synchronously iterate over files
for (const file of globIterateSync('**/*.ts')) {
  console.log('Found:', file)
}
```

### With Options

```typescript
import { globIterate } from 'globlin'

for await (const file of globIterate('**/*.js', {
  cwd: '/project',
  ignore: ['node_modules/**'],
  dot: true
})) {
  console.log(file)
}
```

### Collecting Results

```typescript
import { globIterate, globIterateSync } from 'globlin'

// Async: collect into array
const asyncFiles = []
for await (const file of globIterate('**/*.js')) {
  asyncFiles.push(file)
}

// Sync: collect into array
const syncFiles = [...globIterateSync('**/*.ts')]

// Or use Array.from (sync only)
const files = Array.from(globIterateSync('**/*.ts'))
```

### Early Exit

```typescript
import { globIterate } from 'globlin'

// Stop after finding 10 files
let count = 0
for await (const file of globIterate('**/*.js')) {
  console.log(file)
  if (++count >= 10) break
}
```

### Filtering During Iteration

```typescript
import { globIterateSync } from 'globlin'
import { statSync } from 'fs'

// Find large files
for (const file of globIterateSync('**/*.log')) {
  const stats = statSync(file)
  if (stats.size > 1024 * 1024) {
    console.log(`Large file: ${file} (${stats.size} bytes)`)
  }
}
```

### Multiple Patterns

```typescript
import { globIterate } from 'globlin'

// Iterate over multiple file types
for await (const file of globIterate(['**/*.ts', '**/*.tsx'])) {
  // Process TypeScript and TSX files
}
```

## TypeScript Types

```typescript
// Async generator type
type GlobAsyncIterator = AsyncGenerator<string, void, void>

// Sync generator type  
type GlobSyncIterator = Generator<string, void, void>
```

## Differences Between Iterate and Stream

| Feature | globIterate | globStream |
|---------|-------------|------------|
| Return type | Generator | Minipass stream |
| Syntax | `for await...of` / `for...of` | Event-based or pipe |
| Early exit | Natural with `break` | Need to destroy stream |
| Collecting | Spread operator or loop | `.collect()` method |
| Piping | N/A | Yes |

### When to Use Each

**Use `globIterate` when:**
- You want simple `for...of` syntax
- Processing results one at a time
- You might exit early
- You don't need to pipe to other streams

**Use `globStream` when:**
- You need to pipe results to another stream
- You're working with stream-based APIs
- You want event-based processing

## Implementation Note

Currently, `globIterate()` and `globIterateSync()` collect all results first and then yield them. This is for API simplicity. For true lazy iteration of very large directories, consider using `globStream()`.

```typescript
// Current implementation
async function* globIterate(pattern, options) {
  const results = await glob(pattern, options)
  for (const result of results) {
    yield result
  }
}
```

## Notes

- Iterator APIs **always return strings**, ignoring `withFileTypes`
- Generators support `break`, `return`, and early exit naturally
- `globIterateSync()` blocks until all results are collected
- Fully compatible with glob v13's iterator API

## See Also

- [glob](./glob.md) - Returns all results as an array
- [globStream](./globStream.md) - Minipass stream-based iteration
- [Glob class](./Glob-class.md) - Object-oriented interface with `.iterate()` method
- [Options](./options.md) - Full options reference
