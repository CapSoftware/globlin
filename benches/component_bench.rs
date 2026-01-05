//! Component-level benchmarks for globlin
//!
//! This benchmark measures individual components to identify bottlenecks:
//! - Pattern parsing
//! - Pattern matching (regex vs fast-path)
//! - Directory walking
//! - Result collection
//! - Path formatting
//!
//! Run with: cargo bench --bench component_bench
//!
//! Note: This benchmark only tests Rust-side components that don't require NAPI.
//! For full end-to-end benchmarks including Node.js integration, use the TypeScript
//! benchmarks in benches/*.ts

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use fancy_regex::Regex;
use std::collections::HashSet;
use std::path::PathBuf;
use walkdir::WalkDir;

// ============================================================================
// Pattern Parsing Benchmarks
// ============================================================================

/// Helper to create a pattern regex (simplified version of Pattern logic)
fn pattern_to_regex(pattern: &str) -> Regex {
    let mut regex = String::from("^");

    let chars: Vec<char> = pattern.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        match c {
            '*' => {
                // Check for **
                if i + 1 < chars.len() && chars[i + 1] == '*' {
                    // Globstar
                    regex.push_str(".*");
                    i += 2;
                    // Skip trailing /
                    if i < chars.len() && chars[i] == '/' {
                        i += 1;
                    }
                    continue;
                } else {
                    // Single *
                    regex.push_str("[^/]*");
                }
            }
            '?' => regex.push_str("[^/]"),
            '.' | '+' | '^' | '$' | '(' | ')' | '[' | ']' | '{' | '}' | '|' | '\\' => {
                regex.push('\\');
                regex.push(c);
            }
            '/' => regex.push('/'),
            _ => regex.push(c),
        }
        i += 1;
    }

    regex.push('$');
    Regex::new(&regex).unwrap()
}

/// Benchmark pattern parsing (regex compilation)
fn bench_pattern_parsing(c: &mut Criterion) {
    let mut group = c.benchmark_group("1_pattern_parsing");

    let patterns = [
        ("simple_ext", "*.txt"),
        ("recursive_ext", "**/*.js"),
        ("scoped", "src/**/*.ts"),
        ("literal", "package.json"),
        ("deep_nested", "a/b/c/d/e/f/**/*.ts"),
        ("multi_globstar", "**/*/**/*.js"),
    ];

    for (name, pattern) in patterns {
        group.bench_with_input(
            BenchmarkId::new("compile", name),
            &pattern,
            |b, &pattern| {
                b.iter(|| {
                    let regex = pattern_to_regex(black_box(pattern));
                    black_box(regex)
                })
            },
        );
    }

    group.finish();
}

/// Benchmark brace expansion
fn bench_brace_expansion(c: &mut Criterion) {
    let mut group = c.benchmark_group("2_brace_expansion");

    // Simple brace expansion (no nested)
    fn expand_simple_braces(pattern: &str) -> Vec<String> {
        // Find first brace pair
        if let Some(open) = pattern.find('{') {
            if let Some(close) = pattern[open..].find('}') {
                let close = open + close;
                let prefix = &pattern[..open];
                let suffix = &pattern[close + 1..];
                let alternatives = &pattern[open + 1..close];

                return alternatives
                    .split(',')
                    .map(|alt| format!("{}{}{}", prefix, alt, suffix))
                    .collect();
            }
        }
        vec![pattern.to_string()]
    }

    let patterns = [
        ("simple", "*.{js,ts}"),
        ("three", "*.{js,ts,tsx}"),
        ("six", "*.{js,ts,jsx,tsx,mjs,cjs}"),
        ("nested_path", "src/{components,utils,hooks}/*.ts"),
    ];

    for (name, pattern) in patterns {
        group.bench_with_input(BenchmarkId::new("expand", name), &pattern, |b, &pattern| {
            b.iter(|| {
                let expanded = expand_simple_braces(black_box(pattern));
                black_box(expanded)
            })
        });
    }

    group.finish();
}

// ============================================================================
// Pattern Matching Benchmarks
// ============================================================================

