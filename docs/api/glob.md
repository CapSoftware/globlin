# glob()

Asynchronous glob function that returns a Promise resolving to an array of matched paths.

## Signature

```typescript
// Standard signature (returns strings)
function glob(
  pattern: string | string[],
  options?: GlobOptions
): Promise<string[]>

// With withFileTypes: true (returns Path objects)
function glob(
  pattern: string | string[],
  options: GlobOptionsWithFileTypesTrue
): Promise<Path[]>
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `string \| string[]` | A glob pattern or array of patterns to match |
| `options` | `GlobOptions` | Optional configuration options |

## Returns

- `Promise<string[]>` - Array of matching file paths (default)
- `Promise<Path[]>` - Array of PathScurry Path objects (when `withFileTypes: true`)

## Examples

### Basic Usage

```typescript
import { glob } from 'globlin'

// Single pattern
const jsFiles = await glob('**/*.js')
console.log(jsFiles) // ['src/index.js', 'lib/utils.js', ...]

// Multiple patterns
const sourceFiles = await glob(['src/**/*.ts', 'lib/**/*.js'])

// With options
const files = await glob('**/*.txt', {
  cwd: '/path/to/project',
  ignore: ['node_modules/**']
})
```

### Using withFileTypes

```typescript
import { glob } from 'globlin'

// Returns Path objects instead of strings
const paths = await glob('**/*', { withFileTypes: true, stat: true })

for (const p of paths) {
  console.log(p.fullpath())     // '/absolute/path/to/file'
  console.log(p.relative())     // 'relative/path/to/file'
  console.log(p.isFile())       // true/false
  console.log(p.isDirectory())  // true/false
}
```

### AbortSignal Support

```typescript
import { glob } from 'globlin'

const controller = new AbortController()

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000)

try {
  const files = await glob('**/*', { signal: controller.signal })
} catch (err) {
  if (err.name === 'AbortError') {
    console.log('Operation was cancelled')
  }
}
```

### Multiple Pattern Types

```typescript
import { glob } from 'globlin'

// Brace expansion
const assets = await glob('assets/**/*.{png,jpg,gif}')

// Character classes
const numbered = await glob('file[0-9].txt')

// Extglob patterns
const notTests = await glob('**/*.!(test).js')

// Negation with ignore
const files = await glob('**/*.js', {
  ignore: ['**/*.test.js', '**/*.spec.js']
})
```

### Globlin-Specific Options

```typescript
import { glob } from 'globlin'

// Enable parallel directory walking (faster on HDDs/network drives)
const files = await glob('**/*.js', { parallel: true })

// Enable directory caching (faster for repeated operations)
const files1 = await glob('**/*.js', { cache: true })
const files2 = await glob('**/*.ts', { cache: true }) // Uses cached directory listings
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

- Patterns without magic characters are resolved as literal paths
- Empty patterns or patterns that don't match return an empty array
- The function is fully compatible with glob v13's `glob()` function
- Use `globSync()` for synchronous operation
- Use `globStream()` for streaming results to reduce memory usage

## Error Handling

```typescript
try {
  const files = await glob('**/*.js', {
    cwd: '/nonexistent/path'
  })
  // Returns empty array (doesn't throw)
} catch (err) {
  // Errors are thrown for invalid options combinations
}
```

Errors are thrown for:
- `withFileTypes` + `absolute` cannot both be set
- `matchBase` + `noglobstar` cannot both be set
- Invalid pattern types (null, undefined)
- AbortSignal aborted before or during operation

## Performance Tips

1. **Use specific patterns**: `src/**/*.js` is faster than `**/*.js`
2. **Limit depth**: Use `maxDepth` when you know the maximum nesting
3. **Use ignore patterns**: Exclude `node_modules/**` and other large directories
4. **Enable parallel**: On HDDs or network drives, `parallel: true` can help
5. **Enable caching**: When running multiple globs, `cache: true` reuses directory listings

## See Also

- [globSync](./globSync.md) - Synchronous version
- [globStream](./globStream.md) - Streaming version
- [globIterate](./globIterate.md) - Iterator version
- [Glob class](./Glob-class.md) - Object-oriented interface
- [Options](./options.md) - Full options reference
