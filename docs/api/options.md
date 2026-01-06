# GlobOptions

Configuration options for glob operations. Globlin supports all options from glob v13, plus additional performance options.

## Quick Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string` | `process.cwd()` | Working directory |
| `root` | `string` | `undefined` | Root for absolute patterns |
| `dot` | `boolean` | `false` | Include dotfiles |
| `nobrace` | `boolean` | `false` | Disable brace expansion |
| `noglobstar` | `boolean` | `false` | Disable `**` |
| `noext` | `boolean` | `false` | Disable extglobs |
| `nocase` | `boolean` | Platform-dependent | Case-insensitive |
| `magicalBraces` | `boolean` | `false` | Smart brace expansion |
| `follow` | `boolean` | `false` | Follow symlinks |
| `maxDepth` | `number` | `Infinity` | Maximum depth |
| `matchBase` | `boolean` | `false` | Match basename only |
| `absolute` | `boolean` | `false` | Return absolute paths |
| `dotRelative` | `boolean` | `false` | Prepend `./` |
| `mark` | `boolean` | `false` | Append `/` to dirs |
| `nodir` | `boolean` | `false` | Exclude directories |
| `posix` | `boolean` | `false` | POSIX paths on Windows |
| `withFileTypes` | `boolean` | `false` | Return Path objects |
| `stat` | `boolean` | `false` | Always stat files |
| `realpath` | `boolean` | `false` | Resolve symlinks |
| `ignore` | `string \| string[] \| IgnorePattern` | `undefined` | Exclude patterns |
| `includeChildMatches` | `boolean` | `true` | Include children of matches |
| `platform` | `string` | `process.platform` | Override platform |
| `windowsPathsNoEscape` | `boolean` | `false` | Windows path mode |
| `signal` | `AbortSignal` | `undefined` | Cancellation signal |
| `parallel` | `boolean` | `false` | Parallel walking (globlin) |
| `cache` | `boolean` | `false` | Directory caching (globlin) |

---

## Path Options

### cwd

- **Type:** `string`
- **Default:** `process.cwd()`

The current working directory for the glob operation. All relative patterns are resolved from this directory.

```typescript
// Search in a specific directory
const files = await glob('**/*.js', { cwd: '/path/to/project' })

// Results are relative to cwd
// ['src/index.js', 'lib/utils.js']
```

### root

- **Type:** `string`
- **Default:** `undefined`

Root directory for absolute patterns (patterns starting with `/`).

```typescript
// Without root: /foo.txt searches from filesystem root
await glob('/foo.txt')

// With root: /foo.txt searches from /project
await glob('/foo.txt', { root: '/project' })
// Searches for /project/foo.txt
```

---

## Pattern Options

### dot

- **Type:** `boolean`
- **Default:** `false`

Include files and directories starting with `.` (dotfiles).

```typescript
// Without dot: hidden files excluded
await glob('**/*')
// ['src/index.js', 'README.md']

// With dot: hidden files included
await glob('**/*', { dot: true })
// ['.gitignore', '.env', 'src/index.js', 'README.md']
```

**Note:** Patterns that explicitly start with `.` always match dotfiles regardless of this option:
```typescript
await glob('.*')  // Always finds dotfiles
await glob('.git/**')  // Always searches .git
```

### nobrace

- **Type:** `boolean`
- **Default:** `false`

Disable brace expansion (`{a,b}`, `{1..3}`).

```typescript
// Normal: braces expand
await glob('*.{js,ts}')
// Expands to: ['*.js', '*.ts']

// With nobrace: braces are literal
await glob('*.{js,ts}', { nobrace: true })
// Searches for files literally named "*.{js,ts}"
```

### noglobstar

- **Type:** `boolean`
- **Default:** `false`

Disable `**` matching (treat it as two `*` wildcards).

```typescript
// Normal: ** matches any depth
await glob('**/*.js')
// Matches: src/index.js, src/lib/utils.js, etc.

// With noglobstar: ** is like */*
await glob('**/*.js', { noglobstar: true })
// Only matches: */file.js (one level)
```

### noext

- **Type:** `boolean`
- **Default:** `false`

Disable extglob patterns (`+(a|b)`, `!(x)`, `*(x)`, `?(x)`, `@(x)`).

```typescript
// Normal: extglobs work
await glob('*.+(js|ts)')
// Matches: file.js, file.ts

// With noext: extglob syntax is literal
await glob('*.+(js|ts)', { noext: true })
// Searches for files literally named "*.+(js|ts)"
```

### nocase

- **Type:** `boolean`
- **Default:** Platform-dependent
  - `true` on Windows and macOS (case-insensitive filesystems)
  - `false` on Linux (case-sensitive filesystem)

Case-insensitive matching.

```typescript
// On Linux (case-sensitive by default)
await glob('*.JS')  // Only matches .JS files

// With nocase: matches regardless of case
await glob('*.JS', { nocase: true })
// Matches: file.js, file.JS, file.Js
```

### magicalBraces

- **Type:** `boolean`
- **Default:** `false`

Only expand braces if they contain magic characters or comma-separated alternatives.

