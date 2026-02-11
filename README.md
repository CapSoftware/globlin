<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="www/public/globlin-logo.svg">
    <source media="(prefers-color-scheme: light)" srcset="www/public/globlin-logo-light.svg">
    <img src="www/public/globlin-logo-light.svg" alt="globlin" height="80" />
  </picture>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/globlin"><img src="https://img.shields.io/npm/v/globlin.svg" alt="npm version" /></a>
  <a href="https://github.com/capsoftware/globlin/actions/workflows/test.yml"><img src="https://github.com/capsoftware/globlin/actions/workflows/test.yml/badge.svg" alt="CI" /></a>
  <a href="https://codecov.io/gh/capsoftware/globlin"><img src="https://codecov.io/gh/capsoftware/globlin/graph/badge.svg" alt="codecov" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
</p>

**A high-performance glob pattern matcher for Node.js, built in Rust.**

Globlin is a drop-in replacement for [glob](https://github.com/isaacs/node-glob) v13 that delivers **2-3x faster** performance on large directories while maintaining 100% API compatibility.

From the team behind [Cap](https://cap.so).

## Features

- **Fast**: 2-3x faster than glob v13 on large directories (100k+ files)
- **Drop-in replacement**: Same API, same options, same behavior
- **Cross-platform**: Linux, macOS, Windows (x64 and ARM64)
- **Zero config**: Just replace your import
- **Full pattern support**: `*`, `**`, `?`, `[abc]`, `{a,b}`, extglobs, POSIX classes
- **TypeScript first**: Complete type definitions included

## Installation

```bash
npm install globlin
```

## Quick Start

```typescript
import { glob, globSync } from 'globlin'

// Async
const files = await glob('**/*.js')

// Sync
const files = globSync('**/*.ts')

// With options
const files = await glob('src/**/*.{js,ts}', {
  ignore: ['node_modules/**'],
  dot: true
})
```

## Migration from glob

Globlin is designed as a drop-in replacement. Just change your import:

```diff
- import { glob, globSync } from 'glob'
+ import { glob, globSync } from 'globlin'
```

All APIs, options, and behaviors match glob v13.

## API

### Functions

```typescript
// Async - returns Promise<string[]>
glob(pattern: string | string[], options?: GlobOptions): Promise<string[]>

// Sync - returns string[]
globSync(pattern: string | string[], options?: GlobOptions): string[]

// Streaming - returns Minipass stream
globStream(pattern: string | string[], options?: GlobOptions): Minipass<string>
globStreamSync(pattern: string | string[], options?: GlobOptions): Minipass<string>

// Iterators - returns generators
globIterate(pattern: string | string[], options?: GlobOptions): AsyncGenerator<string>
globIterateSync(pattern: string | string[], options?: GlobOptions): Generator<string>

// Utilities
hasMagic(pattern: string | string[], options?: GlobOptions): boolean
escape(pattern: string, options?: GlobOptions): string
unescape(pattern: string, options?: GlobOptions): string
```

### Glob Class

```typescript
const g = new Glob('**/*.js', { cwd: '/project', dot: true })

// Methods
await g.walk()        // Promise<string[]>
g.walkSync()          // string[]
g.stream()            // Minipass<string>
g.streamSync()        // Minipass<string>
g.iterate()           // AsyncGenerator<string>
g.iterateSync()       // Generator<string>

// Iteration
for await (const file of g) { }
for (const file of g) { }

// Cache reuse (pass Glob as options)
const g2 = new Glob('**/*.ts', g)  // Inherits options from g
```

### Options

All glob v13 options are supported:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string` | `process.cwd()` | Current working directory |
| `dot` | `boolean` | `false` | Include dotfiles |
| `ignore` | `string \| string[]` | - | Patterns to ignore |
| `follow` | `boolean` | `false` | Follow symlinks in `**` |
| `nodir` | `boolean` | `false` | Exclude directories |
| `absolute` | `boolean` | `false` | Return absolute paths |
| `nocase` | `boolean` | OS-based | Case-insensitive matching |
| `maxDepth` | `number` | - | Maximum directory depth |
| `mark` | `boolean` | `false` | Append `/` to directories |
| `dotRelative` | `boolean` | `false` | Prepend `./` to relative paths |
| `withFileTypes` | `boolean` | `false` | Return `Path` objects |
| `signal` | `AbortSignal` | - | Abort signal for cancellation |

See the [full options reference](docs/api/options.md) for all 22 options.

### Pattern Syntax

| Pattern | Description | Example |
|---------|-------------|---------|
| `*` | Match any characters except `/` | `*.js` matches `foo.js` |
| `**` | Match any path segments | `**/*.js` matches `a/b/c.js` |
| `?` | Match single character | `file?.js` matches `file1.js` |
| `[abc]` | Character class | `[abc].js` matches `a.js` |
| `[a-z]` | Character range | `[a-z].js` matches `x.js` |
| `{a,b}` | Alternatives | `{a,b}.js` matches `a.js`, `b.js` |
| `{1..3}` | Numeric range | `file{1..3}.js` matches `file1.js`, `file2.js`, `file3.js` |
| `+(a\|b)` | One or more | `+(foo\|bar).js` matches `foofoo.js` |
| `*(a\|b)` | Zero or more | `*(foo\|bar).js` matches `foo.js` |
| `?(a\|b)` | Zero or one | `?(foo).js` matches `.js`, `foo.js` |
| `@(a\|b)` | Exactly one | `@(foo\|bar).js` matches `foo.js` |
| `!(a\|b)` | Negation | `!(foo).js` matches `bar.js` |

## Performance

Benchmarks comparing globlin vs glob v13 vs fast-glob (Apple M1 Pro, SSD):

### Large Directory (100,000 files)

| Pattern | glob | fast-glob | Globlin | vs glob | vs fast-glob |
|---------|------|-----------|---------|---------|--------------|
| `**/*.js` | 318ms | 132ms | 150ms | **2.1x** | 0.9x |
| `**/*` | 256ms | 115ms | 121ms | **2.1x** | 1.0x |
| `**/*.{js,ts}` | 276ms | 115ms | 113ms | **2.5x** | **1.0x** |
| `*.js` | 30ms | 12ms | 9ms | **3.4x** | **1.4x** |
| `level0/**/*.js` | 231ms | 126ms | 134ms | **1.7x** | 0.9x |
| Static patterns | 0.05ms | 0.02ms | 0.01ms | **5.6x** | **2.2x** |

### Summary by Fixture Size

| Fixture | Files | Avg vs glob | Avg vs fast-glob |
|---------|-------|-------------|------------------|
| Small | 303 | **3.2x** | **1.8x** |
| Medium | 20,003 | **2.3x** | **1.3x** |
| Large | 100,000 | **3.0x** | **1.3x** |

### Summary by Pattern Type

| Pattern Type | vs glob | vs fast-glob |
|--------------|---------|--------------|
| Static (`package.json`) | **7.5x** | **3.2x** |
| Simple (`*.js`) | **2.8x** | **1.5x** |
| Recursive (`**/*.js`) | **1.7x** | 1.0x |
| Brace Expansion (`**/*.{js,ts}`) | **2.0x** | **1.1x** |

**Overall: 2.8x faster than glob, competitive with fast-glob.**

### Performance Characteristics

Glob operations are I/O-bound (~85% of execution time is spent in `readdir` syscalls). Globlin optimizes both I/O and CPU:

- **I/O reduction**: Depth-limited walking, prefix-based traversal, directory pruning
- **CPU optimization**: Rust pattern matching, fast-path extensions, compiled patterns
- **Static patterns**: Near-instant lookups without directory traversal

### When to Use Globlin

- **Large directories** (1000+ files): 2-3x faster
- **Build tools**: Webpack, Rollup, esbuild plugins
- **Test runners**: Jest, Vitest, Mocha file discovery
- **Linters**: ESLint, Prettier file matching
- **Monorepos**: Multiple package traversal

## Compatibility

### Supported APIs

- All 6 core functions (`glob`, `globSync`, `globStream`, `globStreamSync`, `globIterate`, `globIterateSync`)
- Full `Glob` class with 8 methods and iterator protocols
- All 3 utility functions (`hasMagic`, `escape`, `unescape`)
- All 22 options (except `fs` and `scurry` which are Node.js-specific)
- Re-exports: `Minimatch`, `minimatch`, `PathScurry`, `Path`, `Minipass`

### Supported Platforms

| Platform | Architecture | Status |
|----------|--------------|--------|
| Linux | x64 | Supported |
| Linux | ARM64 | Supported |
| Linux (musl) | x64, ARM64 | Supported |
| macOS | x64 | Supported |
| macOS | ARM64 (Apple Silicon) | Supported |
| Windows | x64 | Supported |
| Windows | ARM64 | Supported |

### Node.js Versions

- Node.js 20.x: Supported
- Node.js 22.x: Supported

## Documentation

- [Migration Guide](docs/guides/migration-from-glob.md)
- [Performance Tuning](docs/guides/performance-tuning.md)
- [API Reference](docs/api/glob.md)
- [Options Reference](docs/api/options.md)

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

### Development

```bash
# Install dependencies
npm install

# Build the native module
npm run build

# Run tests
npm test

# Run benchmarks
npm run bench
```

### Running Benchmarks

```bash
# Quick benchmark (small fixture)
npm run bench:small

# Standard benchmark (medium fixture, 20k files)
npm run bench:medium

# Full benchmark (large fixture, 100k files)
npm run bench:large
```

## Credits

- [glob](https://github.com/isaacs/node-glob) - The original glob implementation that this project aims to replace
- [minimatch](https://github.com/isaacs/minimatch) - Pattern matching library
- [path-scurry](https://github.com/isaacs/path-scurry) - Path resolution library
- [NAPI-RS](https://napi.rs/) - Rust bindings for Node.js

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Globlin** is built by [Anomaly](https://anomaly.co), the team behind [Cap](https://cap.so).
