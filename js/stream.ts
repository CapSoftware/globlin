/**
 * Stream utilities for globlin
 *
 * This module provides stream wrappers around the native Rust implementation
 * to ensure compatibility with glob v13's streaming API.
 */

/// <reference types="node" />

import { Minipass } from 'minipass'
import type { GlobOptions } from './index'

/**
 * Options for configuring the glob stream
 */
export interface GlobStreamOptions extends GlobOptions {
  /**
   * Buffer size for streaming results
   * @default 16
   */
  bufferSize?: number
}

/**
 * Create a readable stream from glob results
 *
 * This wraps the native Rust iterator in a Minipass stream
 * with proper backpressure handling.
 */
export function createGlobStream(
  pattern: string | string[],
  options?: GlobStreamOptions
): Minipass<string, string> {
  const stream = new Minipass<string, string>({
    objectMode: true,
  })

  // TODO: Once native streaming is implemented, use it here
  // For now, we batch results
  const _bufferSize = options?.bufferSize ?? 16

  // Placeholder for native stream integration
  // The actual implementation will call into Rust
  // and stream results with proper backpressure

  return stream
}

/**
 * Collect stream results into an array
 *
 * Utility function for testing and cases where
 * array output is preferred over streaming.
 */
export async function streamToArray<T>(
  stream: Minipass<T, T>
): Promise<T[]> {
  const results: T[] = []

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: T) => {
      results.push(chunk)
    })

    stream.on('end', () => {
      resolve(results)
    })

    stream.on('error', (err: unknown) => {
      reject(err)
    })
  })
}

/**
 * Pipe glob results to another stream with transformation
 */
export function pipeGlobResults<T>(
  source: Minipass<string, string>,
  transform: (path: string) => T
): Minipass<T, T> {
  const output = new Minipass<T, T>({ objectMode: true })

  source.on('data', (path: string) => {
    output.write(transform(path))
  })

  source.on('end', () => {
    output.end()
  })

  source.on('error', (err: unknown) => {
    output.emit('error', err)
  })

  return output
}

/**
 * Merge multiple glob streams into one
 */
export function mergeGlobStreams(
  streams: Minipass<string, string>[]
): Minipass<string, string> {
  const output = new Minipass<string, string>({ objectMode: true })
  let remaining = streams.length

  if (remaining === 0) {
    setImmediate(() => output.end())
    return output
  }

  for (const stream of streams) {
    stream.on('data', (path: string) => {
      output.write(path)
    })

    stream.on('end', () => {
      remaining--
      if (remaining === 0) {
        output.end()
      }
    })

    stream.on('error', (err: unknown) => {
      output.emit('error', err)
    })
  }

  return output
}
