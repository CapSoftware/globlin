//! Benchmark comparison of different directory walking libraries
//!
//! This benchmark evaluates:
//! 1. walkdir - Simple, solid, single-threaded
//! 2. jwalk - Parallel walking with rayon
//! 3. ignore - Respects .gitignore patterns
//!
//! Run with: cargo bench --bench walker_comparison
//!
//! Fixtures must be generated first using `node benches/setup-fixtures.js`

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::path::PathBuf;

/// Count files in a directory for throughput calculation
fn count_files(path: &PathBuf) -> u64 {
    walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .count() as u64
}

/// Benchmark walkdir library
fn bench_walkdir(c: &mut Criterion) {
    let mut group = c.benchmark_group("walkdir");

    for (size, sample_size) in [("small", 100), ("medium", 30), ("large", 10)] {
        let fixture = PathBuf::from(format!("benches/fixtures/{}", size));

        if !fixture.exists() {
            eprintln!(
                "Skipping {} - fixtures not found. Run: node benches/setup-fixtures.js",
                size
            );
            continue;
        }

        let file_count = count_files(&fixture);
        group.throughput(Throughput::Elements(file_count));
        group.sample_size(sample_size);

        // Walk all entries
        group.bench_with_input(
            BenchmarkId::new("walk_all", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let results: Vec<_> = walkdir::WalkDir::new(black_box(fixture))
                        .into_iter()
                        .filter_map(|e| e.ok())
                        .map(|e| e.path().to_path_buf())
                        .collect();
                    black_box(results)
                })
            },
        );

        // Walk files only
        group.bench_with_input(
            BenchmarkId::new("walk_files", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let results: Vec<_> = walkdir::WalkDir::new(black_box(fixture))
                        .into_iter()
                        .filter_map(|e| e.ok())
                        .filter(|e| e.file_type().is_file())
                        .map(|e| e.path().to_path_buf())
                        .collect();
                    black_box(results)
                })
            },
        );

        // Walk with extension filter (simulating glob)
        group.bench_with_input(
            BenchmarkId::new("walk_js_files", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let results: Vec<_> = walkdir::WalkDir::new(black_box(fixture))
                        .into_iter()
                        .filter_map(|e| e.ok())
                        .filter(|e| {
                            e.file_type().is_file()
                                && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                        })
                        .map(|e| e.path().to_path_buf())
                        .collect();
                    black_box(results)
                })
            },
        );
    }

    group.finish();
}

/// Benchmark jwalk library (parallel walking)
fn bench_jwalk(c: &mut Criterion) {
    let mut group = c.benchmark_group("jwalk");

    for (size, sample_size) in [("small", 100), ("medium", 30), ("large", 10)] {
        let fixture = PathBuf::from(format!("benches/fixtures/{}", size));

        if !fixture.exists() {
            continue;
        }

        let file_count = count_files(&fixture);
        group.throughput(Throughput::Elements(file_count));
        group.sample_size(sample_size);

        // Walk all entries (default parallelism)
        group.bench_with_input(
            BenchmarkId::new("walk_all", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let results: Vec<_> = jwalk::WalkDir::new(black_box(fixture))
                        .into_iter()
                        .filter_map(|e| e.ok())
                        .map(|e| e.path())
                        .collect();
                    black_box(results)
                })
            },
        );

        // Walk files only
        group.bench_with_input(
            BenchmarkId::new("walk_files", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let results: Vec<_> = jwalk::WalkDir::new(black_box(fixture))
                        .into_iter()
                        .filter_map(|e| e.ok())
                        .filter(|e| e.file_type().is_file())
                        .map(|e| e.path())
                        .collect();
                    black_box(results)
                })
            },
        );

        // Walk with extension filter
        group.bench_with_input(
            BenchmarkId::new("walk_js_files", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let results: Vec<_> = jwalk::WalkDir::new(black_box(fixture))
                        .into_iter()
                        .filter_map(|e| e.ok())
                        .filter(|e| {
                            e.file_type().is_file()
                                && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                        })
                        .map(|e| e.path())
                        .collect();
                    black_box(results)
                })
            },
        );

        // Test with explicit parallelism settings
        group.bench_with_input(
            BenchmarkId::new("walk_parallel_4", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let results: Vec<_> = jwalk::WalkDir::new(black_box(fixture))
                        .parallelism(jwalk::Parallelism::RayonNewPool(4))
                        .into_iter()
                        .filter_map(|e| e.ok())
                        .filter(|e| {
                            e.file_type().is_file()
                                && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                        })
                        .map(|e| e.path())
                        .collect();
                    black_box(results)
                })
            },
        );

        // Serial mode (for comparison)
        group.bench_with_input(
            BenchmarkId::new("walk_serial", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let results: Vec<_> = jwalk::WalkDir::new(black_box(fixture))
                        .parallelism(jwalk::Parallelism::Serial)
                        .into_iter()
                        .filter_map(|e| e.ok())
                        .filter(|e| {
                            e.file_type().is_file()
                                && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                        })
                        .map(|e| e.path())
                        .collect();
                    black_box(results)
                })
            },
        );
    }

    group.finish();
}

