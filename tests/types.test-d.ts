/**
 * Type tests for globlin
 *
 * This file validates TypeScript type definitions using tsd.
 * Run with: npx tsd
 */

import { expectType, expectError, expectAssignable } from 'tsd'
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
  unescape,
  GlobOptions,
  IgnorePattern,
  Path,
  PathScurry,
  Minimatch,
  minimatch,
  Minipass,
} from '../js/index'

// ============================================================================
// Basic glob() function tests
// ============================================================================

// Default: returns Promise<string[]>
expectType<Promise<string[]>>(glob('*.js'))
expectType<Promise<string[]>>(glob(['*.js', '*.ts']))
expectType<Promise<string[]>>(glob('*.js', {}))
expectType<Promise<string[]>>(glob('*.js', { cwd: '/path' }))

// withFileTypes: false returns Promise<string[]>
expectType<Promise<string[]>>(glob('*.js', { withFileTypes: false }))
expectType<Promise<string[]>>(glob('*.js', { withFileTypes: undefined }))

// withFileTypes: true returns Promise<Path[]>
expectType<Promise<Path[]>>(glob('*.js', { withFileTypes: true }))

// ============================================================================
// Basic globSync() function tests
// ============================================================================

// Default: returns string[]
expectType<string[]>(globSync('*.js'))
expectType<string[]>(globSync(['*.js', '*.ts']))
expectType<string[]>(globSync('*.js', {}))
expectType<string[]>(globSync('*.js', { cwd: '/path' }))

// withFileTypes: false returns string[]
expectType<string[]>(globSync('*.js', { withFileTypes: false }))
expectType<string[]>(globSync('*.js', { withFileTypes: undefined }))

// withFileTypes: true returns Path[]
expectType<Path[]>(globSync('*.js', { withFileTypes: true }))

// ============================================================================
// Streaming API tests
// ============================================================================

// globStream returns Minipass<string, string>
expectType<Minipass<string, string>>(globStream('*.js'))
expectType<Minipass<string, string>>(globStream('*.js', {}))
expectType<Minipass<string, string>>(globStream('*.js', { dot: true }))

// globStreamSync returns Minipass<string, string>
expectType<Minipass<string, string>>(globStreamSync('*.js'))
expectType<Minipass<string, string>>(globStreamSync('*.js', {}))

// ============================================================================
// Iterator API tests
// ============================================================================

// globIterate returns AsyncGenerator<string>
expectType<AsyncGenerator<string, void, void>>(globIterate('*.js'))
expectType<AsyncGenerator<string, void, void>>(globIterate('*.js', {}))

// globIterateSync returns Generator<string>
expectType<Generator<string, void, void>>(globIterateSync('*.js'))
expectType<Generator<string, void, void>>(globIterateSync('*.js', {}))

// ============================================================================
// Glob class tests
// ============================================================================

const g = new Glob('*.js')
expectType<string[]>(g.pattern)
expectType<GlobOptions>(g.options)

// Methods
expectType<Promise<string[]>>(g.walk())
expectType<string[]>(g.walkSync())
expectType<Minipass<string, string>>(g.stream())
expectType<Minipass<string, string>>(g.streamSync())
expectType<AsyncGenerator<string, void, void>>(g.iterate())
expectType<Generator<string, void, void>>(g.iterateSync())

// Glob class with options
const g2 = new Glob(['*.js', '*.ts'], { cwd: '/path', dot: true })
expectType<string[]>(g2.pattern)

// Glob class accepts another Glob as options (cache reuse)
const g3 = new Glob('*.md', g2)
expectType<string[]>(g3.pattern)

// ============================================================================
// Utility function tests
// ============================================================================

// hasMagic
expectType<boolean>(hasMagic('*.js'))
expectType<boolean>(hasMagic(['*.js', 'foo']))
expectType<boolean>(hasMagic('*.js', {}))
expectType<boolean>(hasMagic('*.js', { noext: true }))

// escape
expectType<string>(escape('foo*'))
expectType<string>(escape('foo*', {}))
expectType<string>(escape('foo*', { windowsPathsNoEscape: true }))

