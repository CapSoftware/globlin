/**
 * TypeScript type definitions for globlin
 *
 * These types are designed to be 100% compatible with glob v13.
 * This file provides additional type utilities and type aliases.
 */

/// <reference types="node" />

import type { Path as PathScurryPath } from 'path-scurry'
import type {
  GlobOptions,
  GlobOptionsWithFileTypesTrue,
  GlobOptionsWithFileTypesFalse,
  IgnorePattern,
} from './index'

// Re-export all types from index for convenience
export type {
  GlobOptions,
  GlobOptionsWithFileTypesTrue,
  GlobOptionsWithFileTypesFalse,
  IgnorePattern,
}

// ============================================================================
// Pattern Types
// ============================================================================

/**
 * Pattern type - can be a single string or array of strings
 */
export type Pattern = string | string[]

/**
 * Platform type - valid values for the platform option
 */
export type Platform = NodeJS.Platform

// ============================================================================
// Result Types
// ============================================================================

/**
 * PathLike interface - matches the path-scurry Path object
 */
export interface PathLike {
  /** The name of the file or directory (basename) */
  name: string
  /** Get the full absolute path */
  fullpath(): string
  /** Get the path relative to cwd */
  relative(): string
  /** Check if this is a regular file */
  isFile(): boolean
  /** Check if this is a directory */
  isDirectory(): boolean
  /** Check if this is a symbolic link */
  isSymbolicLink(): boolean
  /** The parent directory (or undefined for root) */
  parent?: PathLike
  /** Resolve a path relative to this path */
  resolve(path: string): PathLike
}

/**
 * Result type for glob operations based on options
 *
 * @example
 * ```ts
 * type StringResult = GlobResult<{ withFileTypes: false }>  // string[]
 * type PathResult = GlobResult<{ withFileTypes: true }>     // Path[]
 * ```
 */
export type GlobResult<O extends { withFileTypes?: boolean }> = O extends { withFileTypes: true }
  ? PathScurryPath[]
  : string[]

/**
 * Async result type for glob operations
 */
export type GlobAsyncResult<O extends { withFileTypes?: boolean }> = Promise<GlobResult<O>>

// ============================================================================
// Options Subsets
// ============================================================================

/**
 * Options for pattern matching (subset of GlobOptions)
 */
export interface PatternOptions {
  /** Case-insensitive matching */
  nocase?: boolean
  /** Disable brace expansion */
  nobrace?: boolean
  /** Disable extglob patterns */
  noext?: boolean
  /** Disable globstar matching */
  noglobstar?: boolean
  /** Match dot files */
  dot?: boolean
  /** Treat brace expansion as magic */
  magicalBraces?: boolean
  /** Use backslash as path separator only */
  windowsPathsNoEscape?: boolean
}

/**
 * Options for filesystem walking (subset of GlobOptions)
 */
export interface WalkOptions {
  /** Current working directory */
  cwd?: string
  /** Follow symbolic links */
  follow?: boolean
  /** Maximum directory depth */
  maxDepth?: number
  /** Match dot files and directories */
  dot?: boolean
  /** Exclude directories from results */
  nodir?: boolean
  /** Use parallel walking */
  parallel?: boolean
  /** Enable directory caching */
  cache?: boolean
}

/**
 * Options for output formatting (subset of GlobOptions)
 */
export interface OutputOptions {
  /** Return absolute paths */
  absolute?: boolean
  /** Prepend ./ to relative paths */
  dotRelative?: boolean
  /** Append / to directory paths */
  mark?: boolean
  /** Use POSIX separators */
  posix?: boolean
  /** Return Path objects instead of strings */
  withFileTypes?: boolean
}

/**
 * Options for filtering (subset of GlobOptions)
 */
export interface FilterOptions {
  /** Patterns or object to ignore */
  ignore?: string | string[]
  /** Include children of matches */
  includeChildMatches?: boolean
}

// ============================================================================
// Function Signature Types
// ============================================================================

/**
 * Signature for glob function
 */
export interface GlobFunction {
  (pattern: Pattern, options?: GlobOptionsWithFileTypesFalse): Promise<string[]>
  (pattern: Pattern, options: GlobOptionsWithFileTypesTrue): Promise<PathScurryPath[]>
}

/**
 * Signature for globSync function
 */
export interface GlobSyncFunction {
  (pattern: Pattern, options?: GlobOptionsWithFileTypesFalse): string[]
  (pattern: Pattern, options: GlobOptionsWithFileTypesTrue): PathScurryPath[]
}

/**
 * Options for glob where withFileTypes is not specified
 */
export interface GlobOptionsWithFileTypesUnset extends GlobOptions {
  withFileTypes?: undefined
}