/// Benchmark ignore library (gitignore-aware walking)
fn bench_ignore(c: &mut Criterion) {
    let mut group = c.benchmark_group("ignore");

    for (size, sample_size) in [("small", 100), ("medium", 30), ("large", 10)] {
        let fixture = PathBuf::from(format!("benches/fixtures/{}", size));

        if !fixture.exists() {
            continue;
        }

        let file_count = count_files(&fixture);
        group.throughput(Throughput::Elements(file_count));
        group.sample_size(sample_size);

        // Walk all entries (standard mode, respects gitignore)
        group.bench_with_input(
            BenchmarkId::new("walk_standard", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let walker = ignore::WalkBuilder::new(black_box(fixture)).build();
                    let results: Vec<_> = walker
                        .filter_map(|e| e.ok())
                        .map(|e| e.path().to_path_buf())
                        .collect();
                    black_box(results)
                })
            },
        );

        // Walk with gitignore disabled (raw mode)
        group.bench_with_input(
            BenchmarkId::new("walk_no_gitignore", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let walker = ignore::WalkBuilder::new(black_box(fixture))
                        .git_ignore(false)
                        .git_global(false)
                        .git_exclude(false)
                        .build();
                    let results: Vec<_> = walker
                        .filter_map(|e| e.ok())
                        .map(|e| e.path().to_path_buf())
                        .collect();
                    black_box(results)
                })
            },
        );

        // Walk with standard mode disabled (no hidden filtering)
        group.bench_with_input(
            BenchmarkId::new("walk_with_hidden", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let walker = ignore::WalkBuilder::new(black_box(fixture))
                        .hidden(false)
                        .build();
                    let results: Vec<_> = walker
                        .filter_map(|e| e.ok())
                        .map(|e| e.path().to_path_buf())
                        .collect();
                    black_box(results)
                })
            },
        );

        // Parallel walk (ignore supports parallelism)
        group.bench_with_input(
            BenchmarkId::new("walk_parallel", size),
            &fixture,
            |b, fixture| {
                b.iter(|| {
                    let walker = ignore::WalkBuilder::new(black_box(fixture))
                        .threads(num_cpus::get())
                        .build_parallel();
                    let results = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
                    let results_clone = results.clone();
                    walker.run(|| {
                        let results = results_clone.clone();
                        Box::new(move |entry| {
                            if let Ok(e) = entry {
                                results.lock().unwrap().push(e.path().to_path_buf());
                            }
                            ignore::WalkState::Continue
                        })
                    });
                    let final_results = std::sync::Arc::try_unwrap(results)
                        .unwrap()
                        .into_inner()
                        .unwrap();
                    black_box(final_results)
                })
            },
        );
    }

    group.finish();
}

/// Direct comparison benchmark across all libraries
fn bench_comparison(c: &mut Criterion) {
    let mut group = c.benchmark_group("walker_comparison");

    // Only test on large fixture for meaningful comparison
    let fixture = PathBuf::from("benches/fixtures/large");
    if !fixture.exists() {
        eprintln!("Skipping comparison - large fixtures not found");
        return;
    }

    let file_count = count_files(&fixture);
    group.throughput(Throughput::Elements(file_count));
    group.sample_size(10);

    // walkdir
    group.bench_function("walkdir_large", |b| {
        b.iter(|| {
            let results: Vec<_> = walkdir::WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_type().is_file()
                        && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                })
                .map(|e| e.path().to_path_buf())
                .collect();
            black_box(results)
        })
    });

    // jwalk (default parallelism)
    group.bench_function("jwalk_large", |b| {
        b.iter(|| {
            let results: Vec<_> = jwalk::WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_type().is_file()
                        && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                })
                .map(|e| e.path())
                .collect();
            black_box(results)
        })
    });

    // jwalk serial (for fair comparison with walkdir)
    group.bench_function("jwalk_serial_large", |b| {
        b.iter(|| {
            let results: Vec<_> = jwalk::WalkDir::new(black_box(&fixture))
                .parallelism(jwalk::Parallelism::Serial)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_type().is_file()
                        && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                })
                .map(|e| e.path())
                .collect();
            black_box(results)
        })
    });

    // ignore (no gitignore to match others)
    group.bench_function("ignore_large", |b| {
        b.iter(|| {
            let walker = ignore::WalkBuilder::new(black_box(&fixture))
                .git_ignore(false)
                .git_global(false)
                .git_exclude(false)
                .hidden(false)
                .build();
            let results: Vec<_> = walker
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_type().map(|ft| ft.is_file()).unwrap_or(false)
                        && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                })
                .map(|e| e.path().to_path_buf())
                .collect();
            black_box(results)
        })
    });

    // ignore parallel
    group.bench_function("ignore_parallel_large", |b| {
        b.iter(|| {
            let walker = ignore::WalkBuilder::new(black_box(&fixture))
                .git_ignore(false)
                .git_global(false)
                .git_exclude(false)
                .hidden(false)
                .threads(num_cpus::get())
                .build_parallel();
            let results = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
            let results_clone = results.clone();
            walker.run(|| {
                let results = results_clone.clone();
                Box::new(move |entry| {
                    if let Ok(e) = entry {
                        if e.file_type().map(|ft| ft.is_file()).unwrap_or(false)
                            && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                        {
                            results.lock().unwrap().push(e.path().to_path_buf());
                        }
                    }
                    ignore::WalkState::Continue
                })
            });
            let final_results = std::sync::Arc::try_unwrap(results)
                .unwrap()
                .into_inner()
                .unwrap();
            black_box(final_results)
        })
    });

    group.finish();
}

