//! Benchmarks for globlin pattern matching and filesystem walking
//!
//! Run with: cargo bench
//!
//! These benchmarks use real filesystem operations on actual fixtures.
//! Fixtures must be generated first using `node benches/setup-fixtures.js`

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::path::PathBuf;
use walkdir::WalkDir;

/// Count files in a directory (for throughput calculation)
fn count_files(path: &PathBuf) -> u64 {
    WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .count() as u64
}

/// Benchmark raw directory walking with walkdir (baseline for what's achievable)
fn bench_walkdir_raw(c: &mut Criterion) {
    let mut group = c.benchmark_group("walkdir_raw");

    for (size, sample_size) in [("small", 100), ("medium", 50), ("large", 20)] {
        let fixture = PathBuf::from(format!("benches/fixtures/{size}"));

        if !fixture.exists() {
            eprintln!("Skipping {size} - fixtures not found. Run: node benches/setup-fixtures.js");
            continue;
        }

        let file_count = count_files(&fixture);
        group.throughput(Throughput::Elements(file_count));
        group.sample_size(sample_size);

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

        group.bench_with_input(
            BenchmarkId::new("walk_with_extension_filter", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let count: usize = WalkDir::new(black_box(fixture))
                        .into_iter()
                        .filter_map(|e| e.ok())
                        .filter(|e| {
                            e.file_type().is_file()
                                && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                        })
                        .count();
                    black_box(count)
                })
            },
        );
    }

    group.finish();
}

/// Benchmark directory walking with max depth limits
fn bench_walkdir_depth(c: &mut Criterion) {
    let fixture = PathBuf::from("benches/fixtures/medium");

    if !fixture.exists() {
        eprintln!("Skipping depth benchmarks - fixtures not found");
        return;
    }

    let mut group = c.benchmark_group("walkdir_depth");
    group.sample_size(50);

    for depth in [1, 2, 3, 5, 10] {
        group.bench_with_input(BenchmarkId::new("max_depth", depth), &depth, |b, &depth| {
            b.iter(|| {
                let count: usize = WalkDir::new(black_box(&fixture))
                    .max_depth(depth)
                    .into_iter()
                    .filter_map(|e| e.ok())
                    .count();
                black_box(count)
            })
        });
    }

    group.finish();
}

/// Benchmark regex pattern matching (simulating glob pattern matching overhead)
fn bench_pattern_matching(c: &mut Criterion) {
    use regex::Regex;

    let mut group = c.benchmark_group("pattern_matching");

    let paths: Vec<&str> = vec![
        "src/index.ts",
        "src/components/Button.tsx",
        "src/components/Input/index.ts",
        "node_modules/lodash/index.js",
        "node_modules/@types/node/index.d.ts",
        "test/unit/foo.test.js",
        "test/integration/bar.test.ts",
        ".gitignore",
        "package.json",
        "README.md",
    ];

    // Simple extension match: *.ts
    let simple_regex = Regex::new(r"^[^/]*\.ts$").unwrap();
    group.bench_function("simple_ext_match", |b| {
        b.iter(|| {
            let count: usize = paths
                .iter()
                .filter(|p| simple_regex.is_match(black_box(p)))
                .count();
            black_box(count)
        })
    });

    // Globstar match: **/*.ts (any .ts file)
    let globstar_regex = Regex::new(r"\.ts$").unwrap();
    group.bench_function("globstar_match", |b| {
        b.iter(|| {
            let count: usize = paths
                .iter()
                .filter(|p| globstar_regex.is_match(black_box(p)))
                .count();
            black_box(count)
        })
    });

    // Complex pattern: src/**/*.{ts,tsx}
    let complex_regex = Regex::new(r"^src/.*\.(ts|tsx)$").unwrap();
    group.bench_function("complex_pattern_match", |b| {
        b.iter(|| {
            let count: usize = paths
                .iter()
                .filter(|p| complex_regex.is_match(black_box(p)))
                .count();
            black_box(count)
        })
    });

    // Negation pattern simulation: !(node_modules)/**/*.js
    // Note: Rust regex doesn't support lookahead, so we simulate with explicit exclusion
    let js_regex_for_negation = Regex::new(r"\.js$").unwrap();
    group.bench_function("negation_pattern_match", |b| {
        b.iter(|| {
            let count: usize = paths
                .iter()
                .filter(|p| {
                    !p.starts_with("node_modules/") && js_regex_for_negation.is_match(black_box(p))
                })
                .count();
            black_box(count)
        })
    });

    group.finish();
}

/// Benchmark path string operations (common overhead in glob implementations)
fn bench_path_operations(c: &mut Criterion) {
    let mut group = c.benchmark_group("path_operations");

    let paths: Vec<PathBuf> = vec![
        "src/components/Button/index.tsx",
        "node_modules/lodash/fp/index.js",
        "test/unit/components/Button.test.tsx",
        ".github/workflows/ci.yml",
        "packages/core/src/index.ts",
    ]
    .into_iter()
    .map(PathBuf::from)
    .collect();

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

    // Convert to string
    group.bench_function("to_string", |b| {
        b.iter(|| {
            for path in &paths {
                black_box(path.to_string_lossy());
            }
        })
    });

    // Path components iteration
    group.bench_function("path_components", |b| {
        b.iter(|| {
            for path in &paths {
                let count: usize = path.components().count();
                black_box(count);
            }
        })
    });

    group.finish();
}

