# Utility Functions

Globlin exports several utility functions for working with glob patterns.

## hasMagic()

Check if a pattern contains glob magic characters (unescaped special characters).

### Signature

```typescript
function hasMagic(
  pattern: string | string[],
  options?: GlobOptions
): boolean
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `string \| string[]` | Pattern(s) to check |
| `options` | `GlobOptions` | Optional options (affects interpretation) |

### Returns

`boolean` - `true` if the pattern contains unescaped magic characters

### Examples

```typescript
import { hasMagic } from 'globlin'

// Patterns with magic characters
hasMagic('*.js')           // true - * is magic
hasMagic('**/*.ts')        // true - ** and * are magic
hasMagic('file?.txt')      // true - ? is magic
hasMagic('[abc].txt')      // true - [] is magic
hasMagic('{a,b}.js')       // true - {} is magic
hasMagic('+(a|b)')         // true - +() is magic (extglob)

// Patterns without magic
hasMagic('file.txt')       // false - literal
hasMagic('src/index.js')   // false - literal path
hasMagic('README.md')      // false - literal

// Escaped magic characters (not magic)
hasMagic('file\\*.txt')    // false - * is escaped
hasMagic('\\[abc\\].txt')  // false - [] is escaped

// Array of patterns - true if ANY pattern has magic
hasMagic(['file.txt', '*.js'])  // true

// With noext option - extglobs not considered magic
hasMagic('+(a|b)', { noext: true })  // false
```

### Options That Affect hasMagic

| Option | Effect |
|--------|--------|
| `noext` | When `true`, extglob patterns are not considered magic |
| `windowsPathsNoEscape` | When `true`, backslash is not an escape character |

---

## escape()

Escape magic glob characters in a string so they match literally.

### Signature

```typescript
function escape(
  pattern: string,
  options?: GlobOptions
): string
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `string` | String to escape |
| `options` | `GlobOptions` | Optional options |

### Returns

`string` - Escaped pattern that will match the literal string

### Characters Escaped

- `*` - Zero or more characters
- `?` - Single character
- `[` and `]` - Character class
- `(` and `)` - Extglob grouping

### Examples

```typescript
import { escape } from 'globlin'

// Basic escaping
escape('file*.txt')          // 'file\\*.txt'
escape('file?.txt')          // 'file\\?.txt'
escape('dir[1]/file.js')     // 'dir\\[1\\]/file.js'
escape('+(a|b)')             // '\\+\\(a\\|b\\)'

// Path with multiple magic characters
escape('src/**/*.ts')        // 'src/\\*\\*/\\*.ts'

// Windows mode - uses [] wrapping instead of backslash
escape('file*.txt', { windowsPathsNoEscape: true })
// Result: 'file[*].txt'

escape('file?.txt', { windowsPathsNoEscape: true })
// Result: 'file[?].txt'
```

### Notes

- **Cannot escape path separators** (`/` or `\`) - they remain unchanged
- Braces `{}` are NOT escaped by default (use for literal braces in paths)
- Use `windowsPathsNoEscape: true` on Windows where backslash is a path separator

---

## unescape()

Remove escape characters from a pattern, restoring the original string.

### Signature

```typescript
function unescape(
  pattern: string,
  options?: GlobOptions
): string
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `string` | Escaped pattern to unescape |
| `options` | `GlobOptions` | Optional options |

### Returns

`string` - Unescaped pattern

### Examples

```typescript
import { unescape } from 'globlin'

// Basic unescaping
unescape('file\\*.txt')       // 'file*.txt'
unescape('file\\?.txt')       // 'file?.txt'
unescape('dir\\[1\\]/file.js') // 'dir[1]/file.js'

// Windows mode - removes [] wrapping
unescape('file[*].txt', { windowsPathsNoEscape: true })
// Result: 'file*.txt'

// Roundtrip
const original = 'file*.txt'
const escaped = escape(original)   // 'file\\*.txt'
const restored = unescape(escaped) // 'file*.txt'
original === restored              // true
```

---

## Re-exports for Compatibility

For full compatibility with glob v13, globlin re-exports several modules:

### Minimatch

```typescript
export { Minimatch, minimatch } from 'minimatch'
```

The Minimatch class allows advanced pattern matching:

```typescript
import { Minimatch } from 'globlin'

const mm = new Minimatch('**/*.js', { dot: true })
mm.match('src/index.js')     // true
mm.match('.hidden/test.js')  // true
mm.match('file.ts')          // false
```

### PathScurry

```typescript
export { PathScurry, Path } from 'path-scurry'
```

PathScurry provides cached filesystem traversal:

```typescript
import { PathScurry, Path } from 'globlin'

const scurry = new PathScurry('/project')
const entry = scurry.cwd.resolve('src/index.js')
console.log(entry.fullpath())
```

### Minipass

```typescript
export { Minipass } from 'minipass'
```

Minipass is used for streaming APIs:

```typescript
import { Minipass, globStream } from 'globlin'

const stream: Minipass<string, string> = globStream('**/*.js')
```

---

## Usage Patterns

### Safely Globbing User Input

```typescript
import { escape, glob } from 'globlin'

async function findFile(userInput: string, directory: string) {
  // Escape user input to prevent glob injection
  const safeName = escape(userInput)
  return glob(`**/${safeName}`, { cwd: directory })
}

// User searches for "file[1].txt"
await findFile('file[1].txt', '/docs')
// Searches for literal "file[1].txt", not character class
```

### Checking If Pattern Needs Expansion

```typescript
import { hasMagic, glob } from 'globlin'
import { existsSync } from 'fs'

async function resolvePattern(pattern: string) {
  if (hasMagic(pattern)) {
    // Pattern has wildcards - need to glob
    return glob(pattern)
  } else {
    // Literal path - just check if it exists
    return existsSync(pattern) ? [pattern] : []
  }
}
```

### Building Patterns Safely

```typescript
import { escape } from 'globlin'

function findInDirectory(dir: string, extension: string) {
  // Escape directory name in case it contains special chars
  const safeDir = escape(dir)
  // Extension is safe (simple string)
  return `${safeDir}/**/*.${extension}`
}

// Directory might have special chars
const pattern = findInDirectory('src [v2]', 'ts')
// Result: 'src \\[v2\\]/**/*.ts'
```

---

## TypeScript Types

```typescript
// hasMagic
function hasMagic(
  pattern: string | string[],
  options?: GlobOptions
): boolean

// escape
function escape(
  pattern: string,
  options?: GlobOptions
): string

// unescape
function unescape(
  pattern: string,
  options?: GlobOptions
): string

// Re-exports
export { Minimatch, minimatch } from 'minimatch'
export { PathScurry, Path } from 'path-scurry'
export { Minipass } from 'minipass'
```

## See Also

- [Options](./options.md) - Options that affect utility functions
- [glob](./glob.md) - Main glob function
- [Glob class](./Glob-class.md) - Object-oriented interface
