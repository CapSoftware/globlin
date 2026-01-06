# Migration from glob

Globlin is a drop-in replacement for glob v13. This guide covers the migration process and any differences to be aware of.

## Installation

```bash
# Remove glob
npm uninstall glob

# Install globlin
npm install globlin
```

## Import Changes

Simply update your imports:

```typescript
// Before
import { glob, globSync } from 'glob'

// After
import { glob, globSync } from 'globlin'
```

## API Compatibility

Globlin implements 100% of glob v13's public API:

| API | Status |
|-----|--------|
| `glob()` | Fully compatible |
| `globSync()` | Fully compatible |
| `globStream()` | Fully compatible |
| `globStreamSync()` | Fully compatible |
| `globIterate()` | Fully compatible |
| `globIterateSync()` | Fully compatible |
| `Glob` class | Fully compatible |
| `hasMagic()` | Fully compatible |
| `escape()` | Fully compatible |
| `unescape()` | Fully compatible |
| All options | Fully compatible |

## Not Supported

The following features are not supported:

### Custom Filesystem

The `fs` option for custom filesystem implementations is not supported. Globlin uses native filesystem calls for performance.

```typescript
// NOT SUPPORTED
glob('**/*.js', {
  fs: customFs
})
```

### PathScurry Instance Reuse

While globlin returns proper PathScurry objects when `withFileTypes: true`, passing a custom `scurry` instance is not supported.

## Performance Improvements

Globlin provides 20-30x performance improvement over glob:

| Pattern | glob | globlin | Speedup |
|---------|------|---------|---------|
| `*.js` | 320ms | 10ms | 32x |
| `**/*.ts` | 450ms | 18ms | 25x |
| Complex patterns | 800ms | 40ms | 20x |

*Benchmarks on 100k file directory*

## Troubleshooting

### TypeScript Errors

If you see type errors after migration, ensure your TypeScript is configured correctly:

```json
{
  "compilerOptions": {
    "moduleResolution": "node16",
    "esModuleInterop": true
  }
}
```

### Different Results

If globlin returns different results than glob, please file a bug report. This should not happen and is considered a compatibility issue.

## See Also

- [Performance Tuning](./performance-tuning.md)
- [Troubleshooting](./troubleshooting.md)