/// Benchmark combined walk + filter (simulating full glob operation)
fn bench_glob_simulation(c: &mut Criterion) {
    use regex::Regex;

    let fixture = PathBuf::from("benches/fixtures/small");

    if !fixture.exists() {
        eprintln!("Skipping glob simulation - fixtures not found");
        return;
    }

    let mut group = c.benchmark_group("glob_simulation");
    group.sample_size(100);

    // Simulate: **/*.js
    let js_regex = Regex::new(r"\.js$").unwrap();
    group.bench_function("star_star_js", |b| {
        b.iter(|| {
            let results: Vec<_> = WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
                .filter(|e| {
                    e.path()
                        .to_str()
                        .map(|s| js_regex.is_match(s))
                        .unwrap_or(false)
                })
                .map(|e| e.path().to_path_buf())
                .collect();
            black_box(results)
        })
    });

    // Simulate: **/*.{js,ts}
    let js_ts_regex = Regex::new(r"\.(js|ts)$").unwrap();
    group.bench_function("star_star_js_ts", |b| {
        b.iter(|| {
            let results: Vec<_> = WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
                .filter(|e| {
                    e.path()
                        .to_str()
                        .map(|s| js_ts_regex.is_match(s))
                        .unwrap_or(false)
                })
                .map(|e| e.path().to_path_buf())
                .collect();
            black_box(results)
        })
    });

    // Simulate: level0/**/*.js (scoped search)
    let scoped_regex = Regex::new(r"level0/.*\.js$").unwrap();
    group.bench_function("scoped_search", |b| {
        b.iter(|| {
            let results: Vec<_> = WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
                .filter(|e| {
                    e.path()
                        .to_str()
                        .map(|s| scoped_regex.is_match(s))
                        .unwrap_or(false)
                })
                .map(|e| e.path().to_path_buf())
                .collect();
            black_box(results)
        })
    });

    group.finish();
}

/// Benchmark on medium fixture for realistic performance numbers
fn bench_glob_simulation_medium(c: &mut Criterion) {
    use regex::Regex;

    let fixture = PathBuf::from("benches/fixtures/medium");

    if !fixture.exists() {
        eprintln!("Skipping medium glob simulation - fixtures not found");
        return;
    }

    let mut group = c.benchmark_group("glob_simulation_medium");
    group.sample_size(30);

    let js_regex = Regex::new(r"\.js$").unwrap();
    group.bench_function("star_star_js", |b| {
        b.iter(|| {
            let results: Vec<_> = WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
                .filter(|e| {
                    e.path()
                        .to_str()
                        .map(|s| js_regex.is_match(s))
                        .unwrap_or(false)
                })
                .map(|e| e.path().to_path_buf())
                .collect();
            black_box(results)
        })
    });

    // With early termination on directory names (simulating ignore)
    group.bench_function("with_dir_filter", |b| {
        b.iter(|| {
            let results: Vec<_> = WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_entry(|e| {
                    // Skip directories starting with "level4" or deeper
                    !e.file_name()
                        .to_str()
                        .map(|s| s.starts_with("level4"))
                        .unwrap_or(false)
                })
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
                .filter(|e| {
                    e.path()
                        .to_str()
                        .map(|s| js_regex.is_match(s))
                        .unwrap_or(false)
                })
                .map(|e| e.path().to_path_buf())
                .collect();
            black_box(results)
        })
    });

    group.finish();
}

/// Benchmark result collection strategies
fn bench_result_collection(c: &mut Criterion) {
    let fixture = PathBuf::from("benches/fixtures/small");

    if !fixture.exists() {
        eprintln!("Skipping result collection benchmarks - fixtures not found");
        return;
    }

    let mut group = c.benchmark_group("result_collection");
    group.sample_size(100);

    // Collect to Vec<PathBuf>
    group.bench_function("collect_pathbuf", |b| {
        b.iter(|| {
            let results: Vec<PathBuf> = WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
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
                .filter(|e| e.file_type().is_file())
                .map(|e| e.path().to_string_lossy().into_owned())
                .collect();
            black_box(results)
        })
    });

    // Collect with pre-allocation
    group.bench_function("collect_preallocated", |b| {
        b.iter(|| {
            let mut results: Vec<String> = Vec::with_capacity(400); // Approximate
            for entry in WalkDir::new(black_box(&fixture)) {
                if let Ok(e) = entry {
                    if e.file_type().is_file() {
                        results.push(e.path().to_string_lossy().into_owned());
                    }
                }
            }
            black_box(results)
        })
    });

    // Just count (no allocation)
    group.bench_function("count_only", |b| {
        b.iter(|| {
            let count: usize = WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
                .count();
            black_box(count)
        })
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_walkdir_raw,
    bench_walkdir_depth,
    bench_pattern_matching,
    bench_path_operations,
    bench_glob_simulation,
    bench_glob_simulation_medium,
    bench_result_collection,
);

criterion_main!(benches);