// unescape
expectType<string>(unescape('foo\\*'))
expectType<string>(unescape('foo\\*', {}))
expectType<string>(unescape('foo\\*', { windowsPathsNoEscape: true }))

// ============================================================================
// GlobOptions tests
// ============================================================================

// All standard options
const opts: GlobOptions = {
  // Path options
  cwd: '/path',
  root: '/root',

  // Pattern options
  dot: true,
  nobrace: false,
  noglobstar: false,
  noext: false,
  nocase: true,
  magicalBraces: false,

  // Traversal options
  follow: true,
  maxDepth: 5,
  matchBase: false,

  // Output options
  absolute: true,
  dotRelative: false,
  mark: true,
  nodir: false,
  posix: true,
  withFileTypes: false,

  // Performance options
  stat: false,
  realpath: false,

  // Filtering options
  ignore: ['node_modules/**'],
  includeChildMatches: true,

  // Platform options
  platform: 'darwin',
  windowsPathsNoEscape: false,

  // Control options
  signal: new AbortController().signal,

  // Globlin-specific options
  parallel: false,
  cache: true,
  useNativeIO: false,
  useGcd: false,
}

// ignore can be a string
const opts2: GlobOptions = { ignore: 'node_modules/**' }

// ignore can be an array
const opts3: GlobOptions = { ignore: ['node_modules/**', 'dist/**'] }

// ignore can be an IgnorePattern object
const customIgnore: IgnorePattern = {
  ignored: (path: Path) => path.name.startsWith('.'),
  childrenIgnored: (path: Path) => path.name === 'node_modules',
}
const opts4: GlobOptions = { ignore: customIgnore }

// ignore with only ignored method
const partialIgnore: IgnorePattern = {
  ignored: (path: Path) => false,
}
const opts5: GlobOptions = { ignore: partialIgnore }

// ignore with only childrenIgnored method
const partialIgnore2: IgnorePattern = {
  childrenIgnored: (path: Path) => false,
}
const opts6: GlobOptions = { ignore: partialIgnore2 }

// ============================================================================
// Re-export tests
// ============================================================================

// Path and PathScurry from path-scurry
expectType<typeof Path>(Path)
expectType<typeof PathScurry>(PathScurry)

// Minimatch and minimatch from minimatch
expectType<typeof Minimatch>(Minimatch)
expectType<typeof minimatch>(minimatch)

// Minipass from minipass
expectType<typeof Minipass>(Minipass)

// ============================================================================
// Pattern type tests
// ============================================================================

// Pattern can be string
glob('*.js')
globSync('*.js')

// Pattern can be string[]
glob(['*.js', '*.ts'])
globSync(['*.js', '*.ts'])

// ============================================================================
// Platform option tests
// ============================================================================

// Platform values
const platformDarwin: GlobOptions = { platform: 'darwin' }
const platformLinux: GlobOptions = { platform: 'linux' }
const platformWin32: GlobOptions = { platform: 'win32' }

// ============================================================================
// Error cases - these should produce type errors
// ============================================================================

// Note: withFileTypes + absolute conflict is a runtime error, not a compile error
// The types allow both to be set, but the runtime throws

// @ts-expect-error - pattern must be string or string[]
glob(123)

// @ts-expect-error - pattern must be string or string[]
globSync(null)

// ============================================================================
// Async iteration tests
// ============================================================================

async function testAsyncIteration() {
  // Can use for-await with globIterate
  for await (const file of globIterate('*.js')) {
    expectType<string>(file)
  }

  // Can use for-await with Glob class
  for await (const file of new Glob('*.js')) {
    expectType<string>(file)
  }
}

// ============================================================================
// Sync iteration tests
// ============================================================================

function testSyncIteration() {
  // Can use for-of with globIterateSync
  for (const file of globIterateSync('*.js')) {
    expectType<string>(file)
  }

  // Can use for-of with Glob class
  for (const file of new Glob('*.js')) {
    expectType<string>(file)
  }
}
