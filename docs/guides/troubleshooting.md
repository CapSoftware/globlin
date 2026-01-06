# Troubleshooting

Common issues and solutions when using globlin.

## Installation Issues

### Native Module Build Failures

If npm fails to install with build errors:

```bash
# Install build tools
npm install -g node-gyp

# On macOS
xcode-select --install

# On Windows
npm install -g windows-build-tools

# On Linux
sudo apt-get install build-essential
```

### Pre-built Binary Not Available

If no pre-built binary exists for your platform:

```bash
# Install Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Rebuild the module
npm rebuild globlin
```

## Pattern Issues

### Pattern Returns No Results

Check these common causes:

1. **Wrong cwd**: Ensure `cwd` points to the correct directory
2. **Missing dot files**: Use `dot: true` to include hidden files
3. **Case sensitivity**: Use `nocase: true` on case-sensitive systems
4. **Escaped characters**: Ensure `*` and `?` aren't escaped

```typescript
// Debug: check what glob sees
const g = new Glob('**/*.js', { cwd: '/project' })
console.log('Pattern:', g.pattern)
console.log('CWD:', g.cwd)
```

### Pattern Returns Too Many Results

Use ignore patterns to filter:

```typescript
glob('**/*.js', {
  ignore: ['node_modules/**', 'dist/**']
})
```

### Different Results from bash

Globlin follows minimatch semantics, not bash:

- `**` only matches directories (use `**/*` for all files)
- Brace expansion is enabled by default
- Extglob patterns require different syntax

## Performance Issues

### Slow Performance

1. Use more specific patterns
2. Add ignore patterns for large directories
3. Use `maxDepth` to limit recursion
4. Consider `globSync` for small directories

### High Memory Usage

Use streaming for large result sets:

```typescript
const stream = globStream('**/*')
stream.on('data', processFile)
```

## Compatibility Issues

### Different Results from glob Package

This is a bug. Please report it with:

1. The pattern used
2. Options passed
3. Expected vs actual results
4. Directory structure (or reproduction steps)

### TypeScript Errors

Ensure correct TypeScript configuration:

```json
{
  "compilerOptions": {
    "moduleResolution": "node16",
    "esModuleInterop": true,
    "target": "ES2020"
  }
}
```

## Platform Issues

### Windows Path Issues

Use forward slashes in patterns:

```typescript
// Correct
glob('src/**/*.js')

// May cause issues
glob('src\\**\\*.js')
```

Or enable Windows path handling:

```typescript
glob('src\\**\\*.js', { windowsPathsNoEscape: true })
```

### Symlink Issues

Control symlink behavior:

```typescript
// Don't follow symlinks
glob('**/*.js', { follow: false })

// Follow all symlinks
glob('**/*.js', { follow: true })
```

## Getting Help

If you're still having issues:

1. Check existing issues: https://github.com/globlin/globlin/issues
2. Create a minimal reproduction
3. File a new issue with:
   - Node.js version
   - Platform (OS, architecture)
   - globlin version
   - Pattern and options
   - Expected vs actual behavior

## See Also

- [Migration from glob](./migration-from-glob.md)
- [Performance Tuning](./performance-tuning.md)