```typescript
// Normal: all braces expand
await glob('{foo}')  // Expands even single items

// With magicalBraces: only magic braces expand
await glob('{foo}', { magicalBraces: true })
// Treats {foo} as literal since it has no magic

await glob('{foo,bar}', { magicalBraces: true })
// Expands because it has alternatives
```

---

## Traversal Options

### follow

- **Type:** `boolean`
- **Default:** `false`

Follow symbolic links when traversing directories.

```typescript
// Without follow: symlinks are listed but not traversed
await glob('**/*')
// ['symlink-to-dir'] - listed as file

// With follow: symlink targets are traversed
await glob('**/*', { follow: true })
// ['symlink-to-dir', 'symlink-to-dir/file.txt', ...]
```

**Warning:** Be careful with follow on directories that may contain cycles.

### maxDepth

- **Type:** `number`
- **Default:** `Infinity`

Maximum directory depth to traverse.

```typescript
// Unlimited depth
await glob('**/*.js')
// Finds: a.js, src/b.js, src/lib/c.js, ...

// Limited to 2 levels
await glob('**/*.js', { maxDepth: 2 })
// Finds: a.js, src/b.js
// Skips: src/lib/c.js (depth 3)

// Special values:
// maxDepth: 0 - Only matches in cwd itself (returns '.' if pattern matches)
// maxDepth: 1 - cwd + immediate children
// maxDepth: -1 - Returns empty array
```

### matchBase

- **Type:** `boolean`
- **Default:** `false`

If pattern has no slashes, match against the basename only (filename without directory).

```typescript
// Normal: *.js only matches at cwd
await glob('*.js')
// ['index.js'] - only in current directory

// With matchBase: *.js matches anywhere
await glob('*.js', { matchBase: true })
// ['index.js', 'src/util.js', 'lib/helper.js']
// Equivalent to: await glob('**/*.js')
```

**Note:** Cannot be used with `noglobstar: true`.

---

## Output Options

### absolute

- **Type:** `boolean`
- **Default:** `false`

Return absolute paths instead of relative paths.

```typescript
// Without absolute: relative paths
await glob('*.js', { cwd: '/project' })
// ['index.js', 'util.js']

// With absolute: absolute paths
await glob('*.js', { cwd: '/project', absolute: true })
// ['/project/index.js', '/project/util.js']
```

**Note:** Cannot be used with `withFileTypes: true`.

### dotRelative

- **Type:** `boolean`
- **Default:** `false`

Prepend `./` to relative paths.

```typescript
// Without dotRelative
await glob('*.js')
// ['index.js', 'util.js']

// With dotRelative
await glob('*.js', { dotRelative: true })
// ['./index.js', './util.js']
```

### mark

- **Type:** `boolean`
- **Default:** `false`

Append `/` to directory names.

```typescript
// Without mark
await glob('*')
// ['file.txt', 'src']

// With mark
await glob('*', { mark: true })
// ['file.txt', 'src/']
```

### nodir

- **Type:** `boolean`
- **Default:** `false`

Exclude directories from results (only return files).

```typescript
// Without nodir: directories included
await glob('*')
// ['file.txt', 'src', 'lib']

// With nodir: only files
await glob('*', { nodir: true })
// ['file.txt']
```

### posix

- **Type:** `boolean`
- **Default:** `false`

Use `/` as path separator on Windows (normalize to POSIX-style paths).

```typescript
// On Windows without posix
await glob('**\\*.js')
// ['src\\index.js']

// On Windows with posix
await glob('**/*.js', { posix: true })
// ['src/index.js']
```

### withFileTypes

- **Type:** `boolean`
- **Default:** `false`

Return PathScurry Path objects instead of strings.

```typescript
// Without withFileTypes: strings
const files = await glob('*.js')
// ['index.js', 'util.js']

// With withFileTypes: Path objects
const paths = await glob('*.js', { withFileTypes: true, stat: true })
for (const p of paths) {
  console.log(p.fullpath())    // Absolute path
  console.log(p.relative())    // Relative path
  console.log(p.isFile())      // true
  console.log(p.isDirectory()) // false
}
```

**Note:** Use with `stat: true` for accurate `isFile()`/`isDirectory()` results.

---

## Performance Options

### stat

- **Type:** `boolean`
- **Default:** `false`

Always call `lstat()` on results to populate file type information.

```typescript
// With stat: Path objects have accurate type info
const paths = await glob('*', { withFileTypes: true, stat: true })
paths[0].isFile()      // Accurate
paths[0].isDirectory() // Accurate
```

### realpath

- **Type:** `boolean`
- **Default:** `false`

Resolve symlinks to their real paths in results.

```typescript
// Without realpath: symlinks shown as-is
await glob('**/*')
// ['link-to-file'] - shows the symlink

// With realpath: shows actual file
await glob('**/*', { realpath: true })
// ['actual-file'] - resolved path
```

---

## Filtering Options

### ignore

- **Type:** `string | string[] | IgnorePattern`
- **Default:** `undefined`

Patterns to exclude from results.

