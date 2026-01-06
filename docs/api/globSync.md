# globSync()

Synchronous glob function that returns an array of matched paths.

## Signature

```typescript
// Standard signature (returns strings)
function globSync(
  pattern: string | string[],
  options?: GlobOptions
): string[]

// With withFileTypes: true (returns Path objects)
function globSync(
  pattern: string | string[],
  options: GlobOptionsWithFileTypesTrue
): Path[]
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `string \| string[]` | A glob pattern or array of patterns to match |
| `options` | `GlobOptions` | Optional configuration options |

## Returns

- `string[]` - Array of matching file paths (default)
- `Path[]` - Array of PathScurry Path objects (when `withFileTypes: true`)

## Examples

### Basic Usage

```typescript
import { globSync } from 'globlin'

// Single pattern
const jsFiles = globSync('**/*.js')
console.log(jsFiles) // ['src/index.js', 'lib/utils.js', ...]

// Multiple patterns
const sourceFiles = globSync(['src/**/*.ts', 'lib/**/*.js'])

// With options
const files = globSync('**/*.txt', {
  cwd: '/path/to/project',
  ignore: ['node_modules/**']
})
```

### Using withFileTypes

```typescript
import { globSync } from 'globlin'

// Returns Path objects instead of strings
const paths = globSync('**/*', { withFileTypes: true, stat: true })

for (const p of paths) {
  console.log(p.fullpath())     // '/absolute/path/to/file'
  console.log(p.relative())     // 'relative/path/to/file'
  console.log(p.isFile())       // true/false
  console.log(p.isDirectory())  // true/false
}
```

### Common Pattern Examples

```typescript
import { globSync } from 'globlin'

// Find all TypeScript files
const tsFiles = globSync('**/*.ts', { ignore: ['**/*.d.ts'] })

// Find all files in specific directories
const configs = globSync('{src,lib,test}/**/*.config.js')

// Find files with specific extensions
const images = globSync('assets/**/*.{png,jpg,gif,svg}')

// Case-insensitive matching
const readmes = globSync('**/readme.md', { nocase: true })

// Include dotfiles
const allFiles = globSync('**/*', { dot: true })

// Get absolute paths
const absPaths = globSync('**/*.js', { absolute: true })
```

### Performance Optimization

```typescript
import { globSync } from 'globlin'

// Limit search depth for faster results
const shallow = globSync('*/*.js', { maxDepth: 2 })

// Exclude large directories
const files = globSync('**/*.js', {
  ignore: ['node_modules/**', 'dist/**', '.git/**']
})

// Use parallel walking for HDDs
const files = globSync('**/*.js', { parallel: true })
```

## TypeScript Types

```typescript
interface GlobOptions {
  cwd?: string
  root?: string
  dot?: boolean
  nobrace?: boolean
  noglobstar?: boolean
  noext?: boolean
  nocase?: boolean
  magicalBraces?: boolean
  follow?: boolean
  maxDepth?: number
  matchBase?: boolean
  absolute?: boolean
  dotRelative?: boolean
  mark?: boolean
  nodir?: boolean
  posix?: boolean
  withFileTypes?: boolean
  stat?: boolean
  realpath?: boolean
  ignore?: string | string[] | IgnorePattern
  includeChildMatches?: boolean
  platform?: 'linux' | 'darwin' | 'win32'
  windowsPathsNoEscape?: boolean
  signal?: AbortSignal
  parallel?: boolean  // Globlin-specific
  cache?: boolean     // Globlin-specific
}

interface GlobOptionsWithFileTypesTrue extends GlobOptions {
  withFileTypes: true
}
```

## Notes

- **Blocks the event loop** until all results are collected
- For large directories, prefer `glob()` or `globStream()` to avoid blocking
- Identical behavior to `glob()` but synchronous
- Supports AbortSignal checking before execution starts
- The function is fully compatible with glob v13's `globSync()` function

## When to Use globSync vs glob

| Use Case | Recommended Function |
|----------|---------------------|
| CLI scripts | `globSync` |
| Build tools (synchronous) | `globSync` |
| Small directory trees | `globSync` |
| Web servers | `glob` |
| Large directories | `glob` or `globStream` |
| Long-running processes | `glob` |

## Error Handling

```typescript
try {
  const files = globSync('**/*.js', {
    cwd: '/nonexistent/path'
  })
  // Returns empty array (doesn't throw)
} catch (err) {
  // Errors are thrown for invalid options
}
```

Errors are thrown for:
- `withFileTypes` + `absolute` cannot both be set
- `matchBase` + `noglobstar` cannot both be set
- Invalid pattern types (null, undefined)
- AbortSignal already aborted

## See Also

- [glob](./glob.md) - Asynchronous version
- [globStreamSync](./globStream.md) - Synchronous streaming version
- [globIterateSync](./globIterate.md) - Synchronous iterator version
- [Glob class](./Glob-class.md) - Object-oriented interface
- [Options](./options.md) - Full options reference