/// Benchmark pattern matching (regex vs string operations)
fn bench_pattern_matching(c: &mut Criterion) {
    let mut group = c.benchmark_group("3_pattern_matching");

    // Test paths (simulating 1000 files)
    let paths: Vec<String> = (0..100)
        .flat_map(|i| {
            vec![
                format!("file{}.js", i),
                format!("src/file{}.ts", i),
                format!("src/components/Component{}.tsx", i),
                format!("test/unit/test{}.spec.ts", i),
                format!("lib/module{}.js", i),
                format!("node_modules/lodash/index{}.js", i),
                format!("dist/bundle{}.min.js", i),
                format!(".hidden/secret{}.txt", i),
                format!("docs/readme{}.md", i),
                format!("package{}.json", i),
            ]
        })
        .collect();

    group.throughput(Throughput::Elements(paths.len() as u64));

    // Fast-path: simple extension check
    group.bench_function("fast_path_ext_check", |b| {
        b.iter(|| {
            let count: usize = paths
                .iter()
                .filter(|p| p.ends_with(black_box(".js")))
                .count();
            black_box(count)
        })
    });

    // Regex: *.js
    let simple_regex = Regex::new(r"^[^/]*\.js$").unwrap();
    group.bench_function("regex_simple_ext", |b| {
        b.iter(|| {
            let count: usize = paths
                .iter()
                .filter(|p| simple_regex.is_match(black_box(p)).unwrap_or(false))
                .count();
            black_box(count)
        })
    });

    // Regex: **/*.js
    let globstar_regex = Regex::new(r"\.js$").unwrap();
    group.bench_function("regex_globstar_ext", |b| {
        b.iter(|| {
            let count: usize = paths
                .iter()
                .filter(|p| globstar_regex.is_match(black_box(p)).unwrap_or(false))
                .count();
            black_box(count)
        })
    });

    // Regex: src/**/*.ts
    let scoped_regex = Regex::new(r"^src/.*\.ts$").unwrap();
    group.bench_function("regex_scoped", |b| {
        b.iter(|| {
            let count: usize = paths
                .iter()
                .filter(|p| scoped_regex.is_match(black_box(p)).unwrap_or(false))
                .count();
            black_box(count)
        })
    });

    // String-based fast path: extension set check
    let extensions: HashSet<&str> = ["js", "ts", "tsx"].iter().cloned().collect();
    group.bench_function("fast_path_ext_set", |b| {
        b.iter(|| {
            let count: usize = paths
                .iter()
                .filter(|p| {
                    p.rsplit_once('.')
                        .map(|(_, ext)| extensions.contains(ext))
                        .unwrap_or(false)
                })
                .count();
            black_box(count)
        })
    });

    // Regex: **/*.{js,ts,tsx}
    let multi_ext_regex = Regex::new(r"\.(js|ts|tsx)$").unwrap();
    group.bench_function("regex_multi_ext", |b| {
        b.iter(|| {
            let count: usize = paths
                .iter()
                .filter(|p| multi_ext_regex.is_match(black_box(p)).unwrap_or(false))
                .count();
            black_box(count)
        })
    });

    group.finish();
}

// ============================================================================
// Directory Walking Benchmarks
// ============================================================================

/// Benchmark directory walking (I/O component)
fn bench_directory_walking(c: &mut Criterion) {
    let mut group = c.benchmark_group("4_directory_walking");

    for (size, sample_size) in [("small", 100), ("medium", 30)] {
        let fixture = PathBuf::from(format!("benches/fixtures/{}", size));

        if !fixture.exists() {
            eprintln!(
                "Skipping {} walking - fixtures not found. Run: node benches/setup-fixtures.js",
                size
            );
            continue;
        }

        group.sample_size(sample_size);

        // Raw walk (count entries)
        group.bench_with_input(
            BenchmarkId::new("walk_all", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let count: usize = WalkDir::new(black_box(fixture))
                        .into_iter()
                        .filter_map(|e| e.ok())
                        .count();
                    black_box(count)
                })
            },
        );

        // Walk with depth limit = 1 (root only)
        group.bench_with_input(
            BenchmarkId::new("walk_depth_1", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let count: usize = WalkDir::new(black_box(fixture))
                        .max_depth(1)
                        .into_iter()
                        .filter_map(|e| e.ok())
                        .count();
                    black_box(count)
                })
            },
        );

        // Walk with depth limit = 3
        group.bench_with_input(
            BenchmarkId::new("walk_depth_3", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let count: usize = WalkDir::new(black_box(fixture))
                        .max_depth(3)
                        .into_iter()
                        .filter_map(|e| e.ok())
                        .count();
                    black_box(count)
                })
            },
        );

        // Walk with file filter
        group.bench_with_input(
            BenchmarkId::new("walk_files_only", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let count: usize = WalkDir::new(black_box(fixture))
                        .into_iter()
                        .filter_map(|e| e.ok())
                        .filter(|e| e.file_type().is_file())
                        .count();
                    black_box(count)
                })
            },
        );

        // Walk with entry filter (prune hidden directories)
        group.bench_with_input(
            BenchmarkId::new("walk_prune_hidden", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let count: usize = WalkDir::new(black_box(fixture))
                        .into_iter()
                        .filter_entry(|e| {
                            !e.file_name()
                                .to_str()
                                .map(|s| s.starts_with('.'))
                                .unwrap_or(false)
                        })
                        .filter_map(|e| e.ok())
                        .count();
                    black_box(count)
                })
            },
        );
    }

    group.finish();
}

