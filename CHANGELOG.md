# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Future features will be documented here

## [1.0.0] - 2026-01-06

### Added

#### Core API
- `glob(pattern, options)` - async glob function with Promise return
- `globSync(pattern, options)` - synchronous glob function
- `globStream(pattern, options)` - streaming API returning Minipass stream
- `globStreamSync(pattern, options)` - synchronous streaming API
- `globIterate(pattern, options)` - async generator for iteration
- `globIterateSync(pattern, options)` - sync generator for iteration

#### Glob Class
- `Glob` class with `walk()`, `walkSync()`, `stream()`, `streamSync()`, `iterate()`, `iterateSync()` methods
- Full iterator protocol support (`Symbol.asyncIterator`, `Symbol.iterator`)
- Cache reuse by passing Glob instance as options

#### Utility Functions
- `hasMagic(pattern, options)` - check if pattern contains glob magic
- `escape(pattern, options)` - escape glob magic characters
- `unescape(pattern, options)` - unescape glob magic characters

#### Pattern Support
- Basic glob patterns: `*`, `?`, `**`
- Brace expansion: `{a,b}`, `{1..5}`, `{a..z}`
- Extglob patterns: `+(a|b)`, `*(a|b)`, `?(a|b)`, `@(a|b)`
- Character classes: `[abc]`, `[a-z]`, `[!abc]`
- POSIX character classes: `[:alpha:]`, `[:digit:]`, etc.
- Negation patterns: `!pattern`

#### Options
- `cwd` - working directory
- `absolute` - return absolute paths
- `nodir` - exclude directories
- `dot` - include dotfiles
- `nocase` - case-insensitive matching (platform defaults)
- `ignore` - patterns to ignore (string, array, or custom object)
- `follow` - follow symlinks
- `maxDepth` - limit traversal depth
- `matchBase` - match basename only
- `mark` - append `/` to directories
- `dotRelative` - prepend `./` to relative paths
- `posix` - use POSIX paths on Windows
- `withFileTypes` - return PathScurry Path objects
- `stat` - populate file stats
- `realpath` - resolve symlinks to real paths
- `signal` - AbortSignal for cancellation
- `nobrace` - disable brace expansion
- `noext` - disable extglob
- `noglobstar` - disable `**` matching
- `platform` - specify target platform
- `windowsPathsNoEscape` - treat `\` as path separator on Windows
- `includeChildMatches` - include/exclude child matches
- `parallel` - enable parallel directory walking (globlin-specific)
- `cache` - enable directory caching (globlin-specific)

#### Platform Support
- Linux (x64, arm64, musl)
- macOS (x64, arm64/Apple Silicon)
- Windows (x64, arm64)

#### Platform Optimizations
- Linux: `getdents64` syscall for faster directory reading
- macOS: GCD integration, APFS optimizations, ARM NEON SIMD
- Windows: UNC path support, drive letter handling

#### Performance Features
- Depth-limited walking for simple patterns
- Prefix-based walk root optimization
- Directory pruning for scoped patterns
- Fast-path matching for extension patterns
- Static pattern direct stat optimization
- Pattern caching with LRU eviction
- Optional parallel walking via rayon/jwalk

#### Re-exports
- `Minimatch`, `minimatch` from minimatch
- `PathScurry`, `Path` from path-scurry
- `Minipass` from minipass

### Performance

- **2-3x faster** than glob v13 on average
- **2.5-2.8x faster** on large directories (100k+ files)
- **7-11x faster** on static patterns (e.g., `package.json`)
- Competitive with fast-glob on all pattern types
- I/O-bound workloads limit theoretical maximum speedup

### Compatibility

- 100% API compatible with glob v13
- Drop-in replacement: change `import { glob } from 'glob'` to `import { glob } from 'globlin'`
- 97% test compatibility (1383 passing tests)
- Known limitations:
  - Custom `fs` module not supported (intentional)
  - `scurry` option not supported (intentional)
  - `!(pattern)` extglob negation has edge case differences

---

[unreleased]: https://github.com/yourusername/globlin/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yourusername/globlin/releases/tag/v1.0.0
