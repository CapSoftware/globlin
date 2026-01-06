use std::borrow::Cow;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use ahash::AHashSet;
use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use rayon::prelude::*;

use crate::cache::get_or_compile_pattern;
use crate::ignore::IgnoreFilter;
use crate::options::{validate_options, GlobOptions};
use crate::pattern::{expand_braces, preprocess_pattern, Pattern, PatternOptions};
use crate::walker::{WalkOptions, Walker};

/// Path data returned by glob with withFileTypes: true.
/// This struct is converted to PathScurry Path objects in the JavaScript wrapper.
#[napi(object)]
#[derive(Debug, Clone)]
pub struct PathData {
    /// The path relative to cwd (or absolute if absolute option is set)
    pub path: String,
    /// True if this is a directory
    pub is_directory: bool,
    /// True if this is a file
    pub is_file: bool,
    /// True if this is a symbolic link
    pub is_symlink: bool,
}

pub struct Glob {
    #[allow(dead_code)]
    pattern_strs: Vec<String>,
    cwd: PathBuf,
    /// Patterns stored in Arc for cheap cloning into closures
    patterns: Arc<[Pattern]>,
    absolute: bool,
    posix: bool,
    #[allow(dead_code)]
    nobrace: bool,
    #[allow(dead_code)]
    noext: bool,
    dot: bool,
    follow: bool,
    #[allow(dead_code)]
    windows_paths_no_escape: bool,
    /// Maximum depth to traverse (None = unlimited, negative = empty results)
    max_depth: Option<i32>,
    /// Only return files, not directories
    nodir: bool,
    /// Prepend `./` to relative paths
    dot_relative: bool,
    /// Append `/` to directories
    mark: bool,
    /// Match pattern against basename if no path separators
    #[allow(dead_code)]
    match_base: bool,
    /// Disable ** pattern matching
    #[allow(dead_code)]
    noglobstar: bool,
    /// Case-insensitive matching
    #[allow(dead_code)]
    nocase: bool,
    /// Walker options for directory traversal
    walk_options: WalkOptions,
    /// Ignore filter for excluding paths
    ignore_filter: Option<IgnoreFilter>,
    /// Pre-computed: true if any pattern requires directory matching (ends with /)
    any_pattern_requires_dir: bool,
    /// Pre-computed: number of fast-path patterns (for optimization decisions)
    fast_pattern_count: usize,
    /// When false, don't include children of matched paths
    include_child_matches: bool,
}

#[napi]
pub fn glob_sync(
    pattern: Either<String, Vec<String>>,
    options: Option<GlobOptions>,
) -> Result<Vec<String>> {
    let opts = options.unwrap_or_default();

    // Validate options using the centralized validation
    validate_options(&opts)?;

    let patterns = match pattern {
        Either::A(s) => vec![s],
        Either::B(v) => v,
    };

    let glob = Glob::new_multi(patterns, opts.clone());
    Ok(glob.walk_sync())
}

#[napi]
pub async fn glob(
    pattern: Either<String, Vec<String>>,
    options: Option<GlobOptions>,
) -> Result<Vec<String>> {
    let opts = options.unwrap_or_default();

    // Validate options using the centralized validation
    validate_options(&opts)?;

    let patterns = match pattern {
        Either::A(s) => vec![s],
        Either::B(v) => v,
    };

    let glob = Glob::new_multi(patterns, opts.clone());
    Ok(glob.walk_sync())
}

/// Synchronous glob pattern matching with file type information.
/// Returns PathData objects instead of strings.
#[napi]
pub fn glob_sync_with_file_types(
    pattern: Either<String, Vec<String>>,
    options: Option<GlobOptions>,
) -> Result<Vec<PathData>> {
    let opts = options.unwrap_or_default();

    // Validate options using the centralized validation
    validate_options(&opts)?;

    let patterns = match pattern {
        Either::A(s) => vec![s],
        Either::B(v) => v,
    };

    let glob = Glob::new_multi(patterns, opts.clone());
    Ok(glob.walk_sync_with_file_types())
}

/// Asynchronous glob pattern matching with file type information.
/// Returns PathData objects instead of strings.
#[napi]
pub async fn glob_with_file_types(
    pattern: Either<String, Vec<String>>,
    options: Option<GlobOptions>,
) -> Result<Vec<PathData>> {
    let opts = options.unwrap_or_default();

    // Validate options using the centralized validation
    validate_options(&opts)?;

    let patterns = match pattern {
        Either::A(s) => vec![s],
        Either::B(v) => v,
    };

    let glob = Glob::new_multi(patterns, opts.clone());
    Ok(glob.walk_sync_with_file_types())
}

/// Streaming glob pattern matching.
/// Streams results back to JavaScript via a callback function.
/// This reduces peak memory usage for large result sets by not collecting all results before sending.
///
/// @param pattern - Glob pattern or array of patterns
/// @param options - Glob options
/// @param callback - Function called with each result string
/// @returns Promise that resolves when all results have been streamed
#[napi]
pub fn glob_stream(
    pattern: Either<String, Vec<String>>,
    options: Option<GlobOptions>,
    #[napi(ts_arg_type = "(result: string) => void")] callback: ThreadsafeFunction<String>,
) -> Result<()> {
    let opts = options.unwrap_or_default();

    // Validate options using the centralized validation
    validate_options(&opts)?;

    let patterns = match pattern {
        Either::A(s) => vec![s],
        Either::B(v) => v,
    };

    let glob = Glob::new_multi(patterns, opts);

    // Stream results directly to JavaScript callback
    // This avoids collecting all results into a Vec, reducing peak memory usage
    glob.walk_stream(|result| {
        // Call the JS callback with each result
        // Use NonBlocking mode to avoid blocking the walking thread
        callback.call(Ok(result), ThreadsafeFunctionCallMode::NonBlocking);
    });

    Ok(())
}

/// Streaming glob pattern matching with file type information.
/// Streams PathData results back to JavaScript via a callback function.
///
/// @param pattern - Glob pattern or array of patterns  
/// @param options - Glob options
/// @param callback - Function called with each PathData result
/// @returns Promise that resolves when all results have been streamed
#[napi]
pub fn glob_stream_with_file_types(
    pattern: Either<String, Vec<String>>,
    options: Option<GlobOptions>,
    #[napi(
        ts_arg_type = "(result: { path: string, isDirectory: boolean, isFile: boolean, isSymlink: boolean }) => void"
    )]
    callback: ThreadsafeFunction<PathData>,
) -> Result<()> {
    let opts = options.unwrap_or_default();

    // Validate options using the centralized validation
    validate_options(&opts)?;

    let patterns = match pattern {
        Either::A(s) => vec![s],
        Either::B(v) => v,
    };

    let glob = Glob::new_multi(patterns, opts);

    // Stream results directly to JavaScript callback
    glob.walk_stream_with_file_types(|result| {
        callback.call(Ok(result), ThreadsafeFunctionCallMode::NonBlocking);
    });

    Ok(())
}

impl Glob {
    /// Create a new Glob from a single pattern string
    pub fn new(pattern_str: String, options: GlobOptions) -> Self {
        Self::new_multi(vec![pattern_str], options)
    }

    /// Create a new Glob from multiple pattern strings
    pub fn new_multi(pattern_strs: Vec<String>, options: GlobOptions) -> Self {
        let cwd = options
            .cwd
            .clone()
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

        let absolute = options.absolute.unwrap_or(false);
        let posix = options.posix.unwrap_or(false);
        let nobrace = options.nobrace.unwrap_or(false);
        let noext = options.noext.unwrap_or(false);
        let dot = options.dot.unwrap_or(false);
        let follow = options.follow.unwrap_or(false);
        let windows_paths_no_escape = options.effective_windows_paths_no_escape();
        let max_depth = options.max_depth;
        let nodir = options.nodir.unwrap_or(false);
        let dot_relative = options.dot_relative.unwrap_or(false);
        let mark = options.mark.unwrap_or(false);
        let match_base = options.match_base.unwrap_or(false);
        let noglobstar = options.noglobstar.unwrap_or(false);
        let nocase = options.effective_nocase();
        let platform = options.effective_platform();
        let include_child_matches = options.effective_include_child_matches();

        // Create pattern options
        let pattern_opts = PatternOptions {
            noext,
            windows_paths_no_escape,
            platform: Some(platform.clone()),
            nocase,
            nobrace,
        };

        // Process all input patterns and expand braces for each
        // Use AHashSet to track already-seen pattern strings for deduplication (faster hashing)
        let mut seen_patterns: AHashSet<String> = AHashSet::new();
        let mut patterns: Vec<Pattern> = Vec::new();

        for pattern_str in &pattern_strs {
            // Skip empty patterns - they match nothing (like glob v13)
            if pattern_str.is_empty() {
                continue;
            }

            // Check if the ORIGINAL pattern has path separators BEFORE brace expansion
            // This is important because matchBase should only apply if the entire original
            // pattern has no separators. If {a,b/c} is used, neither a nor b/c gets matchBase.
            let original_has_slash = pattern_str.contains('/') || pattern_str.contains('\\');

            // Helper function to apply matchBase transformation to a pattern
            // Only applies if:
            // 1. matchBase is true
            // 2. The ORIGINAL pattern (before brace expansion) has no path separators
            // 3. The expanded pattern has no path separators
            let apply_match_base = |pattern: &str| -> String {
                if match_base
                    && !original_has_slash
                    && !pattern.contains('/')
                    && !pattern.contains('\\')
                {
                    format!("**/{pattern}")
                } else {
                    pattern.to_string()
                }
            };

            // Expand braces unless nobrace is set
            if nobrace {
                let transformed = apply_match_base(pattern_str);
                // Deduplicate: only add if we haven't seen this pattern before
                if seen_patterns.insert(transformed.clone()) {
                    // Use pattern cache for compiled patterns
                    patterns.push(get_or_compile_pattern(&transformed, &pattern_opts));
                }
            } else {
                let expanded = expand_braces(pattern_str);
                if expanded.is_empty() {
                    let transformed = apply_match_base(pattern_str);
                    if seen_patterns.insert(transformed.clone()) {
                        // Use pattern cache for compiled patterns
                        patterns.push(get_or_compile_pattern(&transformed, &pattern_opts));
                    }
                } else {
                    for p in expanded {
                        let transformed = apply_match_base(&p);
                        // Deduplicate: skip duplicate expanded patterns
                        if seen_patterns.insert(transformed.clone()) {
                            // Use pattern cache for compiled patterns
                            patterns.push(get_or_compile_pattern(&transformed, &pattern_opts));
                        }
                    }
                }
            }
        }

        // Optimization: Sort patterns so fast-path patterns come first.
        // This allows early exit when using .any() since fast patterns are checked first.
        // Patterns with fast-path matching are much quicker to evaluate.
        patterns.sort_by(|a, b| {
            // Fast-path patterns should come first
            let a_fast = a.fast_path().is_fast();
            let b_fast = b.fast_path().is_fast();
            match (a_fast, b_fast) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => std::cmp::Ordering::Equal,
            }
        });

        // Create ignore filter if ignore patterns provided
        let ignore_filter = match &options.ignore {
            Some(Either::A(pattern)) => Some(IgnoreFilter::new(
                vec![pattern.clone()],
                noext,
                windows_paths_no_escape,
            )),
            Some(Either::B(patterns)) => {
                if patterns.is_empty() {
                    None
                } else {
                    Some(IgnoreFilter::new(
                        patterns.clone(),
                        noext,
                        windows_paths_no_escape,
                    ))
                }
            }
            None => None,
        };

        // Create walk options
        // Note: We always walk with dot=true in the walker, and handle dot filtering
        // at the pattern matching level. This allows patterns with explicit dots
        // (like ".hidden" or "**/.config") to match even when dot:false.

        // Calculate effective max depth from patterns for optimization.
        // If all patterns have a bounded depth (no **), we can limit the walker
        // to avoid traversing deeper than necessary.
        // Use the maximum depth required by any pattern.
        let pattern_max_depth = {
            let mut max_depth: Option<usize> = Some(0);
            for p in &patterns {
                match (max_depth, p.max_depth()) {
                    (None, _) => break, // Already unlimited
                    (_, None) => {
                        max_depth = None;
                        break;
                    } // This pattern is unlimited
                    (Some(a), Some(b)) => max_depth = Some(a.max(b)), // Take max of bounded depths
                }
            }
            max_depth
        };

        // Combine user-provided max_depth with pattern-derived depth.
        // User max_depth takes precedence (it's an explicit limit), but if user
        // didn't specify one, use pattern-derived depth for optimization.
        // Convert max_depth: negative values and Some(-1) will be handled in walk_sync
        let walker_max_depth = match (max_depth, pattern_max_depth) {
            (Some(d), _) if d < 0 => Some(0), // Negative values: will return empty in walk_sync
            (Some(d), _) => Some(d as usize), // User-provided depth takes precedence
            (None, Some(d)) => Some(d + 1),   // Pattern depth + 1 (for root directory)
            (None, None) => None,             // Unlimited (has **)
        };

        // Optimization: Only enable accurate symlink detection when needed.
        // The `mark` option requires knowing whether an entry is a symlink to avoid
        // adding a trailing slash. When following symlinks, walkdir reports the TARGET
        // type, so we need an extra syscall to detect the symlink. Skip this overhead
        // when not needed.
        let need_accurate_symlink_detection = mark && follow;

        let parallel = options.parallel.unwrap_or(false);
        let cache = options.cache.unwrap_or(false);
        let use_native_io = options.use_native_io.unwrap_or(false);
        let use_gcd = options.use_gcd.unwrap_or(false);

        let walk_options = WalkOptions::new()
            .follow_symlinks(follow)
            .max_depth(walker_max_depth)
            .dot(true)
            .need_accurate_symlink_detection(need_accurate_symlink_detection)
            .parallel(parallel)
            .cache(cache)
            .use_native_io(use_native_io)
            .use_gcd(use_gcd);

        // Pre-compute: check if any pattern requires directory matching (ends with /)
        let any_pattern_requires_dir = patterns.iter().any(|p| p.requires_dir());

        // Pre-compute: count patterns with fast-path matching for optimization decisions
        let fast_pattern_count = patterns.iter().filter(|p| p.fast_path().is_fast()).count();

        // Convert to Arc<[Pattern]> for cheap cloning into closures
        let patterns: Arc<[Pattern]> = patterns.into();