// ============================================================================
// Result Collection Benchmarks
// ============================================================================

/// Benchmark result collection strategies
fn bench_result_collection(c: &mut Criterion) {
    let mut group = c.benchmark_group("5_result_collection");

    let fixture = PathBuf::from("benches/fixtures/small");

    if !fixture.exists() {
        eprintln!("Skipping result collection - fixtures not found");
        return;
    }

    // Count entries for throughput
    let entry_count = WalkDir::new(&fixture)
        .into_iter()
        .filter_map(|e| e.ok())
        .count() as u64;

    group.throughput(Throughput::Elements(entry_count));
    group.sample_size(100);

    // Collect to Vec<PathBuf>
    group.bench_function("collect_pathbuf", |b| {
        b.iter(|| {
            let results: Vec<PathBuf> = WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_map(|e| e.ok())
                .map(|e| e.path().to_path_buf())
                .collect();
            black_box(results)
        })
    });

    // Collect to Vec<String>
    group.bench_function("collect_string", |b| {
        b.iter(|| {
            let results: Vec<String> = WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_map(|e| e.ok())
                .map(|e| e.path().to_string_lossy().into_owned())
                .collect();
            black_box(results)
        })
    });

    // Pre-allocated collection
    group.bench_function("collect_preallocated", |b| {
        b.iter(|| {
            let mut results: Vec<String> = Vec::with_capacity(500);
            for entry in WalkDir::new(black_box(&fixture)) {
                if let Ok(e) = entry {
                    results.push(e.path().to_string_lossy().into_owned());
                }
            }
            black_box(results)
        })
    });

    // Count only (no allocation)
    group.bench_function("count_only", |b| {
        b.iter(|| {
            let count: usize = WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_map(|e| e.ok())
                .count();
            black_box(count)
        })
    });

    // With deduplication (HashSet)
    group.bench_function("collect_with_dedup", |b| {
        b.iter(|| {
            let mut seen: HashSet<String> = HashSet::with_capacity(500);
            let results: Vec<String> = WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_map(|e| e.ok())
                .map(|e| e.path().to_string_lossy().into_owned())
                .filter(|p| seen.insert(p.clone()))
                .collect();
            black_box(results)
        })
    });

    group.finish();
}

// ============================================================================
// Path Formatting Benchmarks
// ============================================================================

/// Benchmark path formatting operations
fn bench_path_formatting(c: &mut Criterion) {
    let mut group = c.benchmark_group("6_path_formatting");

    let paths: Vec<PathBuf> = vec![
        "src/index.ts",
        "src/components/Button/index.tsx",
        "node_modules/lodash/fp/index.js",
        ".github/workflows/ci.yml",
        "packages/core/src/utils/helpers.ts",
        "test/unit/components/Button.test.tsx",
        "dist/bundle.min.js",
        "docs/api/README.md",
        "scripts/build.sh",
        ".gitignore",
    ]
    .into_iter()
    .map(PathBuf::from)
    .collect();

    // to_string_lossy
    group.bench_function("to_string_lossy", |b| {
        b.iter(|| {
            for path in &paths {
                black_box(path.to_string_lossy());
            }
        })
    });

    // Get extension
    group.bench_function("get_extension", |b| {
        b.iter(|| {
            for path in &paths {
                black_box(path.extension());
            }
        })
    });

    // Get file name
    group.bench_function("get_file_name", |b| {
        b.iter(|| {
            for path in &paths {
                black_box(path.file_name());
            }
        })
    });

    // Path components
    group.bench_function("path_components", |b| {
        b.iter(|| {
            for path in &paths {
                let count: usize = path.components().count();
                black_box(count);
            }
        })
    });

    // Normalize separators (Windows -> Unix)
    let windows_paths: Vec<String> = vec![
        r"src\index.ts",
        r"src\components\Button\index.tsx",
        r"node_modules\lodash\fp\index.js",
        r".github\workflows\ci.yml",
        r"packages\core\src\utils\helpers.ts",
    ]
    .into_iter()
    .map(String::from)
    .collect();

    group.bench_function("normalize_separators", |b| {
        b.iter(|| {
            for path in &windows_paths {
                black_box(path.replace('\\', "/"));
            }
        })
    });

    // Add ./ prefix
    group.bench_function("add_dot_prefix", |b| {
        let string_paths: Vec<String> = paths
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        b.iter(|| {
            for path in &string_paths {
                if !path.starts_with("./") && !path.starts_with("../") {
                    black_box(format!("./{}", path));
                } else {
                    black_box(path.clone());
                }
            }
        })
    });

    // Add trailing /
    group.bench_function("add_trailing_slash", |b| {
        let string_paths: Vec<String> = paths
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        b.iter(|| {
            for path in &string_paths {
                if !path.ends_with('/') {
                    black_box(format!("{}/", path));
                } else {
                    black_box(path.clone());
                }
            }
        })
    });

    // Strip prefix
    let base = PathBuf::from("src");
    group.bench_function("strip_prefix", |b| {
        b.iter(|| {
            for path in &paths {
                black_box(path.strip_prefix(&base).unwrap_or(path));
            }
        })
    });

    group.finish();
}

