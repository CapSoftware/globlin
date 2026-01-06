# Glob Class

The `Glob` class provides an object-oriented interface for glob operations with support for cache reuse and multiple execution methods.

## Constructor

```typescript
class Glob {
  constructor(
    pattern: string | string[],
    options?: GlobOptions | Glob
  )
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `string \| string[]` | A glob pattern or array of patterns |
| `options` | `GlobOptions \| Glob` | Options object or another Glob instance for cache reuse |

### Properties

```typescript
class Glob {
  readonly pattern: string[]   // Patterns (always an array)
  readonly options: GlobOptions // Resolved options
}
```

## Methods

### walk() / walkSync()

Execute the glob and return all matching paths.

```typescript
walk(): Promise<string[]>
walkSync(): string[]
```

### stream() / streamSync()

Execute the glob and return a Minipass stream.

```typescript
stream(): Minipass<string, string>
streamSync(): Minipass<string, string>
```

### iterate() / iterateSync()

Execute the glob and return a generator.

```typescript
iterate(): AsyncGenerator<string, void, void>
iterateSync(): Generator<string, void, void>
```

## Iterator Protocol

The Glob class implements both sync and async iterator protocols:

```typescript
// Built-in methods
[Symbol.asyncIterator](): AsyncGenerator<string, void, void>
[Symbol.iterator](): Generator<string, void, void>
```

### Examples

```typescript
import { Glob } from 'globlin'

const g = new Glob('**/*.js', { cwd: '/project' })

// Async iteration
for await (const file of g) {
  console.log(file)
}

// Sync iteration
for (const file of g) {
  console.log(file)
}
```

## Examples

### Basic Usage

```typescript
import { Glob } from 'globlin'

// Create a Glob instance
const g = new Glob('**/*.js', {
  cwd: '/path/to/project',
  ignore: ['node_modules/**']
})

// Get all results at once
const files = await g.walk()

// Or synchronously
const filesSync = g.walkSync()
```

### Multiple Patterns

```typescript
import { Glob } from 'globlin'

const g = new Glob(['**/*.ts', '**/*.tsx'], {
  cwd: '/project/src',
  ignore: ['**/*.test.ts', '**/*.test.tsx']
})

const typeScriptFiles = await g.walk()
```

### Streaming Results

```typescript
import { Glob } from 'globlin'

const g = new Glob('**/*.log')

// Async stream
const stream = g.stream()
stream.on('data', (file) => console.log(file))
stream.on('end', () => console.log('Done'))

// Sync stream
const syncStream = g.streamSync()
for (const file of syncStream) {
  console.log(file)
}
```

### Iterator Usage

```typescript
import { Glob } from 'globlin'

const g = new Glob('**/*.js')

// Using iterate() method
for await (const file of g.iterate()) {
  console.log(file)
}

// Using Symbol.asyncIterator
for await (const file of g) {
  console.log(file)
}

// Sync iteration
for (const file of g.iterateSync()) {
  console.log(file)
}

// Using Symbol.iterator
for (const file of g) {
  console.log(file)
}
```

## Cache Reuse

Pass a Glob instance as the options parameter to reuse its settings. This is useful when running multiple glob operations with similar configurations.

```typescript
import { Glob } from 'globlin'

// First glob with specific settings
const g1 = new Glob('**/*.js', {
  cwd: '/project',
  ignore: ['node_modules/**'],
  dot: true,
  nocase: true
})
const jsFiles = await g1.walk()

// Reuse g1's settings for a different pattern
// This copies all options: cwd, ignore, dot, nocase, etc.
const g2 = new Glob('**/*.ts', g1)
const tsFiles = await g2.walk()

// Chain multiple globs with shared settings
const g3 = new Glob('**/*.json', g2)  // Same settings as g1 and g2
```

### What Gets Reused

When passing a Glob as options, the following are copied:

| Option | Description |
|--------|-------------|
| `cwd` | Working directory |
| `root` | Root directory |
| `dot` | Include dotfiles |
| `nobrace` | Disable braces |
| `noglobstar` | Disable globstar |
| `noext` | Disable extglobs |
| `nocase` | Case-insensitive |
| `follow` | Follow symlinks |
| `maxDepth` | Maximum depth |
| `matchBase` | Match basename |
| `absolute` | Return absolute paths |
| `dotRelative` | Prepend ./ |
| `mark` | Append / to dirs |
| `nodir` | Exclude directories |
| `posix` | POSIX paths |
| `stat` | Always stat |
| `realpath` | Resolve symlinks |
| `ignore` | Ignore patterns |
| `platform` | Platform |
| `windowsPathsNoEscape` | Windows escaping |
| `parallel` | Parallel walking |
| `cache` | Directory caching |

### What Does NOT Get Reused

- The pattern itself (you provide a new pattern)
- `signal` (AbortSignal is not copied)
- Internal caches (pattern cache is global anyway)

## Options Validation

The Glob class validates options in the constructor:

```typescript
import { Glob } from 'globlin'

// Error: cannot set absolute and withFileTypes:true
new Glob('**/*', { withFileTypes: true, absolute: true })

// Error: base matching requires globstar
new Glob('*.js', { matchBase: true, noglobstar: true })
```

## TypeScript Types

```typescript
class Glob {
  readonly pattern: string[]
  readonly options: GlobOptions

  constructor(pattern: string | string[], options?: GlobOptions | Glob)

  walk(): Promise<string[]>
  walkSync(): string[]
  stream(): Minipass<string, string>
  streamSync(): Minipass<string, string>
  iterate(): AsyncGenerator<string, void, void>
  iterateSync(): Generator<string, void, void>
  
  [Symbol.asyncIterator](): AsyncGenerator<string, void, void>
  [Symbol.iterator](): Generator<string, void, void>
}
```

## Method Comparison

| Method | Returns | Async | Memory | Use Case |
|--------|---------|-------|--------|----------|
| `walk()` | `Promise<string[]>` | Yes | Higher | Need all results as array |
| `walkSync()` | `string[]` | No | Higher | Sync code, need array |
| `stream()` | `Minipass` | Yes | Lower | Piping, large results |
| `streamSync()` | `Minipass` | No | Lower | Sync stream processing |
| `iterate()` | `AsyncGenerator` | Yes | Lower | `for await...of` syntax |
| `iterateSync()` | `Generator` | No | Lower | `for...of` syntax |

## Notes

- The Glob class always returns strings, even when `withFileTypes: true` is set in options
- Pattern is always stored as an array internally
- Options are validated in the constructor (fail-fast)
- Fully compatible with glob v13's Glob class

## See Also

- [glob](./glob.md) - Standalone async function
- [globSync](./globSync.md) - Standalone sync function
- [globStream](./globStream.md) - Standalone streaming function
- [globIterate](./globIterate.md) - Standalone iterator function
- [Options](./options.md) - Full options reference
