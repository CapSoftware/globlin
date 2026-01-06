# globStream() / globStreamSync()

Streaming glob functions that return Minipass streams for memory-efficient processing of large result sets.

## Signatures

```typescript
function globStream(
  pattern: string | string[],
  options?: GlobOptions
): Minipass<string, string>

function globStreamSync(
  pattern: string | string[],
  options?: GlobOptions
): Minipass<string, string>
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `string \| string[]` | A glob pattern or array of patterns to match |
| `options` | `GlobOptions` | Optional configuration options |

## Returns

`Minipass<string, string>` - A [Minipass](https://github.com/isaacs/minipass) stream that emits matching file paths as strings.

**Note:** Streaming APIs always return strings, even when `withFileTypes: true` is set. Use `glob()` or `globSync()` for Path objects.

## Examples

### Basic Streaming

```typescript
import { globStream } from 'globlin'

// Create a stream of matching files
const stream = globStream('**/*.js')

stream.on('data', (path) => {
  console.log('Found:', path)
})

stream.on('end', () => {
  console.log('Search complete')
})

stream.on('error', (err) => {
  console.error('Error:', err)
})
```

### Async Iteration

```typescript
import { globStream } from 'globlin'

// Use for-await-of with the stream
async function findFiles() {
  const stream = globStream('**/*.ts')
  
  for await (const path of stream) {
    console.log(path)
  }
}
```

### Sync Streaming

```typescript
import { globStreamSync } from 'globlin'

// Synchronous stream - all data is available immediately
const stream = globStreamSync('**/*.js')

// Collect all results
const files = stream.collect()
console.log(files)

// Or iterate
for (const path of stream) {
  console.log(path)
}
```

### Piping Streams

```typescript
import { globStream } from 'globlin'
import { createWriteStream } from 'fs'

// Pipe results to a file
const stream = globStream('**/*.log')
const output = createWriteStream('files.txt')

stream.pipe(output)
```

### With AbortSignal

```typescript
import { globStream } from 'globlin'

const controller = new AbortController()

const stream = globStream('**/*', {
  signal: controller.signal
})

// Cancel after 3 seconds
setTimeout(() => controller.abort(), 3000)

stream.on('error', (err) => {
  if (err.name === 'AbortError') {
    console.log('Search cancelled')
  }
})
```

### Processing Large Directories

```typescript
import { globStream } from 'globlin'

// Memory-efficient processing of large result sets
async function countFiles(pattern: string, cwd: string): Promise<number> {
  let count = 0
  const stream = globStream(pattern, { cwd })
  
  for await (const _ of stream) {
    count++
  }
  
  return count
}

const total = await countFiles('**/*', '/large/directory')
```

## Differences Between globStream and globStreamSync

| Feature | globStream | globStreamSync |
|---------|------------|----------------|
| Execution | Asynchronous (non-blocking) | Synchronous (blocking) |
| Data availability | Results emitted over time | All data available immediately |
| Use case | Web servers, long-running apps | Scripts, build tools |
| Event loop | Does not block | Blocks until complete |

### globStream Behavior

- Results are emitted asynchronously via `setImmediate()`
- The stream does not block the event loop
- 'data' events fire as results become available
- 'end' fires after all results are emitted

### globStreamSync Behavior

- All results are computed synchronously
- 'data' events fire during the `globStreamSync()` call
- 'end' fires before the function returns
- You can use `.collect()` to get all results as an array

## Minipass Stream Features

The returned stream is a [Minipass](https://github.com/isaacs/minipass) stream with the following features:

```typescript
const stream = globStream('**/*.js')

// Collect all results into an array
const results = await stream.collect()

// Concatenate all results
const single = await stream.concat()

// Promise that resolves when stream ends
await stream.promise()

// Check if stream is finished
stream.end() // true/false
```

## TypeScript Types

```typescript
import { Minipass } from 'minipass'

// Stream type
type GlobStream = Minipass<string, string>
```

## Notes

- Streaming APIs **always return strings**, ignoring `withFileTypes`
- Streams support backpressure automatically via Minipass
- Memory-efficient for large result sets (results are not all held in memory)
- `globStreamSync()` is synchronous but still returns a stream for API consistency
- Fully compatible with glob v13's streaming API

## Error Handling

```typescript
const stream = globStream('**/*.js')

stream.on('error', (err) => {
  // Handle errors during streaming
  console.error('Stream error:', err)
})
```

Errors can occur for:
- Invalid options combinations
- AbortSignal aborted
- Filesystem errors (permissions, etc.)

## Performance Tips

1. Use streaming when processing results one at a time
2. Prefer `glob()` when you need all results at once
3. Use `ignore` patterns to reduce the number of results
4. For very large directories, streaming prevents memory issues

## See Also

- [glob](./glob.md) - Returns all results as an array
- [globIterate](./globIterate.md) - Generator-based iteration
- [Glob class](./Glob-class.md) - Object-oriented interface with `.stream()` method
- [Options](./options.md) - Full options reference