// ============================================================================
// Full Operation Simulation
// ============================================================================

/// Benchmark full glob operation components (simulated)
fn bench_full_operation(c: &mut Criterion) {
    let mut group = c.benchmark_group("7_full_operation");

    let fixture = PathBuf::from("benches/fixtures/small");

    if !fixture.exists() {
        eprintln!("Skipping full operation - fixtures not found");
        return;
    }

    group.sample_size(50);

    // Simulate: **/*.js (walk + match + collect)
    let js_regex = Regex::new(r"\.js$").unwrap();

    group.bench_function("walk_match_collect_regex", |b| {
        b.iter(|| {
            let results: Vec<String> = WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
                .map(|e| {
                    e.path()
                        .strip_prefix(&fixture)
                        .unwrap_or(e.path())
                        .to_string_lossy()
                        .into_owned()
                })
                .filter(|p| js_regex.is_match(p).unwrap_or(false))
                .collect();
            black_box(results)
        })
    });

    // Simulate: *.js (depth-limited walk + fast-path match)
    group.bench_function("walk_match_collect_fast", |b| {
        b.iter(|| {
            let results: Vec<String> = WalkDir::new(black_box(&fixture))
                .max_depth(1)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|p| p.ends_with(".js"))
                .collect();
            black_box(results)
        })
    });

    // Simulate: src/**/*.ts with directory pruning
    let ts_regex = Regex::new(r"\.ts$").unwrap();
    group.bench_function("walk_match_collect_scoped", |b| {
        let src_path = fixture.join("level0");
        if src_path.exists() {
            b.iter(|| {
                let results: Vec<String> = WalkDir::new(black_box(&src_path))
                    .into_iter()
                    .filter_map(|e| e.ok())
                    .filter(|e| e.file_type().is_file())
                    .map(|e| {
                        e.path()
                            .strip_prefix(&src_path)
                            .unwrap_or(e.path())
                            .to_string_lossy()
                            .into_owned()
                    })
                    .filter(|p| ts_regex.is_match(p).unwrap_or(false))
                    .collect();
                black_box(results)
            })
        }
    });

    // Full pipeline with preallocated vectors
    group.bench_function("walk_match_collect_optimized", |b| {
        b.iter(|| {
            let mut results: Vec<String> = Vec::with_capacity(100);
            for entry in WalkDir::new(black_box(&fixture)) {
                if let Ok(e) = entry {
                    if e.file_type().is_file() {
                        let path = e
                            .path()
                            .strip_prefix(&fixture)
                            .unwrap_or(e.path())
                            .to_string_lossy();
                        if path.ends_with(".js") {
                            results.push(path.into_owned());
                        }
                    }
                }
            }
            black_box(results)
        })
    });

    group.finish();
}

// ============================================================================
// Criterion Groups
// ============================================================================

criterion_group!(
    benches,
    bench_pattern_parsing,
    bench_brace_expansion,
    bench_pattern_matching,
    bench_directory_walking,
    bench_result_collection,
    bench_path_formatting,
    bench_full_operation,
);

criterion_main!(benches);
