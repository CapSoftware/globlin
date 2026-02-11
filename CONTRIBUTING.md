# Contributing to Globlin

Thank you for your interest in contributing to Globlin! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Benchmarking](#benchmarking)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

## Code of Conduct

This project adheres to a code of conduct that all contributors are expected to follow. Please be respectful and constructive in all interactions.

## Getting Started

Globlin is a hybrid Rust/Node.js project that uses NAPI-RS to create native bindings. Before contributing, familiarize yourself with:

- [Node.js](https://nodejs.org/) (v20.0.0 or higher)
- [Rust](https://www.rust-lang.org/) (latest stable)
- [NAPI-RS](https://napi.rs/) for native bindings
- The [glob v13 API](https://github.com/isaacs/node-glob) that we aim to replace

## Development Setup

### Prerequisites

- Node.js 20.x or 22.x
- Rust (latest stable version)
- Cargo (comes with Rust)
- A C/C++ compiler toolchain for your platform

### Installation

1. Clone the repository:
```bash
git clone https://github.com/CapSoftware/globlin.git
cd globlin
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Build the native module and TypeScript:
```bash
npm run build
```

For development builds (faster, with debug symbols):
```bash
npm run build:debug
```

## Development Workflow

### Project Structure

```
globlin/
├── src/           # Rust source code
├── js/            # TypeScript source code
├── tests/         # Test files
├── benches/       # Benchmark files
├── docs/          # Documentation
└── www/           # Website/landing page
```

### Making Changes

1. Create a new branch for your changes:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes in the appropriate directory:
   - Rust code: `src/`
   - TypeScript code: `js/`
   - Tests: `tests/`
   - Documentation: `docs/`

3. Build your changes:
```bash
npm run build
```

4. Run tests to ensure everything works:
```bash
npm test
```

### Building

- **Full build** (native + TypeScript):
  ```bash
  npm run build
  ```

- **Native module only**:
  ```bash
  npm run build:native
  ```

- **TypeScript only**:
  ```bash
  npm run build:ts
  ```

- **Debug build** (faster compilation):
  ```bash
  npm run build:debug
  ```

## Testing

### Running Tests

- **Run all tests**:
  ```bash
  npm test
  ```

- **Watch mode** (for development):
  ```bash
  npm run test:watch
  ```

- **With coverage**:
  ```bash
  npm run test:coverage
  ```

- **Type tests**:
  ```bash
  npm run test:types
  ```

### Writing Tests

- Place test files in the `tests/` directory
- Use descriptive test names that explain what is being tested
- Follow the existing test patterns in the codebase
- Ensure tests pass on all supported platforms (Linux, macOS, Windows)

Example test structure:
```typescript
import { describe, it, expect } from 'vitest'
import { glob } from '../js/index.js'

describe('feature name', () => {
  it('should do something specific', async () => {
    const results = await glob('pattern')
    expect(results).toEqual(['expected', 'results'])
  })
})
```

## Benchmarking

Globlin emphasizes performance. When making changes that could affect performance, run benchmarks:

### Running Benchmarks

- **Quick benchmark** (small fixture):
  ```bash
  npm run bench:small
  ```

- **Standard benchmark** (medium fixture, 20k files):
  ```bash
  npm run bench:medium
  ```

- **Full benchmark** (large fixture, 100k files):
  ```bash
  npm run bench:large
  ```

- **Comparison with fast-glob**:
  ```bash
  npm run bench:vs-fg
  ```

### Setting Up Fixtures

Before running benchmarks, you may need to generate test fixtures:

```bash
npm run bench:setup
```

For the large fixture (100k files):
```bash
npm run bench:setup:huge
```

## Code Style

### TypeScript

- We use ESLint and Prettier for TypeScript code
- Run linting:
  ```bash
  npm run lint:ts
  ```
- Auto-fix issues:
  ```bash
  npm run lint:fix
  ```
- Format code:
  ```bash
  npm run format:ts
  ```

### Rust

- We use Clippy and rustfmt for Rust code
- Run Clippy:
  ```bash
  npm run lint:rust
  ```
- Format code:
  ```bash
  npm run format:rust
  ```

### Combined

- **Lint everything**:
  ```bash
  npm run lint
  ```

- **Format everything**:
  ```bash
  npm run format
  ```

- **Check formatting** (CI):
  ```bash
  npm run format:check
  ```

## Submitting Changes

### Pull Request Process

1. **Before submitting**:
   - Ensure all tests pass: `npm test`
   - Run linting: `npm run lint`
   - Format code: `npm run format`
   - Update documentation if needed
   - Add/update tests for your changes

2. **Commit guidelines**:
   - Write clear, descriptive commit messages
   - Use conventional commit format when possible:
     - `feat:` for new features
     - `fix:` for bug fixes
     - `docs:` for documentation changes
     - `perf:` for performance improvements
     - `test:` for test changes
     - `refactor:` for code refactoring
     - `chore:` for maintenance tasks

3. **Submit your PR**:
   - Push your branch to your fork
   - Open a pull request against the `main` branch
   - Fill out the PR template with:
     - Clear description of changes
     - Related issue numbers (if applicable)
     - Screenshots/benchmarks (if applicable)
     - Breaking changes (if any)

4. **Review process**:
   - Maintainers will review your PR
   - Address any feedback or requested changes
   - Once approved, a maintainer will merge your PR

### PR Checklist

- [ ] Tests pass locally (`npm test`)
- [ ] Code is linted (`npm run lint`)
- [ ] Code is formatted (`npm run format`)
- [ ] Documentation is updated (if needed)
- [ ] CHANGELOG.md is updated (for significant changes)
- [ ] Benchmarks run (for performance-related changes)
- [ ] PR description clearly explains the changes

## Reporting Bugs

When reporting bugs, please include:

1. **Description**: Clear description of the bug
2. **Steps to reproduce**: Minimal code example that demonstrates the issue
3. **Expected behavior**: What you expected to happen
4. **Actual behavior**: What actually happened
5. **Environment**:
   - Node.js version (`node --version`)
   - Operating system and version
   - Globlin version
   - Any relevant error messages or stack traces

Use the [GitHub issue tracker](https://github.com/CapSoftware/globlin/issues) to report bugs.

## Feature Requests

We welcome feature requests! When proposing a new feature:

1. **Check existing issues**: Ensure it hasn't been requested already
2. **Describe the use case**: Why is this feature needed?
3. **Propose a solution**: How should it work?
4. **Consider compatibility**: How does it affect the glob v13 API compatibility?
5. **Performance impact**: Consider performance implications

## API Compatibility

Globlin aims to be a **drop-in replacement** for glob v13. When contributing:

- Maintain 100% API compatibility with glob v13
- Don't break existing behavior unless fixing a bug
- If adding new features, ensure they're additive and optional
- Test against the glob test suite when possible

## Performance Considerations

Globlin's primary goal is performance. When contributing:

- Consider the performance impact of your changes
- Run benchmarks for performance-related changes
- Optimize for the common case (large directories, simple patterns)
- Profile your changes if adding new features
- Document any performance trade-offs

## Platform Support

Ensure your changes work on all supported platforms:

- **Operating Systems**: Linux, macOS, Windows
- **Architectures**: x64, ARM64
- **Node.js versions**: 20.x, 22.x

## Getting Help

- **Questions**: Open a [discussion](https://github.com/CapSoftware/globlin/discussions)
- **Chat**: Join our community (link TBD)
- **Documentation**: Check the [docs](docs/) directory

## License

By contributing to Globlin, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Globlin!