```typescript
// String pattern
await glob('**/*.js', { ignore: 'node_modules/**' })

// Array of patterns
await glob('**/*.js', {
  ignore: ['node_modules/**', 'dist/**', '**/*.test.js']
})

// Custom ignore object
await glob('**/*', {
  ignore: {
    ignored: (path) => path.name.startsWith('_'),
    childrenIgnored: (path) => path.name === 'node_modules'
  }
})
```

**Ignore patterns behavior:**
- Patterns ending in `/**` also prevent traversal into that directory
- Ignore patterns are always matched with `dot: true`
- Can ignore dotfiles even when main `dot: false`

### includeChildMatches

- **Type:** `boolean`
- **Default:** `true`

When `false`, excludes children of paths that match the pattern.

```typescript
// With includeChildMatches: true (default)
await glob('**', { cwd: '/project' })
// ['src', 'src/index.js', 'src/lib', 'src/lib/util.js']

// With includeChildMatches: false
await glob('**', { cwd: '/project', includeChildMatches: false })
// ['src'] - children of matched 'src' are excluded
```

---

## Platform Options

### platform

- **Type:** `'linux' | 'darwin' | 'win32'`
- **Default:** `process.platform`

Override the platform for path handling and defaults.

```typescript
// Force Linux behavior on Windows
await glob('**/*.js', { platform: 'linux' })
```

Affects:
- Default `nocase` value
- Path separator handling
- Drive letter handling (Windows)

### windowsPathsNoEscape

- **Type:** `boolean`
- **Default:** `false`

Treat `\` as a path separator instead of an escape character (Windows mode).

```typescript
// Normal: backslash is escape
await glob('file\\*.txt')  // Searches for literal "file*.txt"

// Windows mode: backslash is path separator
await glob('src\\*.js', { windowsPathsNoEscape: true })
// Equivalent to: glob('src/*.js')
```

---

## Control Options

### signal

- **Type:** `AbortSignal`
- **Default:** `undefined`

AbortSignal to cancel the operation.

```typescript
const controller = new AbortController()

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000)

try {
  const files = await glob('**/*', { signal: controller.signal })
} catch (err) {
  if (err.name === 'AbortError') {
    console.log('Operation cancelled')
  }
}
```

---

## Globlin-Specific Options

These options are unique to globlin and not present in the original glob package.

### parallel

- **Type:** `boolean`
- **Default:** `false`

Enable parallel directory walking using multiple threads.

```typescript
// Serial (default) - faster on SSDs
await glob('**/*.js')

// Parallel - better for HDDs/network drives
await glob('**/*.js', { parallel: true })
```

**When to use `parallel: true`:**
- Spinning hard drives (HDDs)
- Network filesystems (NFS, CIFS)
- Very large directory trees (100k+ files)

**When to keep `parallel: false` (default):**
- SSDs (parallel adds overhead)
- When result order matters
- Lower memory usage

### cache

- **Type:** `boolean`
- **Default:** `false`

Enable directory caching for repeated glob operations.

```typescript
// Without cache: directories read each time
await glob('**/*.js')
await glob('**/*.ts')  // Reads directories again

// With cache: directories cached for 5 seconds
await glob('**/*.js', { cache: true })
await glob('**/*.ts', { cache: true })  // Uses cached directory listings
```

**When to use `cache: true`:**
- Running multiple glob operations
- Patterns with overlapping directories
- Glob class cache reuse

**When to keep `cache: false` (default):**
- Filesystem may change during operation
- Single glob operation
- Memory-constrained environments

---

## TypeScript Interface

```typescript
interface GlobOptions {
  // Path options
  cwd?: string
  root?: string

  // Pattern options
  dot?: boolean
  nobrace?: boolean
  noglobstar?: boolean
  noext?: boolean
  nocase?: boolean
  magicalBraces?: boolean

  // Traversal options
  follow?: boolean
  maxDepth?: number
  matchBase?: boolean

  // Output options
  absolute?: boolean
  dotRelative?: boolean
  mark?: boolean
  nodir?: boolean
  posix?: boolean
  withFileTypes?: boolean

  // Performance options
  stat?: boolean
  realpath?: boolean

  // Filtering options
  ignore?: string | string[] | IgnorePattern
  includeChildMatches?: boolean

  // Platform options
  platform?: 'linux' | 'darwin' | 'win32'
  windowsPathsNoEscape?: boolean

  // Control options
  signal?: AbortSignal

  // Globlin-specific
  parallel?: boolean
  cache?: boolean
}

interface IgnorePattern {
  ignored?: (path: Path) => boolean
  childrenIgnored?: (path: Path) => boolean
}
```

---

## Option Conflicts

Some options cannot be used together:

| Combination | Error |
|------------|-------|
| `withFileTypes: true` + `absolute: true` | "cannot set absolute and withFileTypes:true" |
| `matchBase: true` + `noglobstar: true` | "base matching requires globstar" |

---

## See Also

- [glob](./glob.md) - Main glob function
- [Glob class](./Glob-class.md) - Object-oriented interface
- [utilities](./utilities.md) - Utility functions
