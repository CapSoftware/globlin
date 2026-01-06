//! Profiling binary for globlin
//!
//! This binary is designed to be run with cargo-flamegraph to profile
//! the glob implementation on real filesystem operations.
//!
//! Usage:
//!   cargo flamegraph --bin profile_glob -- [fixture_size] [iterations]
//!
//! Example:
//!   cargo flamegraph --bin profile_glob -- large 10
//!
//! Fixture sizes: small (303 files), medium (20k files), large (100k files)
//!
//! This binary reimplements the glob logic using only walkdir + regex to avoid
//! NAPI dependencies that require Node.js runtime.

use std::env;
use std::path::PathBuf;
use std::time::Instant;

use regex::Regex;
use walkdir::WalkDir;

fn main() {
    let args: Vec<String> = env::args().collect();

    let fixture_size = args.get(1).map(|s| s.as_str()).unwrap_or("medium");
    let iterations: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(5);

    let fixture_path = PathBuf::from(format!("benches/fixtures/{fixture_size}"));

    if !fixture_path.exists() {
        eprintln!("Error: Fixture not found at {fixture_path:?}");
        eprintln!("Run: node benches/setup-fixtures.js");
        std::process::exit(1);
    }

    eprintln!("=== Globlin Profiling ===");
    eprintln!("Fixture: {fixture_path:?} ({fixture_size})");
    eprintln!("Iterations: {iterations}");
    eprintln!();

    // Define test patterns - glob pattern and equivalent regex
    // These represent common real-world patterns
    let patterns: Vec<(&str, &str)> = vec![
        ("**/*.js", r"\.js$"),
        ("**/*.ts", r"\.ts$"),
        ("*.txt", r"^[^/]*\.txt$"),
        ("level0/**/*.js", r"^level0/.*\.js$"),
        ("**/*.{js,ts}", r"\.(js|ts)$"),
        ("**/level1/**/*.ts", r"level1/.*\.ts$"),
        ("**/*[0-9].js", r"[0-9]\.js$"),
        ("**/file?.js", r"file.\.js$"),
        ("**", r".*"),
        ("**/*", r".+"),
    ];

    let mut total_files = 0usize;
    let mut total_time_ms = 0f64;

    for (glob_pattern, regex_pattern) in &patterns {
        eprintln!("--- Pattern: {glob_pattern} ---");

        let regex = Regex::new(regex_pattern).expect("Invalid regex");
        let mut pattern_total_time = 0f64;
        let mut last_result_count = 0;

        for i in 0..iterations {
            let start = Instant::now();

            let results = run_glob(&fixture_path, &regex);

            let elapsed = start.elapsed();
            let elapsed_ms = elapsed.as_secs_f64() * 1000.0;

            pattern_total_time += elapsed_ms;
            last_result_count = results.len();

            if i == 0 {
                eprintln!(
                    "  Run {}: {:.2}ms ({} files)",
                    i + 1,
                    elapsed_ms,
                    results.len()
                );
            }
        }

        let avg_ms = pattern_total_time / iterations as f64;
        eprintln!("  Average: {avg_ms:.2}ms ({last_result_count} files)");
        eprintln!();

        total_files += last_result_count;
        total_time_ms += pattern_total_time;
    }

    let total_patterns = patterns.len();
    let total_iterations = patterns.len() * iterations;
    eprintln!("=== Summary ===");
    eprintln!("Total patterns: {total_patterns}");
    eprintln!("Total iterations: {total_iterations}");
    eprintln!("Total files matched: {total_files}");
    eprintln!("Total time: {total_time_ms:.2}ms");
    eprintln!(
        "Avg time per pattern-iteration: {:.2}ms",
        total_time_ms / (patterns.len() * iterations) as f64
    );
}

/// Run a glob pattern against a fixture directory
/// Simulates what globlin does: walk directory tree + regex match
fn run_glob(cwd: &PathBuf, regex: &Regex) -> Vec<String> {
    WalkDir::new(cwd)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            if let Ok(rel) = e.path().strip_prefix(cwd) {
                let path_str = rel.to_string_lossy();
                regex.is_match(&path_str)
            } else {
                false
            }
        })
        .map(|e| {
            e.path()
                .strip_prefix(cwd)
                .unwrap_or(e.path())
                .to_string_lossy()
                .into_owned()
        })
        .collect()
}
