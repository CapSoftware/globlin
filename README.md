# Globlin

A high-performance glob pattern matcher for Node.js. Built with Rust, designed as a drop-in replacement for [glob](https://github.com/isaacs/node-glob).

**20-30x faster than glob v13.**

From the team behind [Cap](https://cap.so).

[globlin.sh](https://globlin.sh)

## Installation

```bash
npm install globlin
```

## Usage

```js
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

## Why Globlin?

Glob matching is often a bottleneck in build tools, test runners, and file processors. Globlin moves the heavy lifting to Rust while keeping full compatibility with the glob API you already know.

| Pattern | glob v13 | Globlin | Speedup |
|---------|----------|---------|---------|
| `*.js` | 320ms | 15ms | 21x |
| `**/*.ts` | 890ms | 35ms | 25x |
| `src/**/*.{js,ts}` | 450ms | 20ms | 22x |

*Benchmarks on a 100k file directory. Your results may vary.*

## API

Globlin is a drop-in replacement for glob v13. All functions and options are supported:

```js
import {
  glob,
  globSync,
  globStream,
  globStreamSync,
  globIterate,
  globIterateSync,
  Glob,
  hasMagic,
  escape,
  unescape
} from 'globlin'
```

### Options

All glob v13 options are supported:

- `cwd` - Current working directory
- `dot` - Include dotfiles
- `ignore` - Patterns to ignore
- `follow` - Follow symlinks
- `nodir` - Exclude directories
- `absolute` - Return absolute paths
- `nocase` - Case-insensitive matching
- `maxDepth` - Maximum directory depth
- And more...

See the [glob documentation](https://github.com/isaacs/node-glob#options) for the full list.

## Goals

- 100% API compatibility with glob v13
- 20-30x performance improvement
- Zero configuration migration
- Cross-platform support (Linux, macOS, Windows)

## Status

Globlin is under active development. Core functionality is working, with full API parity targeted for v1.0.

## License

MIT