/// Test memory efficiency and API ergonomics
fn bench_api_ergonomics(c: &mut Criterion) {
    let mut group = c.benchmark_group("api_ergonomics");

    let fixture = PathBuf::from("benches/fixtures/medium");
    if !fixture.exists() {
        return;
    }

    group.sample_size(30);

    // Test filter_entry for early pruning (walkdir)
    group.bench_function("walkdir_filter_entry", |b| {
        b.iter(|| {
            let results: Vec<_> = walkdir::WalkDir::new(black_box(&fixture))
                .into_iter()
                .filter_entry(|e| {
                    // Skip level4+ directories
                    !e.file_name()
                        .to_str()
                        .map(|s| s.starts_with("level4"))
                        .unwrap_or(false)
                })
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_type().is_file()
                        && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                })
                .map(|e| e.path().to_path_buf())
                .collect();
            black_box(results)
        })
    });

    // Test process_read_dir for early pruning (jwalk)
    group.bench_function("jwalk_process_read_dir", |b| {
        b.iter(|| {
            let results: Vec<_> = jwalk::WalkDir::new(black_box(&fixture))
                .process_read_dir(|_, _, _, children| {
                    // Remove level4+ directories from traversal
                    children.retain(|child| {
                        child
                            .as_ref()
                            .map(|e| {
                                !e.file_name()
                                    .to_str()
                                    .map(|s| s.starts_with("level4"))
                                    .unwrap_or(false)
                            })
                            .unwrap_or(true)
                    });
                })
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_type().is_file()
                        && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                })
                .map(|e| e.path())
                .collect();
            black_box(results)
        })
    });

    // Test max_depth (walkdir)
    group.bench_function("walkdir_max_depth_3", |b| {
        b.iter(|| {
            let results: Vec<_> = walkdir::WalkDir::new(black_box(&fixture))
                .max_depth(3)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_type().is_file()
                        && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                })
                .map(|e| e.path().to_path_buf())
                .collect();
            black_box(results)
        })
    });

    // Test max_depth (jwalk)
    group.bench_function("jwalk_max_depth_3", |b| {
        b.iter(|| {
            let results: Vec<_> = jwalk::WalkDir::new(black_box(&fixture))
                .max_depth(3)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_type().is_file()
                        && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                })
                .map(|e| e.path())
                .collect();
            black_box(results)
        })
    });

    // Test follow_symlinks (walkdir)
    group.bench_function("walkdir_follow_symlinks", |b| {
        b.iter(|| {
            let results: Vec<_> = walkdir::WalkDir::new(black_box(&fixture))
                .follow_links(true)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_type().is_file()
                        && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                })
                .map(|e| e.path().to_path_buf())
                .collect();
            black_box(results)
        })
    });

    // Test follow_symlinks (jwalk)
    group.bench_function("jwalk_follow_symlinks", |b| {
        b.iter(|| {
            let results: Vec<_> = jwalk::WalkDir::new(black_box(&fixture))
                .follow_links(true)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_type().is_file()
                        && e.path().extension().map(|ext| ext == "js").unwrap_or(false)
                })
                .map(|e| e.path())
                .collect();
            black_box(results)
        })
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_walkdir,
    bench_jwalk,
    bench_ignore,
    bench_comparison,
    bench_api_ergonomics,
);

criterion_main!(benches);