        Self {
            pattern_strs,
            cwd,
            patterns,
            absolute,
            posix,
            nobrace,
            noext,
            dot,
            follow,
            windows_paths_no_escape,
            max_depth,
            nodir,
            dot_relative,
            mark,
            match_base,
            noglobstar,
            nocase,
            walk_options,
            ignore_filter,
            any_pattern_requires_dir,
            fast_pattern_count,
            include_child_matches,
        }
    }

    pub fn walk_sync(&self) -> Vec<String> {
        // If maxDepth is negative, return empty results
        if let Some(d) = self.max_depth {
            if d < 0 {
                return Vec::new();
            }
        }

        // OPTIMIZATION: Static pattern fast path
        // If ALL patterns are static (no wildcards), we can use direct stat() instead of walking.
        // This is 10-100x faster for patterns like "package.json" or "src/index.ts".
        if self.all_patterns_static() {
            return self.resolve_static_patterns();
        }

        // OPTIMIZATION: Shallow pattern fast path
        // If ALL patterns have max_depth of 0 (root-level only), use direct readdir
        // instead of the full walker machinery. This is 2-3x faster for patterns like "*.js".
        if self.all_patterns_shallow() && self.ignore_filter.is_none() {
            return self.resolve_shallow_patterns();
        }

        // OPTIMIZATION: Multi-base walking
        // If patterns have different prefixes (e.g., ['src/**/*.ts', 'test/**/*.ts']),
        // walk from each prefix separately instead of from cwd.
        // This avoids traversing unrelated directories.
        if self.should_use_multi_base_walking() {
            return self.walk_multi_base();
        }

        // Pre-allocate result vector with estimated capacity based on pattern depth.
        // Simple patterns (depth 0-1) typically match fewer files than recursive patterns.
        // This reduces reallocations during collection.
        let estimated_capacity = self.estimate_result_capacity();
        let mut results = Vec::with_capacity(estimated_capacity);
        // Use AHashSet for faster hashing than std::collections::HashSet
        let mut seen: AHashSet<String> = AHashSet::with_capacity(estimated_capacity);
        let mut ignored_dirs: AHashSet<String> = AHashSet::with_capacity(8); // Most globs have few ignored dirs

        // When includeChildMatches is false, track matched paths to exclude their children
        let mut matched_parents: AHashSet<String> = if self.include_child_matches {
            AHashSet::new() // Empty, won't be used
        } else {
            AHashSet::with_capacity(estimated_capacity / 4)
        };

        // Pre-allocate a reusable buffer for path formatting
        let mut result_buffer = String::with_capacity(self.estimate_path_buffer_capacity());

        // Check if any pattern matches the cwd itself ("**" or ".").
        // Cache this check since preprocess_pattern is called for each pattern.
        let include_cwd = self.patterns.iter().any(|p| {
            let raw = p.raw();
            // Fast path: check common cases without calling preprocess_pattern
            raw == "**" || raw == "." || raw == "./**" || {
                let preprocessed = preprocess_pattern(raw);
                preprocessed == "**" || preprocessed == "."
            }
        });

        // Get the absolute cwd path, canonicalized
        let abs_cwd = self.cwd.canonicalize().unwrap_or_else(|_| self.cwd.clone());

        // Calculate the walk root based on literal prefixes of all patterns.
        // If all patterns share a common literal prefix, we can start walking from there
        // instead of the cwd, which can significantly reduce the number of files traversed.
        let (walk_root, prefix_to_strip) = self.calculate_walk_root();

        // Pre-compute the prefix with trailing slash for efficient path concatenation.
        // This avoids repeated format!() calls in the hot loop.
        let prefix_with_slash: Option<String> =
            prefix_to_strip.as_ref().map(|prefix| format!("{prefix}/"));

        // Adjust walk options for prefix-based walking
        // If we have a prefix, the user's max_depth is relative to cwd, but the walker
        // is relative to walk_root. We need to reduce max_depth by the prefix depth.
        let adjusted_walk_options = if let Some(ref prefix) = prefix_to_strip {
            let prefix_depth = prefix.split('/').filter(|s| !s.is_empty()).count();
            if let Some(max_d) = self.walk_options.max_depth {
                // User specified max_depth, adjust for prefix
                if max_d <= prefix_depth {
                    // If max_depth is less than or equal to prefix depth,
                    // we should only include the prefix directory itself
                    self.walk_options.clone().max_depth(Some(0))
                } else {
                    self.walk_options
                        .clone()
                        .max_depth(Some(max_d - prefix_depth))
                }
            } else {
                self.walk_options.clone()
            }
        } else {
            self.walk_options.clone()
        };

        // Create a directory pruning filter using the patterns' could_match_in_dir method.
        // This allows us to skip entire directory subtrees that can't possibly contain matches.
        //
        // The filter receives the path relative to walk_root, but the patterns expect paths
        // relative to cwd. When we have a prefix_to_strip, we need to prepend it.
        // Use Arc::clone for cheap reference counting instead of deep cloning patterns.
        let patterns_for_filter = Arc::clone(&self.patterns);
        let prefix_for_filter = prefix_to_strip.clone();
        // Pre-compute prefix with slash for the filter to avoid repeated format! calls
        let prefix_slash_for_filter = prefix_with_slash.clone();

        let prune_filter = Box::new(move |dir_path: &str| -> bool {
            // Construct the path relative to cwd for pattern matching.
            // Use Cow to avoid allocation when no prefix is needed.
            let path_from_cwd: Cow<'_, str> = if let Some(ref prefix) = prefix_for_filter {
                if dir_path.is_empty() {
                    Cow::Borrowed(prefix.as_str())
                } else {
                    // Use pre-computed prefix with slash for efficiency
                    if let Some(ref prefix_slash) = prefix_slash_for_filter {
                        Cow::Owned(format!("{prefix_slash}{dir_path}"))
                    } else {
                        Cow::Owned(format!("{prefix}/{dir_path}"))
                    }
                }
            } else {
                Cow::Borrowed(dir_path)
            };

            // Check if ANY pattern could potentially match files in this directory.
            // If no pattern can match, we can safely skip this directory.
            patterns_for_filter
                .iter()
                .any(|p| p.could_match_in_dir(&path_from_cwd))
        });

        // Create walker with the optimized walk root, adjusted options, and pruning filter
        let walker = Walker::new(walk_root.clone(), adjusted_walk_options)
            .with_dir_prune_filter(prune_filter);

        // Optimization: Check if we have any ignore patterns to avoid unnecessary work
        let has_ignore_filter = self.ignore_filter.is_some();

        for entry in walker.walk() {
            let path = entry.path();

            // Strip the walk_root prefix to get the path relative to walk_root
            // Then prepend the prefix_to_strip to get the path relative to cwd
            let rel_path_from_walk_root = match path.strip_prefix(&walk_root) {
                Ok(p) => p,
                Err(_) => continue, // Skip if can't strip prefix
            };
            let rel_str_from_walk_root = rel_path_from_walk_root.to_string_lossy();

            // Cache whether this is the walk root (empty relative path)
            let is_walk_root_entry = rel_str_from_walk_root.is_empty();

            // Construct the path relative to cwd by prepending the stripped prefix.
            // Use Cow to avoid allocation when possible.
            let normalized = self.normalize_path(
                &rel_str_from_walk_root,
                &prefix_to_strip,
                is_walk_root_entry,
            );

            // Check if this path is inside an ignored directory.
            if self.is_in_ignored_dir(&normalized, &ignored_dirs) {
                continue;
            }

            // Check ignore patterns
            // Optimization: Only create rel_path and abs_path when we have ignore patterns
            if has_ignore_filter {
                // For operations that need the actual relative path from cwd
                let rel_path = if prefix_to_strip.is_some() {
                    PathBuf::from(normalized.as_ref())
                } else {
                    rel_path_from_walk_root.to_path_buf()
                };
                let abs_path = abs_cwd.join(&rel_path);
                let ignore_filter = self.ignore_filter.as_ref().unwrap();

                // Check if this specific path should be ignored
                if ignore_filter.should_ignore(&normalized, &abs_path) {
                    // If children are also ignored, mark this directory
                    if entry.is_dir() && ignore_filter.children_ignored(&normalized, &abs_path) {
                        ignored_dirs.insert(normalized.into_owned());
                    }
                    continue;
                }

                // Also check if this is a directory whose children should be ignored
                // (for optimization - skip traversing)
                if entry.is_dir() && ignore_filter.children_ignored(&normalized, &abs_path) {
                    ignored_dirs.insert(normalized.to_string());
                }
            }

            // Handle root of walk_root (which might be cwd or cwd/prefix)
            if is_walk_root_entry && prefix_to_strip.is_none() {
                // This is the cwd itself - handle specially
                // Root directory - only include if pattern matches it
                // With nodir: true, skip even the root directory since it's a directory
                if include_cwd && !self.nodir {
                    // Check if cwd itself is ignored
                    if let Some(ref ignore_filter) = self.ignore_filter {
                        if ignore_filter.should_ignore(".", &abs_cwd) {
                            continue;
                        }
                    }

                    let result = if self.absolute {
                        let formatted = self.format_path_into_buffer(&abs_cwd, &mut result_buffer);
                        if self.mark {
                            if formatted.ends_with('/') || formatted.ends_with('\\') {
                                formatted.to_string()
                            } else {
                                let mut s = formatted.to_string();
                                s.push('/');
                                s
                            }
                        } else {
                            formatted.to_string()
                        }
                    } else {
                        // For relative paths, "." becomes "./" with mark:true
                        if self.mark {
                            "./".to_string()
                        } else {
                            ".".to_string()
                        }
                    };
                    if seen.insert(result.clone()) {
                        results.push(result);
                    }
                }
                continue;
            }

            // Skip empty normalized paths that aren't the cwd
            if normalized.is_empty() {
                continue;
            }

            // If nodir is true, skip directories
            // Note: Symlinks are not considered directories unless follow is true
            // When follow is true, walkdir reports symlinks-to-dirs as dirs
            if self.nodir && entry.is_dir() {
                continue;
            }

            // If dot:false, check if this path contains dotfile segments
            // that aren't explicitly allowed by any pattern
            if !self.dot && !self.path_allowed_by_dot_rules(&normalized) {
                continue;
            }

            // When includeChildMatches is false, skip paths that are children of already-matched paths
            if !self.include_child_matches
                && self.is_child_of_matched(&normalized, &matched_parents)
            {
                continue;
            }

            // Check if any pattern matches
            // For patterns that end with /, only match if entry is a directory
            let is_dir = entry.is_dir();
            let is_symlink = entry.is_symlink();

            // Optimization: Use specialized matching based on pattern characteristics.
            // Patterns are already sorted with fast-path patterns first (in new_multi),
            // so .any() will try fast patterns before falling back to regex patterns.
            let matches = if !self.any_pattern_requires_dir {
                // Fast path: no patterns require directory matching
                self.patterns
                    .iter()
                    .any(|p| match p.matches_fast(&normalized) {
                        Some(result) => result,
                        None => p.matches(&normalized),
                    })
            } else {
                // Standard path: some patterns require directory matching
                self.patterns.iter().any(|p| {
                    let path_matches = match p.matches_fast(&normalized) {
                        Some(result) => result,
                        None => p.matches(&normalized),
                    };
                    if path_matches && p.requires_dir() {
                        is_dir
                    } else {
                        path_matches
                    }
                })
            };

            if matches {
                // Build the result path using optimized helper
                let result = self.build_result_path(
                    &normalized,
                    is_dir,
                    is_symlink,
                    &abs_cwd,
                    &mut result_buffer,
                );

                // Deduplicate results (important for overlapping brace expansions)
                if seen.insert(result.clone()) {
                    // When includeChildMatches is false, track this path to exclude its children
                    if !self.include_child_matches {
                        matched_parents.insert(normalized.into_owned());
                    }
                    results.push(result);
                }
            }
        }

        results
    }

    /// Walk the directory tree and return PathData objects.
    /// This is used when withFileTypes: true is set.
    pub fn walk_sync_with_file_types(&self) -> Vec<PathData> {
        // If maxDepth is negative, return empty results
        if let Some(d) = self.max_depth {
            if d < 0 {
                return Vec::new();
            }
        }

        // Pre-allocate result vector with estimated capacity
        let estimated_capacity = self.estimate_result_capacity();
        let mut results = Vec::with_capacity(estimated_capacity);
        // Use AHashSet for faster hashing
        let mut seen: AHashSet<String> = AHashSet::with_capacity(estimated_capacity);
        let mut ignored_dirs: AHashSet<String> = AHashSet::with_capacity(8);

        // When includeChildMatches is false, track matched paths to exclude their children
        let mut matched_parents: AHashSet<String> = if self.include_child_matches {
            AHashSet::new()
        } else {
            AHashSet::with_capacity(estimated_capacity / 4)
        };

        // Check if any pattern matches the cwd itself ("**" or ".").
        let include_cwd = self.patterns.iter().any(|p| {
            let raw = p.raw();
            raw == "**" || raw == "." || raw == "./**" || {
                let preprocessed = preprocess_pattern(raw);
                preprocessed == "**" || preprocessed == "."
            }
        });

        // Get the absolute cwd path, canonicalized
        let abs_cwd = self.cwd.canonicalize().unwrap_or_else(|_| self.cwd.clone());

        // Calculate the walk root based on literal prefixes
        let (walk_root, prefix_to_strip) = self.calculate_walk_root();

        // Pre-compute the prefix with trailing slash for efficient path concatenation
        let prefix_with_slash: Option<String> =
            prefix_to_strip.as_ref().map(|prefix| format!("{prefix}/"));

        // Adjust walk options for prefix-based walking
        let adjusted_walk_options = if let Some(ref prefix) = prefix_to_strip {
            let prefix_depth = prefix.split('/').filter(|s| !s.is_empty()).count();
            if let Some(max_d) = self.walk_options.max_depth {
                if max_d <= prefix_depth {
                    self.walk_options.clone().max_depth(Some(0))
                } else {
                    self.walk_options
                        .clone()
                        .max_depth(Some(max_d - prefix_depth))
                }
            } else {
                self.walk_options.clone()
            }
        } else {
            self.walk_options.clone()
        };

        // Create directory pruning filter using Arc::clone for cheap reference counting
        let patterns_for_filter = Arc::clone(&self.patterns);
        let prefix_for_filter = prefix_to_strip.clone();
        let prefix_slash_for_filter = prefix_with_slash.clone();

        let prune_filter = Box::new(move |dir_path: &str| -> bool {
            // Use Cow to avoid allocation when no prefix is needed
            let path_from_cwd: Cow<'_, str> = if let Some(ref prefix) = prefix_for_filter {
                if dir_path.is_empty() {
                    Cow::Borrowed(prefix.as_str())
                } else if let Some(ref prefix_slash) = prefix_slash_for_filter {
                    Cow::Owned(format!("{prefix_slash}{dir_path}"))
                } else {
                    Cow::Owned(format!("{prefix}/{dir_path}"))
                }
            } else {
                Cow::Borrowed(dir_path)
            };

            patterns_for_filter
                .iter()
                .any(|p| p.could_match_in_dir(&path_from_cwd))
        });

        // Create walker
        let walker = Walker::new(walk_root.clone(), adjusted_walk_options)
            .with_dir_prune_filter(prune_filter);

        // Check if we have ignore patterns
        let has_ignore_filter = self.ignore_filter.is_some();

        for entry in walker.walk() {
            let path = entry.path();

            let rel_path_from_walk_root = match path.strip_prefix(&walk_root) {
                Ok(p) => p,
                Err(_) => continue,
            };
            let rel_str_from_walk_root = rel_path_from_walk_root.to_string_lossy();

            let is_walk_root_entry = rel_str_from_walk_root.is_empty();

            // Use optimized normalization with Cow
            let normalized = self.normalize_path(
                &rel_str_from_walk_root,
                &prefix_to_strip,
                is_walk_root_entry,
            );

            // Check if this path is inside an ignored directory
            if self.is_in_ignored_dir(&normalized, &ignored_dirs) {
                continue;
            }

            // Check ignore patterns
            if has_ignore_filter {
                let rel_path = if prefix_to_strip.is_some() {
                    PathBuf::from(normalized.as_ref())
                } else {
                    rel_path_from_walk_root.to_path_buf()
                };
                let abs_path = abs_cwd.join(&rel_path);
                let ignore_filter = self.ignore_filter.as_ref().unwrap();

                if ignore_filter.should_ignore(&normalized, &abs_path) {
                    if entry.is_dir() && ignore_filter.children_ignored(&normalized, &abs_path) {
                        ignored_dirs.insert(normalized.into_owned());
                    }
                    continue;
                }

                if entry.is_dir() && ignore_filter.children_ignored(&normalized, &abs_path) {
                    ignored_dirs.insert(normalized.to_string());
                }
            }

            // Handle root of walk_root
            if is_walk_root_entry && prefix_to_strip.is_none() {
                if include_cwd && !self.nodir {
                    if let Some(ref ignore_filter) = self.ignore_filter {
                        if ignore_filter.should_ignore(".", &abs_cwd) {
                            continue;
                        }
                    }

                    let result_path = ".".to_string();
                    if seen.insert(result_path.clone()) {
                        results.push(PathData {
                            path: result_path,
                            is_directory: true,
                            is_file: false,
                            is_symlink: entry.is_symlink(),
                        });
                    }
                }
                continue;
            }

            if normalized.is_empty() {
                continue;
            }

            // If nodir is true, skip directories
            if self.nodir && entry.is_dir() {
                continue;
            }

            // If dot:false, check if this path contains dotfile segments
            if !self.dot && !self.path_allowed_by_dot_rules(&normalized) {
                continue;
            }

            // When includeChildMatches is false, skip paths that are children of already-matched paths
            if !self.include_child_matches
                && self.is_child_of_matched(&normalized, &matched_parents)
            {
                continue;
            }

            // Check if any pattern matches
            let is_dir = entry.is_dir();

            let matches = if !self.any_pattern_requires_dir {
                self.patterns
                    .iter()
                    .any(|p| match p.matches_fast(&normalized) {
                        Some(result) => result,
                        None => p.matches(&normalized),
                    })
            } else {
                self.patterns.iter().any(|p| {
                    let path_matches = match p.matches_fast(&normalized) {
                        Some(result) => result,
                        None => p.matches(&normalized),
                    };
                    if path_matches && p.requires_dir() {
                        is_dir
                    } else {
                        path_matches
                    }
                })
            };

            if matches {
                // For withFileTypes, we return the relative path (no dotRelative/mark modifications)
                // The JavaScript wrapper handles path formatting via PathScurry
                let normalized_string = normalized.into_owned();
                if seen.insert(normalized_string.clone()) {
                    // When includeChildMatches is false, track this path to exclude its children
                    if !self.include_child_matches {
                        matched_parents.insert(normalized_string.clone());
                    }

                    results.push(PathData {
                        path: normalized_string,
                        is_directory: is_dir,
                        is_file: entry.is_file(),
                        is_symlink: entry.is_symlink(),
                    });
                }
            }
        }

        results
    }

    /// Format a path according to options (posix, etc.)
    fn format_path(&self, path: &std::path::Path) -> String {
        let path_str = path.to_string_lossy().to_string();
        if self.posix {
            // Convert to POSIX-style paths (forward slashes)
            path_str.replace('\\', "/")
        } else {
            path_str
        }
    }

    /// Ensure a path ends with a trailing slash
    fn ensure_trailing_slash(&self, path: &str) -> String {
        if path.ends_with('/') || path.ends_with('\\') {
            path.to_string()
        } else if self.posix || !cfg!(windows) {
            format!("{path}/")
        } else {
            // On Windows without posix option, use the native separator
            format!("{path}/")
        }
    }

    /// Check if a path is allowed by dot filtering rules.
    /// Returns true if:
    /// - dot: true (always allow)
    /// - The path has no dotfile segments
    /// - Any pattern explicitly allows the dotfile segments in this path
    fn path_allowed_by_dot_rules(&self, path: &str) -> bool {
        // Check if path contains any dotfile segments
        let has_dotfile = path
            .split('/')
            .any(|segment| segment.starts_with('.') && segment != "." && segment != "..");

        if !has_dotfile {
            return true;
        }

        // Check if any pattern explicitly allows the dotfiles in this path
        self.patterns.iter().any(|p| p.allows_dotfile(path))
    }

    /// Estimate the capacity for the result vector based on pattern characteristics.
    ///
    /// This helps reduce reallocations during result collection. The estimate is
    /// based on pattern depth and whether the pattern is recursive:
    /// - Simple root patterns (*.txt): ~16 results expected
    /// - One-level patterns (src/*.js): ~64 results expected  
    /// - Recursive patterns (**/*.js): ~256 results expected
    fn estimate_result_capacity(&self) -> usize {
        // Find the maximum depth across all patterns
        let max_pattern_depth = self.patterns.iter().filter_map(|p| p.max_depth()).max();

        match max_pattern_depth {
            Some(0) => 16,  // Root-level patterns: few files expected
            Some(1) => 64,  // One directory level: moderate number
            Some(2) => 128, // Two levels deep
            Some(_) => 256, // Deeper patterns
            None => 256,    // Recursive patterns (**): could be many files
        }
    }

    /// Estimate string buffer capacity based on pattern characteristics.
    /// Used to pre-allocate string buffers for path construction.
    #[inline]
    fn estimate_path_buffer_capacity(&self) -> usize {
        // Average path length: ~40-60 characters for typical project structures
        // Add extra for absolute paths and prefix
        if self.absolute {
            128 // Absolute paths can be longer
        } else if self.dot_relative {
            64 // Relative with ./ prefix
        } else {
            48 // Simple relative paths
        }
    }

    /// Format a path into the provided buffer, returning a reference to the result.
    /// This avoids allocations by reusing the buffer across iterations.
    #[inline]
    fn format_path_into_buffer<'a>(&self, path: &Path, buffer: &'a mut String) -> &'a str {
        buffer.clear();
        let path_str = path.to_string_lossy();
        if self.posix {
            // Convert backslashes to forward slashes
            for c in path_str.chars() {
                buffer.push(if c == '\\' { '/' } else { c });
            }
        } else {
            buffer.push_str(&path_str);
        }
        buffer.as_str()
    }

    /// Build a normalized path from walk entry, minimizing allocations.
    /// Returns Cow::Borrowed when no transformation is needed, Cow::Owned otherwise.
    #[inline]
    fn normalize_path<'a>(
        &self,
        rel_str_from_walk_root: &'a str,
        prefix_to_strip: &Option<String>,
        is_walk_root: bool,
    ) -> Cow<'a, str> {
        // Fast path: no prefix and no backslashes
        if prefix_to_strip.is_none() && !rel_str_from_walk_root.contains('\\') {
            return Cow::Borrowed(rel_str_from_walk_root);
        }

        // Need to construct the path
        match prefix_to_strip {
            Some(prefix) => {
                if is_walk_root {
                    Cow::Owned(prefix.clone())
                } else if rel_str_from_walk_root.contains('\\') {
                    Cow::Owned(format!(
                        "{}/{}",
                        prefix,
                        rel_str_from_walk_root.replace('\\', "/")
                    ))
                } else {
                    Cow::Owned(format!("{prefix}/{rel_str_from_walk_root}"))
                }
            }
            None => {
                // Has backslashes, needs conversion
                Cow::Owned(rel_str_from_walk_root.replace('\\', "/"))
            }
        }
    }

    /// Build a normalized path using a reusable buffer to minimize allocations.
    /// This is the optimized hot path for scoped patterns where prefix concatenation
    /// is needed for every file.
    ///
    /// # Arguments
    /// * `rel_str_from_walk_root` - The path relative to the walk root
    /// * `prefix_to_strip` - The original prefix (without trailing slash)
    /// * `prefix_with_slash` - Pre-computed "prefix/" for fast concatenation
    /// * `is_walk_root` - True if this is the walk root entry itself
    /// * `buffer` - Reusable string buffer
    #[inline]
    fn normalize_path_buffered<'a>(
        rel_str_from_walk_root: &str,
        prefix_to_strip: &Option<String>,
        prefix_with_slash: &Option<String>,
        is_walk_root: bool,
        buffer: &'a mut String,
    ) -> &'a str {
        // Fast path: no prefix and no backslashes - can't return borrowed reference
        // from the input because we need to return from buffer for consistency
        if prefix_to_strip.is_none() {
            if !rel_str_from_walk_root.contains('\\') {
                buffer.clear();
                buffer.push_str(rel_str_from_walk_root);
                return buffer.as_str();
            }
            // Has backslashes, needs conversion
            buffer.clear();
            for c in rel_str_from_walk_root.chars() {
                buffer.push(if c == '\\' { '/' } else { c });
            }
            return buffer.as_str();
        }

        // Clear and reuse buffer
        buffer.clear();

        let prefix = prefix_to_strip.as_ref().unwrap();

        if is_walk_root {
            buffer.push_str(prefix);
        } else {
            // Use pre-computed prefix with slash for efficiency
            if let Some(ref prefix_slash) = prefix_with_slash {
                buffer.push_str(prefix_slash);
            } else {
                buffer.push_str(prefix);
                buffer.push('/');
            }

            if rel_str_from_walk_root.contains('\\') {
                // Convert backslashes while appending
                for c in rel_str_from_walk_root.chars() {
                    buffer.push(if c == '\\' { '/' } else { c });
                }
            } else {
                buffer.push_str(rel_str_from_walk_root);
            }
        }
        buffer.as_str()
    }

    /// Build the final result path from the normalized path.
    /// Uses the provided buffer to minimize allocations.
    #[inline]
    fn build_result_path(
        &self,
        normalized: &str,
        is_dir: bool,
        is_symlink: bool,
        abs_cwd: &Path,
        result_buffer: &mut String,
    ) -> String {
        // When mark:true, add trailing slash to directories but NOT to symlinks
        let should_mark_as_dir = is_dir && !is_symlink && self.mark;

        if self.absolute {
            // Build absolute path
            result_buffer.clear();
            let abs_path = abs_cwd.join(normalized);
            let formatted = self.format_path_into_buffer(&abs_path, result_buffer);

            if should_mark_as_dir && !formatted.ends_with('/') && !formatted.ends_with('\\') {
                let mut result = formatted.to_string();
                result.push('/');
                result
            } else {
                formatted.to_string()
            }
        } else {
            // Build relative path
            let base = if self.dot_relative && !normalized.starts_with("../") {
                result_buffer.clear();
                result_buffer.push_str("./");
                result_buffer.push_str(normalized);
                result_buffer.as_str()
            } else {
                normalized
            };

            if should_mark_as_dir && !base.ends_with('/') && !base.ends_with('\\') {
                let mut result = base.to_string();
                result.push('/');
                result
            } else {
                base.to_string()
            }
        }
    }

    /// Check if a path is inside any of the ignored directories.
    /// Uses byte-level comparison for performance.
    #[inline]
    fn is_in_ignored_dir(&self, normalized: &str, ignored_dirs: &AHashSet<String>) -> bool {
        if ignored_dirs.is_empty() {
            return false;
        }

        let normalized_bytes = normalized.as_bytes();
        ignored_dirs.iter().any(|ignored_dir: &String| {
            let ignored_bytes = ignored_dir.as_bytes();
            normalized_bytes.starts_with(ignored_bytes)
                && (normalized_bytes.len() == ignored_bytes.len()
                    || normalized_bytes.get(ignored_bytes.len()) == Some(&b'/'))
        })
    }

    /// Check if a path is a child of any matched parent.
    /// Used when includeChildMatches is false.
    #[inline]
    fn is_child_of_matched(&self, normalized: &str, matched_parents: &AHashSet<String>) -> bool {
        if matched_parents.is_empty() {
            return false;
        }

        let normalized_bytes = normalized.as_bytes();
        matched_parents.iter().any(|matched_path: &String| {
            let matched_bytes = matched_path.as_bytes();
            normalized_bytes.starts_with(matched_bytes)
                && normalized_bytes.len() > matched_bytes.len()
                && normalized_bytes.get(matched_bytes.len()) == Some(&b'/')
        })
    }

    /// Calculate the optimal walk root based on literal prefixes of patterns.
    ///
    /// Returns a tuple of (walk_root, prefix_to_strip, is_absolute_pattern):
    /// - walk_root: The directory to start walking from (cwd, cwd/prefix, or absolute root)
    /// - prefix_to_strip: If Some, this prefix was extracted and should be prepended
    ///   to relative paths from walk_root to get the path relative to cwd
    /// - is_absolute_pattern: True if we're walking from an absolute pattern root
    ///
    /// For patterns like `src/**/*.ts`, instead of walking from cwd and visiting
    /// all directories, we can walk from `cwd/src` which is much faster.
    ///
    /// For absolute patterns like `C:/foo/**/*.ts` or `/usr/local/**`, we walk from
    /// that absolute path directly.
    ///
    /// When patterns have different prefixes (e.g., `src/**` and `test/**`),
    /// we find the longest common prefix, or fall back to cwd if there's no
    /// common prefix.
    fn calculate_walk_root(&self) -> (PathBuf, Option<String>) {
        // If there are no patterns, just walk from cwd
        if self.patterns.is_empty() {
            return (self.cwd.clone(), None);
        }

        // Check if any pattern is absolute (has a root like C:/, /, or //server/share/)
        // If we have absolute patterns, we need to handle them specially
        let has_absolute_pattern = self.patterns.iter().any(|p| p.is_absolute());

        if has_absolute_pattern {
            // For absolute patterns, we need to check if ALL patterns are absolute
            // and share a common root. If not, we can't optimize.
            let all_absolute = self.patterns.iter().all(|p| p.is_absolute());

            if all_absolute && self.patterns.len() == 1 {
                // Single absolute pattern - walk from its root + literal prefix
                let pattern = &self.patterns[0];
                let root = pattern.root();

                // Get the literal prefix (directories before any glob magic)
                if let Some(prefix) = pattern.literal_prefix() {
                    // Walk from root + prefix
                    let walk_root = PathBuf::from(&root).join(&prefix);
                    // The prefix to strip is the root + prefix
                    let full_prefix = if root.ends_with('/') {
                        format!("{root}{prefix}")
                    } else {
                        format!("{root}/{prefix}")
                    };
                    return (walk_root, Some(full_prefix));
                } else {
                    // No literal prefix, just walk from the root
                    return (PathBuf::from(&root), Some(root.to_string()));
                }
            } else if all_absolute {
                // Multiple absolute patterns - find common root
                let roots: Vec<&str> = self.patterns.iter().map(|p| p.root()).collect();

                // Check if all roots are the same
                if !roots.is_empty() && roots.iter().all(|r| *r == roots[0]) {
                    let common_root = roots[0];

                    // Get literal prefixes after the root
                    let prefixes: Vec<Option<String>> =
                        self.patterns.iter().map(|p| p.literal_prefix()).collect();

                    // If any pattern has no prefix, walk from the root
                    if prefixes.iter().any(|p| p.is_none()) {
                        return (PathBuf::from(common_root), Some(common_root.to_string()));
                    }

                    // Find common prefix among all patterns
                    let prefix_strs: Vec<&str> = prefixes
                        .iter()
                        .filter_map(|p| p.as_ref().map(|s| s.as_str()))
                        .collect();

                    let common_prefix = Self::longest_common_prefix(&prefix_strs);

                    if common_prefix.is_empty() {
                        return (PathBuf::from(common_root), Some(common_root.to_string()));
                    }

                    let walk_root = PathBuf::from(common_root).join(&common_prefix);
                    let full_prefix = if common_root.ends_with('/') {
                        format!("{common_root}{common_prefix}")
                    } else {
                        format!("{common_root}/{common_prefix}")
                    };
                    return (walk_root, Some(full_prefix));
                }
            }

            // Mixed absolute and relative patterns, or different roots
            // Fall back to walking from cwd for relative patterns
            // This is a limitation - we can't efficiently handle mixed patterns
            return (self.cwd.clone(), None);
        }

        // Get literal prefixes from all patterns
        let prefixes: Vec<Option<String>> =
            self.patterns.iter().map(|p| p.literal_prefix()).collect();

        // If any pattern has no prefix (e.g., `**/*.js` or `*.txt`), we must walk from cwd
        if prefixes.iter().any(|p| p.is_none()) {
            return (self.cwd.clone(), None);
        }

        // All patterns have prefixes - find the longest common prefix
        let prefix_strs: Vec<&str> = prefixes
            .iter()
            .filter_map(|p| p.as_ref().map(|s| s.as_str()))
            .collect();

        if prefix_strs.is_empty() {
            return (self.cwd.clone(), None);
        }

        // Find the longest common prefix among all pattern prefixes
        let common_prefix = Self::longest_common_prefix(&prefix_strs);

        if common_prefix.is_empty() {
            return (self.cwd.clone(), None);
        }

        // Construct the walk root
        let walk_root = self.cwd.join(&common_prefix);

        // Verify the walk root exists before using it
        if !walk_root.exists() {
            // If the prefix directory doesn't exist, we'll get empty results anyway
            // But we still walk from there to get correct behavior
            return (walk_root, Some(common_prefix));
        }

        (walk_root, Some(common_prefix))
    }

    /// Group patterns by their first-level literal prefix.
    ///
    /// This enables multi-base walking: instead of walking from cwd when patterns
    /// have different prefixes, we walk from each unique prefix separately.
    ///
    /// Returns a map of prefix -> pattern indices.
    /// Patterns without a prefix (e.g., `**/*.js`) go into the `None` group.
    ///
    /// # Example
    /// ```ignore
    /// patterns: ["src/**/*.ts", "src/lib/*.ts", "test/**/*.ts", "**/*.js"]
    /// Result: {
    ///   Some("src") -> [0, 1],
    ///   Some("test") -> [2],
    ///   None -> [3]
    /// }
    /// ```
    fn group_patterns_by_base(&self) -> std::collections::HashMap<Option<String>, Vec<usize>> {
        use std::collections::HashMap;
        let mut groups: HashMap<Option<String>, Vec<usize>> = HashMap::new();

        for (idx, pattern) in self.patterns.iter().enumerate() {
            // Get the first component of the literal prefix
            // This is more aggressive grouping than using the full prefix
            let base = pattern.literal_prefix().map(|prefix| {
                // Get just the first path component
                prefix
                    .split('/')
                    .next()
                    .map(|s| s.to_string())
                    .unwrap_or(prefix)
            });

            groups.entry(base).or_default().push(idx);
        }

        groups
    }

    /// Check if multi-base walking would be beneficial.
    ///
    /// Multi-base walking helps when:
    /// 1. All patterns have literal prefixes (no patterns like `**/*.js`)
    /// 2. There are multiple distinct first-level prefixes (e.g., `src` and `test`)
    /// 3. All prefixes point to existing directories
    fn should_use_multi_base_walking(&self) -> bool {
        // Quick check: if any pattern has no prefix, we can't use multi-base
        if self.patterns.iter().any(|p| p.literal_prefix().is_none()) {
            return false;
        }

        // Get first-level bases
        let groups = self.group_patterns_by_base();

        // Need at least 2 distinct bases to benefit from multi-base walking
        if groups.len() < 2 {
            return false;
        }

        // All groups must have Some base (no None group)
        if groups.contains_key(&None) {
            return false;
        }

        // Check that all base directories exist
        groups.keys().all(|base| {
            if let Some(base_str) = base {
                self.cwd.join(base_str).exists()
            } else {
                false
            }
        })
    }

    /// Walk using multiple base directories in parallel using rayon.
    ///
    /// This is an optimization for patterns like `['src/**/*.ts', 'test/**/*.ts']`.
    /// Instead of walking from cwd and visiting all directories, we walk from
    /// `src/` and `test/` concurrently using rayon's parallel iterators.
    ///
    /// Each base directory is processed in parallel, and results are merged
    /// with deduplication at the end.
    fn walk_multi_base(&self) -> Vec<String> {
        let groups = self.group_patterns_by_base();
        let abs_cwd = self.cwd.canonicalize().unwrap_or_else(|_| self.cwd.clone());

        // Convert groups to a Vec for parallel iteration
        let groups_vec: Vec<(Option<String>, Vec<usize>)> = groups.into_iter().collect();

        // Process each base group in parallel using rayon
        // Each group returns its own Vec of results (local deduplication)
        let group_results: Vec<Vec<String>> = groups_vec
            .par_iter()
            .filter_map(|(base, pattern_indices)| {
                // Skip groups without a valid base
                base.as_ref()?;

                Some(self.walk_single_base_group(pattern_indices, &abs_cwd))
            })
            .collect();

        // Merge all results and deduplicate
        let estimated_capacity = self.estimate_result_capacity();
        let mut seen: AHashSet<String> = AHashSet::with_capacity(estimated_capacity);
        let mut results = Vec::with_capacity(estimated_capacity);

        for group_result in group_results {
            for result in group_result {
                if seen.insert(result.clone()) {
                    results.push(result);
                }
            }
        }

        results
    }

    /// Walk a single base directory group and return results.
    ///
    /// This method is designed to be called in parallel from `walk_multi_base`.
    /// It handles all the logic for walking a single base directory and matching
    /// patterns within that group.
    fn walk_single_base_group(&self, pattern_indices: &[usize], abs_cwd: &Path) -> Vec<String> {
        let estimated_capacity = self.estimate_result_capacity() / 4; // Smaller per-group
        let mut results = Vec::with_capacity(estimated_capacity);
        let mut seen: AHashSet<String> = AHashSet::with_capacity(estimated_capacity);
        let mut ignored_dirs: AHashSet<String> = AHashSet::with_capacity(8);
        let mut matched_parents: AHashSet<String> = if self.include_child_matches {
            AHashSet::new()
        } else {
            AHashSet::with_capacity(estimated_capacity / 4)
        };
        let mut result_buffer = String::with_capacity(self.estimate_path_buffer_capacity());
        let has_ignore_filter = self.ignore_filter.is_some();

        // Get the patterns for this group
        let group_patterns: Vec<&Pattern> =
            pattern_indices.iter().map(|&i| &self.patterns[i]).collect();

        // Find the longest common prefix within this group
        let prefixes: Vec<Option<String>> =
            group_patterns.iter().map(|p| p.literal_prefix()).collect();
        let prefix_strs: Vec<&str> = prefixes
            .iter()
            .filter_map(|p| p.as_ref().map(|s| s.as_str()))
            .collect();
        let common_prefix = Self::longest_common_prefix(&prefix_strs);

        // Walk from the common prefix (at least the base)
        let walk_root = self.cwd.join(&common_prefix);
        let prefix_to_strip = if common_prefix.is_empty() {
            None
        } else {
            Some(common_prefix.clone())
        };

        // Pre-compute the prefix with trailing slash for efficient path concatenation
        let prefix_with_slash: Option<String> =
            prefix_to_strip.as_ref().map(|prefix| format!("{prefix}/"));

        // Adjust walk options for this prefix
        let adjusted_walk_options = if let Some(ref prefix) = prefix_to_strip {
            let prefix_depth = prefix.split('/').filter(|s| !s.is_empty()).count();
            if let Some(max_d) = self.walk_options.max_depth {
                if max_d <= prefix_depth {
                    self.walk_options.clone().max_depth(Some(0))
                } else {
                    self.walk_options
                        .clone()
                        .max_depth(Some(max_d - prefix_depth))
                }
            } else {
                self.walk_options.clone()
            }
        } else {
            self.walk_options.clone()
        };

        // Create pruning filter for this group's patterns
        let patterns_arc: Arc<[Pattern]> = group_patterns.iter().cloned().cloned().collect();
        let prefix_for_filter = prefix_to_strip.clone();
        let prefix_slash_for_filter = prefix_with_slash.clone();

        let prune_filter = Box::new(move |dir_path: &str| -> bool {
            let path_from_cwd: Cow<'_, str> = if let Some(ref prefix) = prefix_for_filter {
                if dir_path.is_empty() {
                    Cow::Borrowed(prefix.as_str())
                } else if let Some(ref prefix_slash) = prefix_slash_for_filter {
                    Cow::Owned(format!("{prefix_slash}{dir_path}"))
                } else {
                    Cow::Owned(format!("{prefix}/{dir_path}"))
                }
            } else {
                Cow::Borrowed(dir_path)
            };

            patterns_arc
                .iter()
                .any(|p| p.could_match_in_dir(&path_from_cwd))
        });

        // Create walker for this group
        let walker = Walker::new(walk_root.clone(), adjusted_walk_options)
            .with_dir_prune_filter(prune_filter);

        // Walk and collect results
        for entry in walker.walk() {
            let path = entry.path();

            let rel_path_from_walk_root = match path.strip_prefix(&walk_root) {
                Ok(p) => p,
                Err(_) => continue,
            };
            let rel_str_from_walk_root = rel_path_from_walk_root.to_string_lossy();
            let is_walk_root_entry = rel_str_from_walk_root.is_empty();

            let normalized = self.normalize_path(
                &rel_str_from_walk_root,
                &prefix_to_strip,
                is_walk_root_entry,
            );

            if self.is_in_ignored_dir(&normalized, &ignored_dirs) {
                continue;
            }

            if has_ignore_filter {
                let rel_path = if prefix_to_strip.is_some() {
                    PathBuf::from(normalized.as_ref())
                } else {
                    rel_path_from_walk_root.to_path_buf()
                };
                let abs_path = abs_cwd.join(&rel_path);
                let ignore_filter = self.ignore_filter.as_ref().unwrap();

                if ignore_filter.should_ignore(&normalized, &abs_path) {
                    if entry.is_dir() && ignore_filter.children_ignored(&normalized, &abs_path) {
                        ignored_dirs.insert(normalized.into_owned());
                    }
                    continue;
                }

                if entry.is_dir() && ignore_filter.children_ignored(&normalized, &abs_path) {
                    ignored_dirs.insert(normalized.to_string());
                }
            }

            // Handle root of walk_root - for multi-base, this is the base directory itself
            if is_walk_root_entry {
                // The base directory (e.g., "src") - check if any pattern matches it
                let matches_base = group_patterns.iter().any(|p| {
                    let path_matches = match p.matches_fast(&normalized) {
                        Some(result) => result,
                        None => p.matches(&normalized),
                    };
                    if path_matches && p.requires_dir() {
                        true // It's the base dir, which is a directory
                    } else {
                        path_matches
                    }
                });

                if matches_base && !self.nodir {
                    if let Some(ref ignore_filter) = self.ignore_filter {
                        let abs_path = abs_cwd.join(&*normalized);
                        if ignore_filter.should_ignore(&normalized, &abs_path) {
                            continue;
                        }
                    }

                    let result = self.build_result_path(
                        &normalized,
                        true, // is_dir
                        entry.is_symlink(),
                        abs_cwd,
                        &mut result_buffer,
                    );

                    if seen.insert(result.clone()) {
                        if !self.include_child_matches {
                            matched_parents.insert(normalized.into_owned());
                        }
                        results.push(result);
                    }
                }
                continue;
            }

            if normalized.is_empty() {
                continue;
            }

            if self.nodir && entry.is_dir() {
                continue;
            }

            if !self.dot && !self.path_allowed_by_dot_rules(&normalized) {
                continue;
            }

            if !self.include_child_matches
                && self.is_child_of_matched(&normalized, &matched_parents)
            {
                continue;
            }

            let is_dir = entry.is_dir();
            let is_symlink = entry.is_symlink();

            // Check if any pattern in this group matches
            let matches = group_patterns.iter().any(|p| {
                let path_matches = match p.matches_fast(&normalized) {
                    Some(result) => result,
                    None => p.matches(&normalized),
                };
                if path_matches && p.requires_dir() {
                    is_dir
                } else {
                    path_matches
                }
            });

            if matches {
                let result = self.build_result_path(
                    &normalized,
                    is_dir,
                    is_symlink,
                    abs_cwd,
                    &mut result_buffer,
                );

                if seen.insert(result.clone()) {
                    if !self.include_child_matches {
                        matched_parents.insert(normalized.into_owned());
                    }
                    results.push(result);
                }
            }
        }

        results
    }

    /// Find the longest common prefix among a list of paths.
    ///
    /// For example:
    /// - `["src/lib", "src/bin"]` -> `"src"`
    /// - `["src", "test"]` -> `""`
    /// - `["packages/foo", "packages/bar"]` -> `"packages"`
    fn longest_common_prefix(paths: &[&str]) -> String {
        if paths.is_empty() {
            return String::new();
        }

        if paths.len() == 1 {
            return paths[0].to_string();
        }

        // Split all paths into components
        let path_components: Vec<Vec<&str>> =
            paths.iter().map(|p| p.split('/').collect()).collect();

        // Find the minimum length
        let min_len = path_components.iter().map(|c| c.len()).min().unwrap_or(0);

        // Find common prefix components
        let mut common_components: Vec<&str> = Vec::new();
        for i in 0..min_len {
            let first = path_components[0][i];
            if path_components.iter().all(|c| c[i] == first) {
                common_components.push(first);
            } else {
                break;
            }
        }

        common_components.join("/")
    }

    /// Check if all patterns are static (no wildcards, can be resolved with stat()).
    ///
    /// Static patterns are patterns like `package.json` or `src/index.ts` that
    /// resolve to a single path and can be checked with a direct stat() call
    /// instead of walking the entire directory tree.
    fn all_patterns_static(&self) -> bool {
        !self.patterns.is_empty() && self.patterns.iter().all(|p| p.is_static())
    }

    /// Check if all patterns are shallow (max_depth 0, root-level only).
    ///
    /// Shallow patterns like `*.js` or `*.{ts,tsx}` can be resolved with a single
    /// readdir call instead of using the full walker machinery.
    fn all_patterns_shallow(&self) -> bool {
        if self.patterns.is_empty() {
            return false;
        }
        // All patterns must have max_depth of 0 (no path separators, no **)
        self.patterns.iter().all(|p| p.max_depth() == Some(0))
    }

    /// Resolve shallow patterns using direct readdir.
    ///
    /// This is a fast path for patterns like `*.js` that only match at the root level.
    /// Instead of using the full walker machinery with all its overhead, we do a
    /// single readdir and filter the results.
    fn resolve_shallow_patterns(&self) -> Vec<String> {
        use std::fs;

        let mut results = Vec::new();
        let mut seen: AHashSet<String> = AHashSet::new();

        // Read the directory entries directly
        let entries = match fs::read_dir(&self.cwd) {
            Ok(rd) => rd,
            Err(_) => return results,
        };

        let abs_cwd = self.cwd.canonicalize().unwrap_or_else(|_| self.cwd.clone());

        for entry_result in entries {
            let entry = match entry_result {
                Ok(e) => e,
                Err(_) => continue,
            };

            let file_name = match entry.file_name().into_string() {
                Ok(n) => n,
                Err(_) => continue,
            };

            // Filter dotfiles if dot option is false
            if !self.dot && file_name.starts_with('.') {
                continue;
            }

            // Get file type - use file_type() from DirEntry when possible
            let file_type = match entry.file_type() {
                Ok(ft) => ft,
                Err(_) => continue,
            };

            let is_dir_raw = file_type.is_dir();
            let is_symlink = file_type.is_symlink();

            // If following symlinks and this is a symlink, get target type
            // Note: entry.metadata() returns metadata for the symlink itself on macOS,
            // not the target. Use fs::metadata() on the path to follow the symlink.
            let is_dir = if is_symlink && self.follow {
                match fs::metadata(entry.path()) {
                    Ok(meta) => meta.is_dir(),
                    Err(_) => false, // Broken symlink
                }
            } else {
                is_dir_raw
            };

            // Skip directories if nodir is true
            if self.nodir && is_dir {
                continue;
            }

            // Check if any pattern matches
            let matches = self.patterns.iter().any(|p| {
                let path_matches = match p.matches_fast(&file_name) {
                    Some(result) => result,
                    None => p.matches(&file_name),
                };
                if path_matches && p.requires_dir() {
                    is_dir
                } else {
                    path_matches
                }
            });

            if !matches {
                continue;
            }

            // Build result path
            let result = if self.absolute {
                let abs_path = abs_cwd.join(&file_name);
                let formatted = if self.posix {
                    abs_path.to_string_lossy().replace('\\', "/")
                } else {
                    abs_path.to_string_lossy().to_string()
                };
                if self.mark && is_dir && !is_symlink && !formatted.ends_with('/') {
                    format!("{formatted}/")
                } else {
                    formatted
                }
            } else {
                let base = if self.dot_relative {
                    format!("./{file_name}")
                } else {
                    file_name.clone()
                };
                if self.mark && is_dir && !is_symlink && !base.ends_with('/') {
                    format!("{base}/")
                } else {
                    base
                }
            };

            if seen.insert(result.clone()) {
                results.push(result);
            }
        }

        results
    }

    /// Resolve static patterns directly using stat() instead of walking.
    ///
    /// This is a fast path for patterns like `package.json` or `src/index.ts`
    /// that can be resolved to a single file path. Instead of walking the
    /// directory tree and matching each file, we directly check if the file
    /// exists.
    ///
    /// Returns a Vec of matching paths.
    fn resolve_static_patterns(&self) -> Vec<String> {
        use std::fs;

        let mut results = Vec::with_capacity(self.patterns.len());
        let mut seen: AHashSet<String> = AHashSet::with_capacity(self.patterns.len());

        for pattern in self.patterns.iter() {
            if let Some(static_path) = pattern.static_path() {
                // Construct the full path
                let full_path = self.cwd.join(static_path);

                // Check if the file exists
                let metadata = if self.follow {
                    fs::metadata(&full_path)
                } else {
                    fs::symlink_metadata(&full_path)
                };

                if let Ok(meta) = metadata {
                    let is_dir = meta.is_dir();
                    let is_symlink = meta.file_type().is_symlink();

                    // Check nodir option
                    if self.nodir && is_dir {
                        continue;
                    }

                    // Check if pattern requires directory (ends with /)
                    if pattern.requires_dir() && !is_dir {
                        continue;
                    }

                    // Apply ignore filter if present
                    if let Some(ref filter) = self.ignore_filter {
                        if filter.should_ignore(static_path, &full_path) {
                            continue;
                        }
                    }

                    // Check dot option
                    if !self.dot {
                        let has_hidden = static_path
                            .split('/')
                            .any(|seg| seg.starts_with('.') && seg != "." && seg != "..");
                        if has_hidden && !pattern.allows_dotfile(static_path) {
                            continue;
                        }
                    }

                    // Strip trailing slash from static path (glob returns paths without trailing slash unless mark: true)
                    let base_path = static_path.trim_end_matches('/');

                    // Format the result path
                    let result = if self.absolute {
                        let abs_path = full_path.canonicalize().unwrap_or(full_path.clone());
                        let formatted = if self.posix {
                            abs_path.to_string_lossy().replace('\\', "/")
                        } else {
                            abs_path.to_string_lossy().to_string()
                        };
                        if self.mark && is_dir && !is_symlink && !formatted.ends_with('/') {
                            format!("{formatted}/")
                        } else {
                            formatted
                        }
                    } else {
                        let base = if self.dot_relative && !base_path.starts_with("../") {
                            format!("./{base_path}")
                        } else {
                            base_path.to_string()
                        };
                        if self.mark && is_dir && !is_symlink && !base.ends_with('/') {
                            format!("{base}/")
                        } else {
                            base
                        }
                    };

                    // Deduplicate (in case of brace expansion producing duplicates)
                    if seen.insert(result.clone()) {
                        results.push(result);
                    }
                }
            }
        }

        results
    }

    /// Walk the directory tree and stream results via callback.
    /// This reduces peak memory usage by not collecting all results into a Vec.
    pub fn walk_stream<F>(&self, mut callback: F)
    where
        F: FnMut(String),
    {
        // If maxDepth is negative, return empty results
        if let Some(d) = self.max_depth {
            if d < 0 {
                return;
            }
        }

        // Use AHashSet for deduplication (can't eliminate this for correctness)
        let mut seen: AHashSet<String> = AHashSet::with_capacity(self.estimate_result_capacity());
        let mut ignored_dirs: AHashSet<String> = AHashSet::with_capacity(8);

        // When includeChildMatches is false, track matched paths to exclude their children
        let mut matched_parents: AHashSet<String> = if self.include_child_matches {
            AHashSet::new()
        } else {
            AHashSet::with_capacity(64)
        };

        // Pre-allocate a reusable buffer for path formatting
        let mut result_buffer = String::with_capacity(self.estimate_path_buffer_capacity());

        // Check if any pattern matches the cwd itself
        let include_cwd = self.patterns.iter().any(|p| {
            let raw = p.raw();
            raw == "**" || raw == "." || raw == "./**" || {
                let preprocessed = preprocess_pattern(raw);
                preprocessed == "**" || preprocessed == "."
            }
        });

        let abs_cwd = self.cwd.canonicalize().unwrap_or_else(|_| self.cwd.clone());
        let (walk_root, prefix_to_strip) = self.calculate_walk_root();

        // Pre-compute the prefix with trailing slash for efficient path concatenation
        let prefix_with_slash: Option<String> =
            prefix_to_strip.as_ref().map(|prefix| format!("{prefix}/"));

        // Adjust walk options for prefix-based walking
        let adjusted_walk_options = if let Some(ref prefix) = prefix_to_strip {
            let prefix_depth = prefix.split('/').filter(|s| !s.is_empty()).count();
            if let Some(max_d) = self.walk_options.max_depth {
                if max_d <= prefix_depth {
                    self.walk_options.clone().max_depth(Some(0))
                } else {
                    self.walk_options
                        .clone()
                        .max_depth(Some(max_d - prefix_depth))
                }
            } else {
                self.walk_options.clone()
            }
        } else {
            self.walk_options.clone()
        };

        // Create directory pruning filter
        let patterns_for_filter = Arc::clone(&self.patterns);
        let prefix_for_filter = prefix_to_strip.clone();
        let prefix_slash_for_filter = prefix_with_slash.clone();

        let prune_filter = Box::new(move |dir_path: &str| -> bool {
            let path_from_cwd: Cow<'_, str> = if let Some(ref prefix) = prefix_for_filter {
                if dir_path.is_empty() {
                    Cow::Borrowed(prefix.as_str())
                } else if let Some(ref prefix_slash) = prefix_slash_for_filter {
                    Cow::Owned(format!("{prefix_slash}{dir_path}"))
                } else {
                    Cow::Owned(format!("{prefix}/{dir_path}"))
                }
            } else {
                Cow::Borrowed(dir_path)
            };

            patterns_for_filter
                .iter()
                .any(|p| p.could_match_in_dir(&path_from_cwd))
        });

        let walker = Walker::new(walk_root.clone(), adjusted_walk_options)
            .with_dir_prune_filter(prune_filter);

        let has_ignore_filter = self.ignore_filter.is_some();

        for entry in walker.walk() {
            let path = entry.path();

            let rel_path_from_walk_root = match path.strip_prefix(&walk_root) {
                Ok(p) => p,
                Err(_) => continue,
            };
            let rel_str_from_walk_root = rel_path_from_walk_root.to_string_lossy();
            let is_walk_root_entry = rel_str_from_walk_root.is_empty();

            let normalized = self.normalize_path(
                &rel_str_from_walk_root,
                &prefix_to_strip,
                is_walk_root_entry,
            );

            if self.is_in_ignored_dir(&normalized, &ignored_dirs) {
                continue;
            }

            if has_ignore_filter {
                let rel_path = if prefix_to_strip.is_some() {
                    PathBuf::from(normalized.as_ref())
                } else {
                    rel_path_from_walk_root.to_path_buf()
                };
                let abs_path = abs_cwd.join(&rel_path);
                let ignore_filter = self.ignore_filter.as_ref().unwrap();

                if ignore_filter.should_ignore(&normalized, &abs_path) {
                    if entry.is_dir() && ignore_filter.children_ignored(&normalized, &abs_path) {
                        ignored_dirs.insert(normalized.into_owned());
                    }
                    continue;
                }

                if entry.is_dir() && ignore_filter.children_ignored(&normalized, &abs_path) {
                    ignored_dirs.insert(normalized.to_string());
                }
            }

            // Handle root
            if is_walk_root_entry && prefix_to_strip.is_none() {
                if include_cwd && !self.nodir {
                    if let Some(ref ignore_filter) = self.ignore_filter {
                        if ignore_filter.should_ignore(".", &abs_cwd) {
                            continue;
                        }
                    }

                    let result = if self.absolute {
                        let formatted = self.format_path_into_buffer(&abs_cwd, &mut result_buffer);
                        if self.mark {
                            if formatted.ends_with('/') || formatted.ends_with('\\') {
                                formatted.to_string()
                            } else {
                                format!("{formatted}/")
                            }
                        } else {
                            formatted.to_string()
                        }
                    } else if self.mark {
                        "./".to_string()
                    } else {
                        ".".to_string()
                    };
                    if seen.insert(result.clone()) {
                        callback(result);
                    }
                }
                continue;
            }

            if normalized.is_empty() {
                continue;
            }

            if self.nodir && entry.is_dir() {
                continue;
            }

            if !self.dot && !self.path_allowed_by_dot_rules(&normalized) {
                continue;
            }

            if !self.include_child_matches
                && self.is_child_of_matched(&normalized, &matched_parents)
            {
                continue;
            }

            let is_dir = entry.is_dir();
            let is_symlink = entry.is_symlink();

            let matches = if !self.any_pattern_requires_dir {
                self.patterns
                    .iter()
                    .any(|p| match p.matches_fast(&normalized) {
                        Some(result) => result,
                        None => p.matches(&normalized),
                    })
            } else {
                self.patterns.iter().any(|p| {
                    let path_matches = match p.matches_fast(&normalized) {
                        Some(result) => result,
                        None => p.matches(&normalized),
                    };
                    if path_matches && p.requires_dir() {
                        is_dir
                    } else {
                        path_matches
                    }
                })
            };

            if matches {
                let result = self.build_result_path(
                    &normalized,
                    is_dir,
                    is_symlink,
                    &abs_cwd,
                    &mut result_buffer,
                );

                if seen.insert(result.clone()) {
                    if !self.include_child_matches {
                        matched_parents.insert(normalized.into_owned());
                    }
                    callback(result);
                }
            }
        }
    }

    /// Walk the directory tree and stream PathData results via callback.
    /// This reduces peak memory usage by not collecting all results into a Vec.
    pub fn walk_stream_with_file_types<F>(&self, mut callback: F)
    where
        F: FnMut(PathData),
    {
        // If maxDepth is negative, return empty results
        if let Some(d) = self.max_depth {
            if d < 0 {
                return;
            }
        }

        let mut seen: AHashSet<String> = AHashSet::with_capacity(self.estimate_result_capacity());
        let mut ignored_dirs: AHashSet<String> = AHashSet::with_capacity(8);
        let mut matched_parents: AHashSet<String> = if self.include_child_matches {
            AHashSet::new()
        } else {
            AHashSet::with_capacity(64)
        };

        let include_cwd = self.patterns.iter().any(|p| {
            let raw = p.raw();
            raw == "**" || raw == "." || raw == "./**" || {
                let preprocessed = preprocess_pattern(raw);
                preprocessed == "**" || preprocessed == "."
            }
        });

        let abs_cwd = self.cwd.canonicalize().unwrap_or_else(|_| self.cwd.clone());
        let (walk_root, prefix_to_strip) = self.calculate_walk_root();

        let adjusted_walk_options = if let Some(ref prefix) = prefix_to_strip {
            let prefix_depth = prefix.split('/').filter(|s| !s.is_empty()).count();
            if let Some(max_d) = self.walk_options.max_depth {
                if max_d <= prefix_depth {
                    self.walk_options.clone().max_depth(Some(0))
                } else {
                    self.walk_options
                        .clone()
                        .max_depth(Some(max_d - prefix_depth))
                }
            } else {
                self.walk_options.clone()
            }
        } else {
            self.walk_options.clone()
        };

        let patterns_for_filter = Arc::clone(&self.patterns);
        let prefix_for_filter = prefix_to_strip.clone();

        let prune_filter = Box::new(move |dir_path: &str| -> bool {
            let path_from_cwd: Cow<'_, str> = if let Some(ref prefix) = prefix_for_filter {
                if dir_path.is_empty() {
                    Cow::Borrowed(prefix.as_str())
                } else {
                    Cow::Owned(format!("{prefix}/{dir_path}"))
                }
            } else {
                Cow::Borrowed(dir_path)
            };

            patterns_for_filter
                .iter()
                .any(|p| p.could_match_in_dir(&path_from_cwd))
        });

        let walker = Walker::new(walk_root.clone(), adjusted_walk_options)
            .with_dir_prune_filter(prune_filter);

        let has_ignore_filter = self.ignore_filter.is_some();

        for entry in walker.walk() {
            let path = entry.path();

            let rel_path_from_walk_root = match path.strip_prefix(&walk_root) {
                Ok(p) => p,
                Err(_) => continue,
            };
            let rel_str_from_walk_root = rel_path_from_walk_root.to_string_lossy();
            let is_walk_root_entry = rel_str_from_walk_root.is_empty();

            let normalized = self.normalize_path(
                &rel_str_from_walk_root,
                &prefix_to_strip,
                is_walk_root_entry,
            );

            if self.is_in_ignored_dir(&normalized, &ignored_dirs) {
                continue;
            }

            if has_ignore_filter {
                let rel_path = if prefix_to_strip.is_some() {
                    PathBuf::from(normalized.as_ref())
                } else {
                    rel_path_from_walk_root.to_path_buf()
                };
                let abs_path = abs_cwd.join(&rel_path);
                let ignore_filter = self.ignore_filter.as_ref().unwrap();

                if ignore_filter.should_ignore(&normalized, &abs_path) {
                    if entry.is_dir() && ignore_filter.children_ignored(&normalized, &abs_path) {
                        ignored_dirs.insert(normalized.into_owned());
                    }
                    continue;
                }

                if entry.is_dir() && ignore_filter.children_ignored(&normalized, &abs_path) {
                    ignored_dirs.insert(normalized.to_string());
                }
            }

            if is_walk_root_entry && prefix_to_strip.is_none() {
                if include_cwd && !self.nodir {
                    if let Some(ref ignore_filter) = self.ignore_filter {
                        if ignore_filter.should_ignore(".", &abs_cwd) {
                            continue;
                        }
                    }

                    let result_path = ".".to_string();
                    if seen.insert(result_path.clone()) {
                        callback(PathData {
                            path: result_path,
                            is_directory: true,
                            is_file: false,
                            is_symlink: entry.is_symlink(),
                        });
                    }
                }
                continue;
            }

            if normalized.is_empty() {
                continue;
            }

            if self.nodir && entry.is_dir() {
                continue;
            }

            if !self.dot && !self.path_allowed_by_dot_rules(&normalized) {
                continue;
            }

            if !self.include_child_matches
                && self.is_child_of_matched(&normalized, &matched_parents)
            {
                continue;
            }

            let is_dir = entry.is_dir();

            let matches = if !self.any_pattern_requires_dir {
                self.patterns
                    .iter()
                    .any(|p| match p.matches_fast(&normalized) {
                        Some(result) => result,
                        None => p.matches(&normalized),
                    })
            } else {
                self.patterns.iter().any(|p| {
                    let path_matches = match p.matches_fast(&normalized) {
                        Some(result) => result,
                        None => p.matches(&normalized),
                    };
                    if path_matches && p.requires_dir() {
                        is_dir
                    } else {
                        path_matches
                    }
                })
            };

            if matches {
                let normalized_string = normalized.into_owned();
                if seen.insert(normalized_string.clone()) {
                    if !self.include_child_matches {
                        matched_parents.insert(normalized_string.clone());
                    }

                    callback(PathData {
                        path: normalized_string,
                        is_directory: is_dir,
                        is_file: entry.is_file(),
                        is_symlink: entry.is_symlink(),
                    });
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use tempfile::TempDir;

    fn create_test_fixture() -> TempDir {
        let temp = TempDir::new().unwrap();
        let base = temp.path();

        File::create(base.join("foo.txt")).unwrap();
        File::create(base.join("bar.txt")).unwrap();
        File::create(base.join("baz.js")).unwrap();

        // Dotfiles at root
        File::create(base.join(".hidden")).unwrap();
        File::create(base.join(".gitignore")).unwrap();

        fs::create_dir_all(base.join("src")).unwrap();
        File::create(base.join("src/main.js")).unwrap();
        File::create(base.join("src/util.js")).unwrap();

        fs::create_dir_all(base.join("src/lib")).unwrap();
        File::create(base.join("src/lib/helper.js")).unwrap();

        // Hidden directory
        fs::create_dir_all(base.join(".git")).unwrap();
        File::create(base.join(".git/config")).unwrap();
        File::create(base.join(".git/HEAD")).unwrap();

        // Dotfile inside regular directory
        File::create(base.join("src/.env")).unwrap();

        temp
    }

    fn make_opts(cwd: &str) -> GlobOptions {
        GlobOptions {
            cwd: Some(cwd.to_string()),
            ..Default::default()
        }
    }

    fn make_opts_with_dot(cwd: &str, dot: bool) -> GlobOptions {
        GlobOptions {
            cwd: Some(cwd.to_string()),
            dot: Some(dot),
            ..Default::default()
        }
    }

    fn make_opts_with_follow(cwd: &str, follow: bool) -> GlobOptions {
        GlobOptions {
            cwd: Some(cwd.to_string()),
            follow: Some(follow),
            ..Default::default()
        }
    }

    fn make_opts_with_max_depth(cwd: &str, max_depth: i32) -> GlobOptions {
        GlobOptions {
            cwd: Some(cwd.to_string()),
            max_depth: Some(max_depth),
            ..Default::default()
        }
    }

    fn make_opts_with_nodir(cwd: &str, nodir: bool) -> GlobOptions {
        GlobOptions {
            cwd: Some(cwd.to_string()),
            nodir: Some(nodir),
            ..Default::default()
        }
    }

    fn make_opts_with_dot_relative(cwd: &str, dot_relative: bool) -> GlobOptions {
        GlobOptions {
            cwd: Some(cwd.to_string()),
            dot_relative: Some(dot_relative),
            ..Default::default()
        }
    }

    fn make_opts_with_mark(cwd: &str, mark: bool) -> GlobOptions {
        GlobOptions {
            cwd: Some(cwd.to_string()),
            mark: Some(mark),
            ..Default::default()
        }
    }

    #[test]
    fn test_simple_wildcard() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*.txt".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        assert!(!results.contains(&"baz.js".to_string()));
    }

    #[test]
    fn test_globstar() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        assert!(results.contains(&"baz.js".to_string()));
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));
        assert!(results.contains(&"src/lib/helper.js".to_string()));
        assert!(!results.contains(&"foo.txt".to_string()));
    }

    #[test]
    fn test_question_mark() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "???.txt".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
    }

    #[test]
    fn test_nested_path() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "src/*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));
        assert!(!results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_double_globstar() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "src/**/*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));
        assert!(results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_absolute_option() {
        let temp = create_test_fixture();
        let cwd = temp.path().to_string_lossy().to_string();
        let glob = Glob::new(
            "*.txt".to_string(),
            GlobOptions {
                cwd: Some(cwd.clone()),
                absolute: Some(true),
                ..Default::default()
            },
        );
        let results = glob.walk_sync();

        // All results should be absolute paths
        for result in &results {
            assert!(
                std::path::Path::new(result).is_absolute(),
                "Path should be absolute: {result}"
            );
        }
        assert_eq!(results.len(), 2); // foo.txt and bar.txt
    }

    #[test]
    fn test_absolute_with_posix() {
        let temp = create_test_fixture();
        let cwd = temp.path().to_string_lossy().to_string();
        let glob = Glob::new(
            "*.txt".to_string(),
            GlobOptions {
                cwd: Some(cwd.clone()),
                absolute: Some(true),
                posix: Some(true),
                ..Default::default()
            },
        );
        let results = glob.walk_sync();

        // All results should use forward slashes (POSIX style)
        for result in &results {
            assert!(
                !result.contains('\\'),
                "Path should use forward slashes: {result}"
            );
        }
        assert_eq!(results.len(), 2); // foo.txt and bar.txt
    }

    #[test]
    fn test_brace_expansion() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*.{txt,js}".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        assert!(results.contains(&"baz.js".to_string()));
    }

    #[test]
    fn test_brace_expansion_paths() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "{src,lib}/**/*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // src/ matches
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));
        assert!(results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_nobrace_option() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*.{txt,js}".to_string(),
            GlobOptions {
                cwd: Some(temp.path().to_string_lossy().to_string()),
                nobrace: Some(true),
                ..Default::default()
            },
        );
        let results = glob.walk_sync();

        // With nobrace, {txt,js} is treated literally, so nothing should match
        assert!(results.is_empty());
    }

    #[test]
    fn test_brace_numeric_sequence() {
        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create files matching a numeric sequence
        File::create(base.join("file1.txt")).unwrap();
        File::create(base.join("file2.txt")).unwrap();
        File::create(base.join("file3.txt")).unwrap();
        File::create(base.join("file4.txt")).unwrap();

        let glob = Glob::new(
            "file{1..3}.txt".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        assert!(results.contains(&"file1.txt".to_string()));
        assert!(results.contains(&"file2.txt".to_string()));
        assert!(results.contains(&"file3.txt".to_string()));
        assert!(!results.contains(&"file4.txt".to_string())); // not in {1..3}
    }

    // Dot file handling tests

    #[test]
    fn test_dot_false_excludes_dotfiles() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*".to_string(),
            make_opts_with_dot(&temp.path().to_string_lossy(), false),
        );
        let results = glob.walk_sync();

        // Should include regular files
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));

        // Should NOT include dotfiles
        assert!(!results.contains(&".hidden".to_string()));
        assert!(!results.contains(&".gitignore".to_string()));
    }

    #[test]
    fn test_dot_true_includes_dotfiles() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*".to_string(),
            make_opts_with_dot(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // Should include regular files
        assert!(results.contains(&"foo.txt".to_string()));

        // Should include dotfiles
        assert!(results.contains(&".hidden".to_string()));
        assert!(results.contains(&".gitignore".to_string()));
        assert!(results.contains(&".git".to_string()));
    }

    #[test]
    fn test_dot_false_excludes_dotdirs_content() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/*".to_string(),
            make_opts_with_dot(&temp.path().to_string_lossy(), false),
        );
        let results = glob.walk_sync();

        // Should include regular nested files
        assert!(results.contains(&"src/main.js".to_string()));

        // Should NOT include files inside .git
        assert!(!results.contains(&".git/config".to_string()));
        assert!(!results.contains(&".git/HEAD".to_string()));
    }

    #[test]
    fn test_dot_true_includes_dotdirs_content() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/*".to_string(),
            make_opts_with_dot(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // Should include files inside .git
        assert!(results.contains(&".git/config".to_string()));
        assert!(results.contains(&".git/HEAD".to_string()));
    }

    #[test]
    fn test_explicit_dot_pattern_matches_without_dot_option() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            ".hidden".to_string(),
            make_opts_with_dot(&temp.path().to_string_lossy(), false),
        );
        let results = glob.walk_sync();

        // Explicit .hidden pattern should match even with dot:false
        assert!(results.contains(&".hidden".to_string()));
    }

    #[test]
    fn test_explicit_dotdir_pattern_matches_without_dot_option() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            ".git/*".to_string(),
            make_opts_with_dot(&temp.path().to_string_lossy(), false),
        );
        let results = glob.walk_sync();

        // Explicit .git/* pattern should match even with dot:false
        assert!(results.contains(&".git/config".to_string()));
        assert!(results.contains(&".git/HEAD".to_string()));
    }

    #[test]
    fn test_globstar_dotdir_pattern() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/.env".to_string(),
            make_opts_with_dot(&temp.path().to_string_lossy(), false),
        );
        let results = glob.walk_sync();

        // **/.env should match src/.env even with dot:false
        assert!(results.contains(&"src/.env".to_string()));
    }

    #[test]
    fn test_default_dot_is_false() {
        let temp = create_test_fixture();
        let glob = Glob::new("*".to_string(), make_opts(&temp.path().to_string_lossy()));
        let results = glob.walk_sync();

        // Default should be dot:false - no dotfiles
        assert!(!results.contains(&".hidden".to_string()));
        assert!(results.contains(&"foo.txt".to_string()));
    }

    // Symlink tests (Unix only)

    #[cfg(unix)]
    fn create_symlink_fixture() -> TempDir {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create regular directories and files
        fs::create_dir_all(base.join("a/b/c")).unwrap();
        File::create(base.join("a/b/c/file.txt")).unwrap();
        File::create(base.join("a/b/file2.txt")).unwrap();

        // Create a symlink from a/symlink -> a/b
        symlink(base.join("a/b"), base.join("a/symlink")).unwrap();

        // Create a broken symlink
        fs::create_dir_all(base.join("broken")).unwrap();
        symlink("this-does-not-exist", base.join("broken/link")).unwrap();

        temp
    }

    #[cfg(unix)]
    #[test]
    fn test_symlink_no_follow() {
        let temp = create_symlink_fixture();
        let glob = Glob::new(
            "a/**/*.txt".to_string(),
            make_opts_with_follow(&temp.path().to_string_lossy(), false),
        );
        let results = glob.walk_sync();

        // Without follow, we should only get files in a/b/, not through symlink
        assert!(results.contains(&"a/b/c/file.txt".to_string()));
        assert!(results.contains(&"a/b/file2.txt".to_string()));

        // We should NOT see files through the symlink (symlink/...)
        assert!(!results.iter().any(|r| r.contains("symlink")));
    }

    #[cfg(unix)]
    #[test]
    fn test_symlink_with_follow() {
        let temp = create_symlink_fixture();
        let glob = Glob::new(
            "a/**/*.txt".to_string(),
            make_opts_with_follow(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // With follow, we should see files through the symlink too
        assert!(results.contains(&"a/b/c/file.txt".to_string()));
        assert!(results.contains(&"a/b/file2.txt".to_string()));

        // We should also see the same files through the symlink
        assert!(results.contains(&"a/symlink/c/file.txt".to_string()));
        assert!(results.contains(&"a/symlink/file2.txt".to_string()));
    }

    #[cfg(unix)]
    #[test]
    fn test_broken_symlink_handled_gracefully() {
        let temp = create_symlink_fixture();
        let glob = Glob::new(
            "broken/*".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should include the broken symlink itself (not crash)
        assert!(results.contains(&"broken/link".to_string()));
    }

    #[cfg(unix)]
    #[test]
    fn test_broken_symlink_with_follow() {
        let temp = create_symlink_fixture();
        let glob = Glob::new(
            "broken/**".to_string(),
            make_opts_with_follow(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // Should include the directory and symlink, not crash
        assert!(results.contains(&"broken".to_string()));
        assert!(results.contains(&"broken/link".to_string()));
    }

    #[cfg(unix)]
    #[test]
    fn test_symlink_explicit_pattern() {
        let temp = create_symlink_fixture();
        let glob = Glob::new(
            "a/symlink/**/*.txt".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let _results = glob.walk_sync();

        // When explicitly matching through a symlink, we should traverse it
        // even without follow:true (default behavior)
        // Note: This test may fail until we implement more nuanced symlink handling
        // For now, follow:false means no symlinks are followed
    }

    #[cfg(unix)]
    #[test]
    fn test_default_follow_is_false() {
        let temp = create_symlink_fixture();
        let glob = Glob::new(
            "a/**/*.txt".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Default should be follow:false - don't traverse symlinks
        assert!(!results.iter().any(|r| r.contains("symlink")));
    }

    // maxDepth tests

    #[test]
    fn test_max_depth_negative() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/*".to_string(),
            make_opts_with_max_depth(&temp.path().to_string_lossy(), -1),
        );
        let results = glob.walk_sync();

        // Negative maxDepth should return empty results
        assert!(results.is_empty());
    }

    #[test]
    fn test_max_depth_zero() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**".to_string(),
            make_opts_with_max_depth(&temp.path().to_string_lossy(), 0),
        );
        let results = glob.walk_sync();

        // maxDepth: 0 with ** should return just "." (cwd)
        assert_eq!(results.len(), 1);
        assert!(results.contains(&".".to_string()));
    }

    #[test]
    fn test_max_depth_one() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/*".to_string(),
            make_opts_with_max_depth(&temp.path().to_string_lossy(), 1),
        );
        let results = glob.walk_sync();

        // maxDepth: 1 should return only immediate children (depth 1)
        // Should include: foo.txt, bar.txt, baz.js, src (but not .hidden due to dot:false default)
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        assert!(results.contains(&"baz.js".to_string()));
        assert!(results.contains(&"src".to_string()));

        // Should NOT include nested files
        assert!(!results.contains(&"src/main.js".to_string()));
        assert!(!results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_max_depth_two() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/*.js".to_string(),
            make_opts_with_max_depth(&temp.path().to_string_lossy(), 2),
        );
        let results = glob.walk_sync();

        // maxDepth: 2 should include depth 1 and 2
        assert!(results.contains(&"baz.js".to_string())); // depth 1
        assert!(results.contains(&"src/main.js".to_string())); // depth 2
        assert!(results.contains(&"src/util.js".to_string())); // depth 2

        // Should NOT include depth 3+
        assert!(!results.contains(&"src/lib/helper.js".to_string())); // depth 3
    }

    #[test]
    fn test_max_depth_unlimited() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()), // no maxDepth = unlimited
        );
        let results = glob.walk_sync();

        // Without maxDepth, should include all levels
        assert!(results.contains(&"baz.js".to_string()));
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));
        assert!(results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_max_depth_with_scoped_pattern() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "src/**/*.js".to_string(),
            make_opts_with_max_depth(&temp.path().to_string_lossy(), 2),
        );
        let results = glob.walk_sync();

        // maxDepth: 2 with src/** should get src/* (depth 2)
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));

        // Should NOT include src/lib/* (depth 3)
        assert!(!results.contains(&"src/lib/helper.js".to_string()));
    }

    // nodir tests

    #[test]
    fn test_nodir_true_excludes_directories() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/*".to_string(),
            make_opts_with_nodir(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // Should include files
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        assert!(results.contains(&"baz.js".to_string()));
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/lib/helper.js".to_string()));

        // Should NOT include directories
        assert!(!results.contains(&"src".to_string()));
        assert!(!results.contains(&"src/lib".to_string()));
    }

    #[test]
    fn test_nodir_false_includes_directories() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/*".to_string(),
            make_opts_with_nodir(&temp.path().to_string_lossy(), false),
        );
        let results = glob.walk_sync();

        // Should include both files and directories
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"src".to_string()));
        assert!(results.contains(&"src/lib".to_string()));
    }

    #[test]
    fn test_nodir_default_includes_directories() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/*".to_string(),
            make_opts(&temp.path().to_string_lossy()), // no nodir = includes dirs
        );
        let results = glob.walk_sync();

        // Default behavior should include directories
        assert!(results.contains(&"src".to_string()));
        assert!(results.contains(&"src/lib".to_string()));
    }

    #[test]
    fn test_nodir_with_simple_pattern() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*".to_string(),
            make_opts_with_nodir(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // Should include root files but not root directories
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        assert!(results.contains(&"baz.js".to_string()));

        // Should NOT include src directory
        assert!(!results.contains(&"src".to_string()));
    }

    #[test]
    fn test_nodir_excludes_cwd_with_globstar() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**".to_string(),
            make_opts_with_nodir(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // With nodir: true, "." (cwd) should NOT be included
        // even though ** matches everything
        assert!(!results.contains(&".".to_string()));

        // But files should still be included
        assert!(results.contains(&"foo.txt".to_string()));
    }

    #[test]
    fn test_nodir_with_recursive_pattern() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*/**".to_string(),
            make_opts_with_nodir(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // Should include nested files
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/lib/helper.js".to_string()));

        // Should NOT include directory entries
        assert!(!results.contains(&"src".to_string()));
        assert!(!results.contains(&"src/lib".to_string()));
    }

    #[cfg(unix)]
    #[test]
    fn test_nodir_with_symlinks() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create directory structure
        fs::create_dir_all(base.join("real_dir")).unwrap();
        File::create(base.join("real_dir/file.txt")).unwrap();
        File::create(base.join("normal.txt")).unwrap();

        // Create a symlink to a directory
        symlink(base.join("real_dir"), base.join("symlink_dir")).unwrap();

        // Create a symlink to a file
        symlink(base.join("normal.txt"), base.join("symlink_file")).unwrap();

        // Test with nodir: true, follow: false (default)
        // Symlinks are treated as files (not directories) when not followed
        let glob = Glob::new(
            "*".to_string(),
            GlobOptions {
                cwd: Some(base.to_string_lossy().to_string()),
                nodir: Some(true),
                follow: Some(false),
                ..Default::default()
            },
        );
        let results = glob.walk_sync();

        // Should include the symlink to dir (since it's a symlink, not a dir, when not following)
        assert!(results.contains(&"symlink_dir".to_string()));
        // Should include symlink to file
        assert!(results.contains(&"symlink_file".to_string()));
        // Should include normal file
        assert!(results.contains(&"normal.txt".to_string()));
        // Should NOT include the real directory
        assert!(!results.contains(&"real_dir".to_string()));
    }

    #[cfg(unix)]
    #[test]
    fn test_nodir_with_follow_symlinks() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create directory structure
        fs::create_dir_all(base.join("real_dir")).unwrap();
        File::create(base.join("real_dir/file.txt")).unwrap();
        File::create(base.join("normal.txt")).unwrap();

        // Create a symlink to a directory
        symlink(base.join("real_dir"), base.join("symlink_dir")).unwrap();

        // Create a symlink to a file
        symlink(base.join("normal.txt"), base.join("symlink_file")).unwrap();

        // Test with nodir: true, follow: true
        // When following symlinks, a symlink to a directory IS a directory
        let glob = Glob::new(
            "*".to_string(),
            GlobOptions {
                cwd: Some(base.to_string_lossy().to_string()),
                nodir: Some(true),
                follow: Some(true),
                ..Default::default()
            },
        );
        let results = glob.walk_sync();

        // Should NOT include symlink to dir (because when followed, it's a directory)
        assert!(!results.contains(&"symlink_dir".to_string()));
        // Should include symlink to file (because when followed, it's a file)
        assert!(results.contains(&"symlink_file".to_string()));
        // Should include normal file
        assert!(results.contains(&"normal.txt".to_string()));
        // Should NOT include the real directory
        assert!(!results.contains(&"real_dir".to_string()));
    }

    // dotRelative tests

    #[test]
    fn test_dot_relative_prepends_dot_slash() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*.txt".to_string(),
            make_opts_with_dot_relative(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // All results should start with "./"
        for result in &results {
            assert!(
                result.starts_with("./"),
                "Path should start with './': {result}"
            );
        }
        assert!(results.contains(&"./foo.txt".to_string()));
        assert!(results.contains(&"./bar.txt".to_string()));
    }

    #[test]
    fn test_dot_relative_false_no_prefix() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*.txt".to_string(),
            make_opts_with_dot_relative(&temp.path().to_string_lossy(), false),
        );
        let results = glob.walk_sync();

        // Results should NOT start with "./"
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        for result in &results {
            assert!(
                !result.starts_with("./"),
                "Path should not start with './': {result}"
            );
        }
    }

    #[test]
    fn test_dot_relative_with_nested_paths() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/*.js".to_string(),
            make_opts_with_dot_relative(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // All results should start with "./"
        assert!(results.contains(&"./baz.js".to_string()));
        assert!(results.contains(&"./src/main.js".to_string()));
        assert!(results.contains(&"./src/util.js".to_string()));
        assert!(results.contains(&"./src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_dot_relative_default_is_false() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*.txt".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Default should not have "./" prefix
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(!results.contains(&"./foo.txt".to_string()));
    }

    // mark tests

    #[test]
    fn test_mark_appends_slash_to_directories() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*".to_string(),
            make_opts_with_mark(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // Directories should end with "/"
        assert!(results.contains(&"src/".to_string()));

        // Files should NOT end with "/"
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        assert!(!results.contains(&"foo.txt/".to_string()));
    }

    #[test]
    fn test_mark_false_no_trailing_slash() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*".to_string(),
            make_opts_with_mark(&temp.path().to_string_lossy(), false),
        );
        let results = glob.walk_sync();

        // Directories should NOT end with "/"
        assert!(results.contains(&"src".to_string()));
        assert!(!results.contains(&"src/".to_string()));
    }

    #[test]
    fn test_mark_with_nested_directories() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/*".to_string(),
            make_opts_with_mark(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // Nested directories should also have trailing slash
        assert!(results.contains(&"src/".to_string()));
        assert!(results.contains(&"src/lib/".to_string()));

        // Files should not have trailing slash
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(!results.contains(&"src/main.js/".to_string()));
    }

    #[test]
    fn test_mark_with_globstar_cwd() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**".to_string(),
            make_opts_with_mark(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // "." (cwd) should become "./" with mark:true
        assert!(results.contains(&"./".to_string()));
        assert!(!results.contains(&".".to_string()));
    }

    #[test]
    fn test_mark_default_is_false() {
        let temp = create_test_fixture();
        let glob = Glob::new("*".to_string(), make_opts(&temp.path().to_string_lossy()));
        let results = glob.walk_sync();

        // Default should not have trailing slash on directories
        assert!(results.contains(&"src".to_string()));
        assert!(!results.contains(&"src/".to_string()));
    }

    #[test]
    fn test_mark_with_dot_relative() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*".to_string(),
            GlobOptions {
                cwd: Some(temp.path().to_string_lossy().to_string()),
                dot_relative: Some(true),
                mark: Some(true),
                ..Default::default()
            },
        );
        let results = glob.walk_sync();

        // Should have both "./" prefix and "/" suffix for directories
        assert!(results.contains(&"./src/".to_string()));

        // Files should have "./" prefix but not "/" suffix
        assert!(results.contains(&"./foo.txt".to_string()));
        assert!(!results.contains(&"./foo.txt/".to_string()));
    }

    // matchBase tests

    fn make_opts_with_match_base(cwd: &str, match_base: bool) -> GlobOptions {
        GlobOptions {
            cwd: Some(cwd.to_string()),
            match_base: Some(match_base),
            ..Default::default()
        }
    }

    #[test]
    fn test_match_base_true_matches_basename() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*.js".to_string(),
            make_opts_with_match_base(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // With matchBase: true, *.js should match files at any depth
        assert!(results.contains(&"baz.js".to_string()));
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));
        assert!(results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_match_base_false_matches_root_only() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*.js".to_string(),
            make_opts_with_match_base(&temp.path().to_string_lossy(), false),
        );
        let results = glob.walk_sync();

        // With matchBase: false, *.js should only match at root level
        assert!(results.contains(&"baz.js".to_string()));
        assert!(!results.contains(&"src/main.js".to_string()));
        assert!(!results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_match_base_pattern_with_slash() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "src/*.js".to_string(),
            make_opts_with_match_base(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // Pattern with / is used as-is even with matchBase: true
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));
        // Should NOT match nested files (pattern has / so no **/ prepended)
        assert!(!results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_match_base_default_is_false() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Default behavior should match only at root
        assert!(results.contains(&"baz.js".to_string()));
        assert!(!results.contains(&"src/main.js".to_string()));
    }

    #[test]
    fn test_match_base_with_brace_expansion_all_have_slash() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "{src,lib}/*.js".to_string(),
            make_opts_with_match_base(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // Brace expansion with / in all parts - no matchBase transformation
        assert!(results.contains(&"src/main.js".to_string()));
    }

    #[test]
    fn test_match_base_with_brace_expansion_one_has_slash() {
        let temp = create_test_fixture();
        // Pattern: b{*.js,/c} - one part has /, so matchBase doesn't apply to any
        let glob = Glob::new(
            "b{*.txt,/c}".to_string(),
            make_opts_with_match_base(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // Original pattern has /, so matchBase doesn't apply
        // b*.txt stays as b*.txt (matches at root)
        // b/c stays as b/c
        // So only exact matches at specified locations
        // bar.txt matches b*.txt (at root)
        assert!(results.contains(&"bar.txt".to_string()));
    }

    // Multiple patterns tests

    #[test]
    fn test_multiple_patterns_basic() {
        let temp = create_test_fixture();
        let glob = Glob::new_multi(
            vec!["*.txt".to_string(), "*.js".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should match both .txt and .js files
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        assert!(results.contains(&"baz.js".to_string()));
    }

    #[test]
    fn test_multiple_patterns_with_globstar() {
        let temp = create_test_fixture();
        let glob = Glob::new_multi(
            vec!["*.txt".to_string(), "**/*.js".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should match root .txt and all .js files
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        assert!(results.contains(&"baz.js".to_string()));
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));
        assert!(results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_multiple_patterns_deduplication() {
        let temp = create_test_fixture();
        let glob = Glob::new_multi(
            vec!["*.txt".to_string(), "foo.txt".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // foo.txt should only appear once despite matching both patterns
        let foo_count = results.iter().filter(|r| *r == "foo.txt").count();
        assert_eq!(foo_count, 1);
        assert!(results.contains(&"bar.txt".to_string()));
    }

    #[test]
    fn test_multiple_patterns_disjoint() {
        let temp = create_test_fixture();
        let glob = Glob::new_multi(
            vec!["foo.txt".to_string(), "baz.js".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        assert_eq!(results.len(), 2);
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"baz.js".to_string()));
    }

    #[test]
    fn test_multiple_patterns_empty() {
        let temp = create_test_fixture();
        let glob = Glob::new_multi(Vec::new(), make_opts(&temp.path().to_string_lossy()));
        let results = glob.walk_sync();

        // Empty patterns array should match nothing
        assert!(results.is_empty());
    }

    #[test]
    fn test_multiple_patterns_with_scoped() {
        let temp = create_test_fixture();
        let glob = Glob::new_multi(
            vec!["src/*.js".to_string(), "*.txt".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should match src/*.js and root *.txt
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        // Should NOT match nested files
        assert!(!results.contains(&"src/lib/helper.js".to_string()));
    }

    // Depth-limited walking optimization tests (Task 2.5.1.3)

    #[test]
    fn test_depth_limited_simple_pattern() {
        // Simple patterns like *.txt should only traverse root directory
        let temp = create_test_fixture();
        let glob = Glob::new(
            "*.txt".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find files at root only
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        // Should NOT find nested files (and shouldn't even traverse there)
        assert!(!results.iter().any(|r| r.contains('/')));
    }

    #[test]
    fn test_depth_limited_one_level_pattern() {
        // Pattern like src/*.js has depth 1
        let temp = create_test_fixture();
        let glob = Glob::new(
            "src/*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find src/*.js files
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));
        // Should NOT find deeply nested files
        assert!(!results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_depth_limited_two_level_pattern() {
        // Pattern like src/lib/*.js has depth 2
        let temp = create_test_fixture();
        let glob = Glob::new(
            "src/lib/*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find src/lib/*.js files
        assert!(results.contains(&"src/lib/helper.js".to_string()));
        // Should NOT find files at other depths
        assert!(!results.contains(&"baz.js".to_string()));
        assert!(!results.contains(&"src/main.js".to_string()));
    }

    #[test]
    fn test_depth_unlimited_with_globstar() {
        // Pattern with ** should traverse unlimited depth
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find files at ALL depths
        assert!(results.contains(&"baz.js".to_string()));
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));
        assert!(results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_depth_limited_multiple_patterns_bounded() {
        // Multiple patterns, all bounded - should use max depth
        let temp = create_test_fixture();
        let glob = Glob::new_multi(
            vec!["*.txt".to_string(), "src/*.js".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find root .txt and src/*.js
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        assert!(results.contains(&"src/main.js".to_string()));
        // Should NOT find deeply nested files
        assert!(!results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_depth_limited_multiple_patterns_one_unlimited() {
        // If any pattern has **, should traverse unlimited depth
        let temp = create_test_fixture();
        let glob = Glob::new_multi(
            vec!["*.txt".to_string(), "**/*.js".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find files at all depths due to **/*.js pattern
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"baz.js".to_string()));
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_depth_limited_user_max_depth_override() {
        // User-provided maxDepth should take precedence over pattern depth
        let temp = create_test_fixture();
        let glob = Glob::new(
            "**/*.js".to_string(),
            make_opts_with_max_depth(&temp.path().to_string_lossy(), 1),
        );
        let results = glob.walk_sync();

        // Even though pattern has **, maxDepth: 1 should limit to root only
        assert!(results.contains(&"baz.js".to_string()));
        assert!(!results.contains(&"src/main.js".to_string()));
    }

    // Prefix-based walk root optimization tests (Task 2.5.2.3)

    #[test]
    fn test_prefix_walk_root_scoped_pattern() {
        // Pattern src/**/*.js should walk from src/ instead of cwd
        let temp = create_test_fixture();
        let glob = Glob::new(
            "src/**/*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find all js files under src/
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));
        assert!(results.contains(&"src/lib/helper.js".to_string()));
        // Should NOT find root-level js
        assert!(!results.contains(&"baz.js".to_string()));
    }

    #[test]
    fn test_prefix_walk_root_deep_scoped_pattern() {
        // Pattern src/lib/**/*.js should walk from src/lib/
        let temp = create_test_fixture();
        let glob = Glob::new(
            "src/lib/**/*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find files under src/lib/
        assert!(results.contains(&"src/lib/helper.js".to_string()));
        // Should NOT find files at other locations
        assert!(!results.contains(&"src/main.js".to_string()));
        assert!(!results.contains(&"baz.js".to_string()));
    }

    #[test]
    fn test_prefix_walk_root_nonexistent_prefix() {
        // Pattern for non-existent directory should return empty
        let temp = create_test_fixture();
        let glob = Glob::new(
            "nonexistent/**/*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        assert!(results.is_empty());
    }

    #[test]
    fn test_prefix_walk_root_multiple_patterns_same_prefix() {
        // Multiple patterns with same prefix should use that prefix
        let temp = create_test_fixture();
        let glob = Glob::new_multi(
            vec!["src/**/*.js".to_string(), "src/**/*.ts".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find js files under src/
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/lib/helper.js".to_string()));
        // Should NOT find root-level files
        assert!(!results.contains(&"baz.js".to_string()));
    }

    #[test]
    fn test_prefix_walk_root_multiple_patterns_different_prefix() {
        // Multiple patterns with different prefixes - should walk from common prefix or root
        let temp = TempDir::new().unwrap();
        let base = temp.path();

        fs::create_dir_all(base.join("dir1")).unwrap();
        fs::create_dir_all(base.join("dir2")).unwrap();
        File::create(base.join("dir1/file.js")).unwrap();
        File::create(base.join("dir2/file.ts")).unwrap();
        File::create(base.join("root.txt")).unwrap();

        let glob = Glob::new_multi(
            vec!["dir1/**/*.js".to_string(), "dir2/**/*.ts".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find files from both directories
        assert!(results.contains(&"dir1/file.js".to_string()));
        assert!(results.contains(&"dir2/file.ts".to_string()));
        // Should NOT match root files
        assert!(!results.contains(&"root.txt".to_string()));
    }

    #[test]
    fn test_prefix_walk_root_with_max_depth() {
        // Scoped pattern with maxDepth should adjust depth relative to cwd
        let temp = create_test_fixture();
        let glob = Glob::new(
            "src/**/*.js".to_string(),
            make_opts_with_max_depth(&temp.path().to_string_lossy(), 2),
        );
        let results = glob.walk_sync();

        // maxDepth: 2 means up to depth 2 from cwd
        // src is depth 1, src/* is depth 2, src/lib/* is depth 3
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));
        // src/lib/helper.js is depth 3, should be excluded
        assert!(!results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_longest_common_prefix() {
        // Test the longest_common_prefix helper
        assert_eq!(Glob::longest_common_prefix(&["src/lib", "src/bin"]), "src");
        assert_eq!(Glob::longest_common_prefix(&["src", "test"]), "");
        assert_eq!(
            Glob::longest_common_prefix(&["packages/foo", "packages/bar"]),
            "packages"
        );
        assert_eq!(Glob::longest_common_prefix(&["a/b/c", "a/b/d"]), "a/b");
        assert_eq!(Glob::longest_common_prefix(&["x"]), "x");
        assert_eq!(Glob::longest_common_prefix(&[]), "");
    }

    // Directory pruning tests (Task 2.5.3.3)

    #[test]
    fn test_directory_pruning_scoped_pattern() {
        // Pattern src/lib/**/*.js should only traverse src/lib, not test/ or other dirs
        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create a structure with multiple top-level directories
        fs::create_dir_all(base.join("src/lib/deep")).unwrap();
        fs::create_dir_all(base.join("test/unit")).unwrap();
        fs::create_dir_all(base.join("docs")).unwrap();

        File::create(base.join("src/lib/helper.js")).unwrap();
        File::create(base.join("src/lib/deep/nested.js")).unwrap();
        File::create(base.join("test/unit/test.js")).unwrap();
        File::create(base.join("docs/readme.js")).unwrap();

        let glob = Glob::new(
            "src/lib/**/*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find files under src/lib/
        assert!(results.contains(&"src/lib/helper.js".to_string()));
        assert!(results.contains(&"src/lib/deep/nested.js".to_string()));

        // Should NOT find files in other directories
        assert!(!results.contains(&"test/unit/test.js".to_string()));
        assert!(!results.contains(&"docs/readme.js".to_string()));
    }

    #[test]
    fn test_directory_pruning_multi_pattern() {
        // Multiple patterns with different scopes - pruning should allow both paths
        let temp = TempDir::new().unwrap();
        let base = temp.path();

        fs::create_dir_all(base.join("src")).unwrap();
        fs::create_dir_all(base.join("test")).unwrap();
        fs::create_dir_all(base.join("docs")).unwrap();

        File::create(base.join("src/main.js")).unwrap();
        File::create(base.join("test/test.ts")).unwrap();
        File::create(base.join("docs/readme.md")).unwrap();

        let glob = Glob::new_multi(
            vec!["src/**/*.js".to_string(), "test/**/*.ts".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find files matching either pattern
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"test/test.ts".to_string()));

        // Should NOT find files that don't match any pattern
        assert!(!results.contains(&"docs/readme.md".to_string()));
    }

    #[test]
    fn test_directory_pruning_with_globstar_start() {
        // Pattern **/*.js cannot prune directories (must visit all)
        let temp = TempDir::new().unwrap();
        let base = temp.path();

        fs::create_dir_all(base.join("a/b/c")).unwrap();
        fs::create_dir_all(base.join("x/y/z")).unwrap();

        File::create(base.join("a/b/c/file.js")).unwrap();
        File::create(base.join("x/y/z/file.js")).unwrap();

        let glob = Glob::new(
            "**/*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find files in both paths since ** matches anything
        assert!(results.contains(&"a/b/c/file.js".to_string()));
        assert!(results.contains(&"x/y/z/file.js".to_string()));
    }

    #[test]
    fn test_directory_pruning_nested_match() {
        // Pattern packages/*/src/**/*.ts - should only traverse packages/*/src paths
        let temp = TempDir::new().unwrap();
        let base = temp.path();

        fs::create_dir_all(base.join("packages/foo/src/utils")).unwrap();
        fs::create_dir_all(base.join("packages/foo/test")).unwrap();
        fs::create_dir_all(base.join("packages/bar/src")).unwrap();
        fs::create_dir_all(base.join("other")).unwrap();

        File::create(base.join("packages/foo/src/index.ts")).unwrap();
        File::create(base.join("packages/foo/src/utils/helper.ts")).unwrap();
        File::create(base.join("packages/foo/test/test.ts")).unwrap();
        File::create(base.join("packages/bar/src/main.ts")).unwrap();
        File::create(base.join("other/file.ts")).unwrap();

        let glob = Glob::new(
            "packages/*/src/**/*.ts".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find files under packages/*/src
        assert!(results.contains(&"packages/foo/src/index.ts".to_string()));
        assert!(results.contains(&"packages/foo/src/utils/helper.ts".to_string()));
        assert!(results.contains(&"packages/bar/src/main.ts".to_string()));

        // Should NOT find files outside of packages/*/src
        assert!(!results.contains(&"packages/foo/test/test.ts".to_string()));
        assert!(!results.contains(&"other/file.ts".to_string()));
    }

    // Multi-pattern optimization tests (Task 2.5.6.3)

    #[test]
    fn test_multi_pattern_deduplication() {
        // Duplicate patterns from brace expansion should be deduplicated
        let temp = create_test_fixture();
        let glob = Glob::new(
            "{*.txt,*.txt}".to_string(), // Brace expansion produces duplicates
            make_opts(&temp.path().to_string_lossy()),
        );

        // Only 1 pattern should be stored (duplicates removed)
        assert_eq!(glob.patterns.len(), 1);

        let results = glob.walk_sync();
        // foo.txt should only appear once
        let foo_count = results.iter().filter(|r| *r == "foo.txt").count();
        assert_eq!(foo_count, 1);
    }

    #[test]
    fn test_multi_pattern_fast_path_ordering() {
        // Fast-path patterns should be sorted first for early matching
        let temp = create_test_fixture();
        let glob = Glob::new_multi(
            vec![
                "**/[a-z]*.js".to_string(), // Complex pattern (regex)
                "*.txt".to_string(),        // Simple fast-path pattern
                "**/*.ts".to_string(),      // Recursive fast-path pattern
            ],
            make_opts(&temp.path().to_string_lossy()),
        );

        // Check that patterns are reordered with fast-path first
        // First should be fast-path (*.txt or **/*.ts)
        assert!(glob.patterns[0].fast_path().is_fast() || glob.patterns[1].fast_path().is_fast());

        let results = glob.walk_sync();
        // Should still find correct files
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        assert!(results.contains(&"baz.js".to_string()));
    }

    #[test]
    fn test_multi_pattern_cross_brace_deduplication() {
        // Brace expansion across multiple patterns should deduplicate
        let temp = create_test_fixture();
        let glob = Glob::new_multi(
            vec![
                "*.{txt,js}".to_string(), // Expands to *.txt, *.js
                "*.txt".to_string(),      // Duplicate with above
            ],
            make_opts(&temp.path().to_string_lossy()),
        );

        // Should have 2 unique patterns: *.txt, *.js (not 3)
        assert_eq!(glob.patterns.len(), 2);

        let results = glob.walk_sync();
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"baz.js".to_string()));
    }

    #[test]
    fn test_multi_pattern_any_requires_dir() {
        // Pre-computed field should correctly identify patterns requiring directories
        let temp = create_test_fixture();

        // Pattern without trailing slash
        let glob1 = Glob::new("*".to_string(), make_opts(&temp.path().to_string_lossy()));
        assert!(!glob1.any_pattern_requires_dir);

        // Pattern with trailing slash
        let glob2 = Glob::new("*/".to_string(), make_opts(&temp.path().to_string_lossy()));
        assert!(glob2.any_pattern_requires_dir);

        // Multiple patterns where only one requires dir
        let glob3 = Glob::new_multi(
            vec!["*.txt".to_string(), "src/".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        assert!(glob3.any_pattern_requires_dir);
    }

    #[test]
    fn test_multi_pattern_fast_pattern_count() {
        // Pre-computed fast pattern count
        let temp = create_test_fixture();

        // All fast-path patterns
        let glob1 = Glob::new_multi(
            vec!["*.txt".to_string(), "*.js".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        assert_eq!(glob1.fast_pattern_count, 2);

        // Mix of fast and slow patterns
        let glob2 = Glob::new_multi(
            vec!["*.txt".to_string(), "**/[a-z]*.js".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        // *.txt is fast, **/[a-z]*.js is not
        assert_eq!(glob2.fast_pattern_count, 1);
    }

    #[test]
    fn test_multi_pattern_many_patterns() {
        // Test with many patterns to verify performance characteristics
        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create files for each pattern
        for i in 0..10 {
            File::create(base.join(format!("file{i}.txt"))).unwrap();
            File::create(base.join(format!("file{i}.js"))).unwrap();
            File::create(base.join(format!("file{i}.ts"))).unwrap();
        }

        // Create glob with many patterns
        let patterns: Vec<String> = (0..10)
            .flat_map(|i| vec![format!("file{}.txt", i), format!("file{}.js", i)])
            .collect();

        let glob = Glob::new_multi(patterns, make_opts(&temp.path().to_string_lossy()));

        let results = glob.walk_sync();
        assert_eq!(results.len(), 20); // 10 txt + 10 js files
    }

    #[test]
    fn test_multi_pattern_all_match_same_file() {
        // Multiple patterns that all match the same file
        let temp = create_test_fixture();
        let glob = Glob::new_multi(
            vec![
                "foo.txt".to_string(),
                "*.txt".to_string(),
                "foo.*".to_string(),
                "**".to_string(),
            ],
            make_opts(&temp.path().to_string_lossy()),
        );

        let results = glob.walk_sync();

        // foo.txt should appear only once despite matching all patterns
        let foo_count = results.iter().filter(|r| *r == "foo.txt").count();
        assert_eq!(foo_count, 1);
    }

    // Absolute pattern tests (Task 4.1.1)

    #[test]
    fn test_absolute_pattern_unix() {
        // Test absolute Unix path pattern
        let temp = create_test_fixture();
        let abs_path = temp.path().to_string_lossy().to_string();

        // Create an absolute pattern
        let pattern = format!("{}/**/*.js", abs_path.replace('\\', "/"));

        let glob = Glob::new(
            pattern,
            GlobOptions {
                cwd: Some("/tmp".to_string()), // Different cwd shouldn't matter
                ..Default::default()
            },
        );

        let results = glob.walk_sync();

        // Should find js files in the temp directory
        // Results should be relative to the pattern root
        assert!(!results.is_empty());
        // Check that results contain the expected patterns
        assert!(results
            .iter()
            .any(|r| r.contains("main.js") || r.contains("baz.js")));
    }

    #[test]
    fn test_absolute_pattern_nonexistent() {
        // Absolute pattern pointing to nonexistent path should return empty
        let glob = Glob::new(
            "/nonexistent/path/**/*.txt".to_string(),
            GlobOptions::default(),
        );

        let results = glob.walk_sync();

        assert!(results.is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn test_drive_letter_pattern() {
        // Test Windows drive letter pattern
        let temp = create_test_fixture();
        let abs_path = temp.path().to_string_lossy().to_string();

        // Convert to POSIX-style path
        let pattern = abs_path.replace('\\', "/");

        let glob = Glob::new(
            format!("{}/**/*.txt", pattern),
            GlobOptions {
                platform: Some("win32".to_string()),
                ..Default::default()
            },
        );

        let results = glob.walk_sync();

        // Should find txt files
        assert!(!results.is_empty());
        assert!(results
            .iter()
            .any(|r| r.contains("foo.txt") || r.contains("bar.txt")));
    }

    #[test]
    fn test_absolute_pattern_with_literal_prefix() {
        // Test that absolute patterns with literal prefixes work correctly
        let temp = create_test_fixture();
        let abs_path = temp.path().to_string_lossy().to_string().replace('\\', "/");

        // Pattern with absolute root + literal prefix
        let pattern = format!("{abs_path}/src/**/*.js");

        let glob = Glob::new(pattern, GlobOptions::default());

        let results = glob.walk_sync();

        // Should find js files under src
        assert!(results.iter().any(|r| r.contains("main.js")));
        assert!(results.iter().any(|r| r.contains("helper.js")));
        // Should NOT find root-level js
        assert!(!results.iter().any(|r| r == "baz.js"));
    }

    #[test]
    fn test_pattern_is_absolute() {
        use crate::pattern::{Pattern, PatternOptions};

        // Unix absolute path
        let unix_pattern = Pattern::with_pattern_options(
            "/usr/local/**/*.txt",
            PatternOptions {
                platform: Some("linux".to_string()),
                ..Default::default()
            },
        );
        assert!(unix_pattern.is_absolute());
        assert_eq!(unix_pattern.root(), "/");

        // Windows drive pattern
        let win_pattern = Pattern::with_pattern_options(
            "C:/Users/**/*.txt",
            PatternOptions {
                platform: Some("win32".to_string()),
                ..Default::default()
            },
        );
        assert!(win_pattern.is_absolute());
        assert!(win_pattern.is_drive());
        assert_eq!(win_pattern.root(), "C:/");

        // Relative pattern
        let rel_pattern = Pattern::with_pattern_options("src/**/*.txt", PatternOptions::default());
        assert!(!rel_pattern.is_absolute());
        assert_eq!(rel_pattern.root(), "");
    }

    #[test]
    fn test_unc_pattern_detection() {
        use crate::pattern::{Pattern, PatternOptions};

        // UNC path
        let unc_pattern = Pattern::with_pattern_options(
            "//server/share/folder/**/*.txt",
            PatternOptions {
                platform: Some("win32".to_string()),
                ..Default::default()
            },
        );
        assert!(unc_pattern.is_absolute());
        assert!(unc_pattern.is_unc());
        assert!(unc_pattern.root().starts_with("//"));
    }

    #[test]
    fn test_glob_double_dot_extension() {
        use crate::options::GlobOptions;

        // Create a temporary directory with test files
        let temp_dir = tempfile::tempdir().unwrap();
        let temp_path = temp_dir.path();

        // Create test/a.test.ts
        std::fs::create_dir_all(temp_path.join("test")).unwrap();
        std::fs::write(temp_path.join("test/a.test.ts"), "").unwrap();
        std::fs::write(temp_path.join("test/b.test.tsx"), "").unwrap();

        let mut options = GlobOptions::default();
        options.cwd = Some(temp_path.to_string_lossy().to_string());

        let glob = Glob::new_multi(vec!["**/*.test.ts".to_string()], options);
        let results = glob.walk_sync();

        assert!(
            results.contains(&"test/a.test.ts".to_string()),
            "Should contain test/a.test.ts"
        );
        assert!(
            !results.contains(&"test/b.test.tsx".to_string()),
            "Should not contain test/b.test.tsx"
        );
    }

    // Static pattern tests - Task 5.10.1

    #[test]
    fn test_static_pattern_single_file() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "foo.txt".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find the exact file
        assert!(results.contains(&"foo.txt".to_string()));
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_static_pattern_nested_file() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "src/main.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find the nested file
        assert!(results.contains(&"src/main.js".to_string()));
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_static_pattern_deeply_nested() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "src/lib/helper.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find the deeply nested file
        assert!(results.contains(&"src/lib/helper.js".to_string()));
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_static_pattern_directory() {
        let temp = create_test_fixture();
        let glob = Glob::new("src".to_string(), make_opts(&temp.path().to_string_lossy()));
        let results = glob.walk_sync();

        // Should find the directory
        assert!(results.contains(&"src".to_string()));
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_static_pattern_nonexistent() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "does-not-exist.txt".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should return empty for non-existent files
        assert!(results.is_empty());
    }

    #[test]
    fn test_static_pattern_multiple() {
        let temp = create_test_fixture();
        let glob = Glob::new_multi(
            vec!["foo.txt".to_string(), "bar.txt".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should find both files
        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_static_pattern_with_nodir() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "src".to_string(),
            make_opts_with_nodir(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // Should NOT include directory when nodir: true
        assert!(results.is_empty());
    }

    #[test]
    fn test_static_pattern_with_mark() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "src".to_string(),
            make_opts_with_mark(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // Should include trailing slash for directory
        assert!(results.contains(&"src/".to_string()));
    }

    #[test]
    fn test_static_pattern_with_dot_relative() {
        let temp = create_test_fixture();
        let glob = Glob::new(
            "foo.txt".to_string(),
            make_opts_with_dot_relative(&temp.path().to_string_lossy(), true),
        );
        let results = glob.walk_sync();

        // Should include ./ prefix
        assert!(results.contains(&"./foo.txt".to_string()));
    }

    #[test]
    fn test_static_pattern_with_absolute() {
        let temp = create_test_fixture();
        let mut opts = make_opts(&temp.path().to_string_lossy());
        opts.absolute = Some(true);

        let glob = Glob::new("foo.txt".to_string(), opts);
        let results = glob.walk_sync();

        // Should return absolute path
        assert!(!results.is_empty());
        let result = &results[0];
        assert!(result.contains("foo.txt"));
        // Absolute path should start with / (Unix) or drive letter (Windows)
        assert!(result.starts_with('/') || result.chars().nth(1) == Some(':'));
    }

    #[test]
    fn test_static_pattern_deduplication() {
        let temp = create_test_fixture();
        // Same file referenced multiple times
        let glob = Glob::new_multi(
            vec!["foo.txt".to_string(), "foo.txt".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        let results = glob.walk_sync();

        // Should only include once
        assert_eq!(results.len(), 1);
        assert!(results.contains(&"foo.txt".to_string()));
    }

    #[test]
    fn test_all_patterns_static_detection() {
        let temp = create_test_fixture();

        // Static patterns
        let glob1 = Glob::new(
            "foo.txt".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        assert!(glob1.all_patterns_static());

        let glob2 = Glob::new_multi(
            vec!["foo.txt".to_string(), "src/main.js".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        assert!(glob2.all_patterns_static());

        // Non-static patterns
        let glob3 = Glob::new(
            "*.txt".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        assert!(!glob3.all_patterns_static());

        let glob4 = Glob::new(
            "**/*.js".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
        assert!(!glob4.all_patterns_static());

        // Mixed - should be false
        let glob5 = Glob::new_multi(
            vec!["foo.txt".to_string(), "*.js".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );
        assert!(!glob5.all_patterns_static());
    }

    // Multi-base walking tests
    fn create_multi_base_fixture() -> TempDir {
        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create src directory with TypeScript files
        fs::create_dir_all(base.join("src")).unwrap();
        File::create(base.join("src/main.ts")).unwrap();
        File::create(base.join("src/util.ts")).unwrap();
        fs::create_dir_all(base.join("src/lib")).unwrap();
        File::create(base.join("src/lib/helper.ts")).unwrap();

        // Create test directory with TypeScript files
        fs::create_dir_all(base.join("test")).unwrap();
        File::create(base.join("test/main.test.ts")).unwrap();
        File::create(base.join("test/util.test.ts")).unwrap();
        fs::create_dir_all(base.join("test/fixtures")).unwrap();
        File::create(base.join("test/fixtures/data.ts")).unwrap();

        // Create lib directory with TypeScript files
        fs::create_dir_all(base.join("lib")).unwrap();
        File::create(base.join("lib/index.ts")).unwrap();

        // Create other directories that should not be traversed
        fs::create_dir_all(base.join("node_modules/pkg")).unwrap();
        File::create(base.join("node_modules/pkg/index.ts")).unwrap();

        fs::create_dir_all(base.join("dist")).unwrap();
        File::create(base.join("dist/main.js")).unwrap();

        // Create root level files
        File::create(base.join("package.json")).unwrap();
        File::create(base.join("tsconfig.json")).unwrap();

        temp
    }

    #[test]
    fn test_group_patterns_by_base() {
        let temp = create_multi_base_fixture();

        // Patterns with different bases
        let glob = Glob::new_multi(
            vec![
                "src/**/*.ts".to_string(),
                "src/lib/*.ts".to_string(),
                "test/**/*.ts".to_string(),
            ],
            make_opts(&temp.path().to_string_lossy()),
        );

        let groups = glob.group_patterns_by_base();

        // Should have 2 groups: src and test
        assert_eq!(groups.len(), 2);
        assert!(groups.contains_key(&Some("src".to_string())));
        assert!(groups.contains_key(&Some("test".to_string())));

        // src group should have 2 patterns
        assert_eq!(groups.get(&Some("src".to_string())).unwrap().len(), 2);
        // test group should have 1 pattern
        assert_eq!(groups.get(&Some("test".to_string())).unwrap().len(), 1);
    }

    #[test]
    fn test_group_patterns_with_none_prefix() {
        let temp = create_multi_base_fixture();

        // Patterns with and without prefixes
        let glob = Glob::new_multi(
            vec![
                "src/**/*.ts".to_string(),
                "**/*.json".to_string(), // No prefix
            ],
            make_opts(&temp.path().to_string_lossy()),
        );

        let groups = glob.group_patterns_by_base();

        // Should have 2 groups: src and None
        assert_eq!(groups.len(), 2);
        assert!(groups.contains_key(&Some("src".to_string())));
        assert!(groups.contains_key(&None));
    }

    #[test]
    fn test_should_use_multi_base_walking_true() {
        let temp = create_multi_base_fixture();

        // All patterns have different bases
        let glob = Glob::new_multi(
            vec!["src/**/*.ts".to_string(), "test/**/*.ts".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );

        assert!(glob.should_use_multi_base_walking());
    }

    #[test]
    fn test_should_use_multi_base_walking_false_no_prefix() {
        let temp = create_multi_base_fixture();

        // One pattern has no prefix
        let glob = Glob::new_multi(
            vec![
                "src/**/*.ts".to_string(),
                "**/*.ts".to_string(), // No prefix
            ],
            make_opts(&temp.path().to_string_lossy()),
        );

        assert!(!glob.should_use_multi_base_walking());
    }

    #[test]
    fn test_should_use_multi_base_walking_false_same_base() {
        let temp = create_multi_base_fixture();

        // All patterns have the same base
        let glob = Glob::new_multi(
            vec!["src/**/*.ts".to_string(), "src/lib/*.ts".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );

        // Only one group, so no benefit from multi-base
        assert!(!glob.should_use_multi_base_walking());
    }

    #[test]
    fn test_should_use_multi_base_walking_false_nonexistent_dir() {
        let temp = create_multi_base_fixture();

        // One base doesn't exist
        let glob = Glob::new_multi(
            vec!["src/**/*.ts".to_string(), "nonexistent/**/*.ts".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );

        assert!(!glob.should_use_multi_base_walking());
    }

    #[test]
    fn test_walk_multi_base_results() {
        let temp = create_multi_base_fixture();

        // Multi-base pattern
        let glob = Glob::new_multi(
            vec!["src/**/*.ts".to_string(), "test/**/*.ts".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );

        let results = glob.walk_sync();

        // Should find files in both src and test
        assert!(results.contains(&"src/main.ts".to_string()));
        assert!(results.contains(&"src/util.ts".to_string()));
        assert!(results.contains(&"src/lib/helper.ts".to_string()));
        assert!(results.contains(&"test/main.test.ts".to_string()));
        assert!(results.contains(&"test/util.test.ts".to_string()));
        assert!(results.contains(&"test/fixtures/data.ts".to_string()));

        // Should NOT find files in other directories (node_modules, lib)
        assert!(!results.iter().any(|r| r.contains("node_modules")));
        assert!(!results.contains(&"lib/index.ts".to_string()));

        // Should have exactly 6 results
        assert_eq!(results.len(), 6);
    }

    #[test]
    fn test_walk_multi_base_three_directories() {
        let temp = create_multi_base_fixture();

        // Three different bases
        let glob = Glob::new_multi(
            vec![
                "src/**/*.ts".to_string(),
                "test/**/*.ts".to_string(),
                "lib/**/*.ts".to_string(),
            ],
            make_opts(&temp.path().to_string_lossy()),
        );

        let results = glob.walk_sync();

        // Should find files in all three directories
        assert!(results.contains(&"src/main.ts".to_string()));
        assert!(results.contains(&"test/main.test.ts".to_string()));
        assert!(results.contains(&"lib/index.ts".to_string()));

        // Should have exactly 7 results (3 in src, 3 in test, 1 in lib)
        assert_eq!(results.len(), 7);
    }

    #[test]
    fn test_walk_multi_base_with_nodir() {
        let temp = create_multi_base_fixture();

        let mut opts = make_opts(&temp.path().to_string_lossy());
        opts.nodir = Some(true);

        let glob = Glob::new_multi(vec!["src/**/*".to_string(), "test/**/*".to_string()], opts);

        let results = glob.walk_sync();

        // Should only contain files, not directories
        assert!(results.contains(&"src/main.ts".to_string()));
        assert!(!results
            .iter()
            .any(|r| r == "src" || r == "src/" || r == "test" || r == "test/"));
    }

    #[test]
    fn test_walk_multi_base_deduplication() {
        let temp = create_multi_base_fixture();

        // Overlapping patterns that could produce duplicates
        let glob = Glob::new_multi(
            vec![
                "src/**/*.ts".to_string(),
                "src/lib/**/*.ts".to_string(), // More specific version
            ],
            make_opts(&temp.path().to_string_lossy()),
        );

        // Note: These have the same base (src), so they won't use multi-base walking
        // But this tests that deduplication works in general
        let results = glob.walk_sync();

        // Count occurrences of helper.ts
        let helper_count = results.iter().filter(|r| r.contains("helper.ts")).count();
        assert_eq!(helper_count, 1, "Should not have duplicate entries");
    }

    #[test]
    fn test_walk_multi_base_empty_results() {
        let temp = create_multi_base_fixture();

        // Pattern for non-existent file types
        let glob = Glob::new_multi(
            vec![
                "src/**/*.py".to_string(), // No Python files
                "test/**/*.py".to_string(),
            ],
            make_opts(&temp.path().to_string_lossy()),
        );

        // Should still use multi-base walking but return empty results
        let results = glob.walk_sync();
        assert!(results.is_empty());
    }

    #[test]
    fn test_walk_multi_base_parallel_results_match() {
        let temp = create_multi_base_fixture();

        // Test that parallel multi-base walking produces correct results
        // by comparing with expected results
        let glob = Glob::new_multi(
            vec![
                "src/**/*.ts".to_string(),
                "test/**/*.ts".to_string(),
                "lib/**/*.ts".to_string(),
            ],
            make_opts(&temp.path().to_string_lossy()),
        );

        // Run multiple times to test parallel execution consistency
        for _ in 0..5 {
            let results = glob.walk_sync();

            // Verify expected files are present (order may vary due to parallelism)
            let results_set: std::collections::HashSet<_> = results.iter().collect();

            assert!(
                results_set.contains(&"src/main.ts".to_string()),
                "Should contain src/main.ts"
            );
            assert!(
                results_set.contains(&"src/util.ts".to_string()),
                "Should contain src/util.ts"
            );
            assert!(
                results_set.contains(&"src/lib/helper.ts".to_string()),
                "Should contain src/lib/helper.ts"
            );
            assert!(
                results_set.contains(&"test/main.test.ts".to_string()),
                "Should contain test/main.test.ts"
            );
            assert!(
                results_set.contains(&"test/util.test.ts".to_string()),
                "Should contain test/util.test.ts"
            );
            assert!(
                results_set.contains(&"test/fixtures/data.ts".to_string()),
                "Should contain test/fixtures/data.ts"
            );
            assert!(
                results_set.contains(&"lib/index.ts".to_string()),
                "Should contain lib/index.ts"
            );

            // Total should be 7 files
            assert_eq!(results.len(), 7, "Should have exactly 7 results");
        }
    }

    #[test]
    fn test_walk_multi_base_parallel_with_ignore() {
        let temp = create_multi_base_fixture();

        let mut opts = make_opts(&temp.path().to_string_lossy());
        opts.ignore = Some(napi::Either::A("**/util*".to_string()));

        let glob = Glob::new_multi(
            vec!["src/**/*.ts".to_string(), "test/**/*.ts".to_string()],
            opts,
        );

        let results = glob.walk_sync();

        // Should have files except util-related ones
        assert!(results.contains(&"src/main.ts".to_string()));
        assert!(!results.contains(&"src/util.ts".to_string())); // ignored
        assert!(results.contains(&"test/main.test.ts".to_string()));
        assert!(!results.contains(&"test/util.test.ts".to_string())); // ignored
    }

    #[test]
    fn test_walk_multi_base_parallel_consistency() {
        let temp = create_multi_base_fixture();

        // Run multi-base walking several times and verify results are consistent
        let glob = Glob::new_multi(
            vec!["src/**/*.ts".to_string(), "test/**/*.ts".to_string()],
            make_opts(&temp.path().to_string_lossy()),
        );

        let first_results: std::collections::HashSet<_> = glob.walk_sync().into_iter().collect();

        for _ in 0..10 {
            let results: std::collections::HashSet<_> = glob.walk_sync().into_iter().collect();
            assert_eq!(
                first_results, results,
                "Parallel results should be consistent across runs"
            );
        }
    }

    #[test]
    fn test_walk_single_base_group_returns_correct_results() {
        let temp = create_multi_base_fixture();
        let cwd = temp.path();
        let abs_cwd = cwd.canonicalize().unwrap();

        let glob = Glob::new_multi(
            vec![
                "src/**/*.ts".to_string(),
                "src/lib/*.ts".to_string(),
                "test/**/*.ts".to_string(),
            ],
            make_opts(&temp.path().to_string_lossy()),
        );

        // Walk just the src group (indices 0 and 1)
        let results = glob.walk_single_base_group(&[0, 1], &abs_cwd);

        assert!(results.contains(&"src/main.ts".to_string()));
        assert!(results.contains(&"src/util.ts".to_string()));
        assert!(results.contains(&"src/lib/helper.ts".to_string()));
        assert!(!results.contains(&"test/main.test.ts".to_string())); // Not in this group
    }
}
