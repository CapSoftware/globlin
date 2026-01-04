/**
 * TypeScript type definitions for globlin
 *
 * These types are designed to be 100% compatible with glob v13
 */

/// <reference types="node" />

// Re-export all types from index
export type {
  GlobOptions,
  IgnorePattern,
} from './index'

// Additional type utilities

/**
 * Path type from path-scurry (re-declared to avoid import issues)
 */
export interface PathLike {
  name: string
  fullpath(): string
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

/**
 * Result type for glob operations when withFileTypes is true
 */
export type GlobResult<O extends { withFileTypes?: boolean }> =
  O extends { withFileTypes: true }
    ? PathLike[]
    : string[]

/**
 * Pattern type - can be a single string or array of strings
 */
export type Pattern = string | string[]

/**
 * Platform type
 */
export type Platform = 'linux' | 'darwin' | 'win32' | 'aix' | 'freebsd' | 'openbsd' | 'sunos'

/**
 * Options for pattern matching (subset of GlobOptions)
 */
export interface PatternOptions {
  nocase?: boolean
  nobrace?: boolean
  noext?: boolean
  noglobstar?: boolean
  dot?: boolean
  magicalBraces?: boolean
  windowsPathsNoEscape?: boolean
}

/**
 * Options for filesystem walking (subset of GlobOptions)
 */
export interface WalkOptions {
  cwd?: string
  follow?: boolean
  maxDepth?: number
  dot?: boolean
  nodir?: boolean
}

/**
 * Options for output formatting (subset of GlobOptions)
 */
export interface OutputOptions {
  absolute?: boolean
  dotRelative?: boolean
  mark?: boolean
  posix?: boolean
  withFileTypes?: boolean
}
