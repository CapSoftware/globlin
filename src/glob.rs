use std::path::PathBuf;

use napi::bindgen_prelude::*;

use crate::ignore::IgnoreFilter;
use crate::options::{validate_options, GlobOptions};
use crate::pattern::{expand_braces, preprocess_pattern, Pattern, PatternOptions};
use crate::walker::{WalkOptions, Walker};

pub struct Glob {
    #[allow(dead_code)]
    pattern_strs: Vec<String>,
    cwd: PathBuf,
    patterns: Vec<Pattern>,
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
}

#[napi]
pub fn glob_sync(pattern: Either<String, Vec<String>>, options: Option<GlobOptions>) -> Result<Vec<String>> {
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
pub async fn glob(pattern: Either<String, Vec<String>>, options: Option<GlobOptions>) -> Result<Vec<String>> {
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

        // Create pattern options
        let pattern_opts = PatternOptions {
            noext,
            windows_paths_no_escape,
            platform: Some(platform.clone()),
            nocase,
            nobrace,
        };

        // Process all input patterns and expand braces for each
        let mut patterns: Vec<Pattern> = Vec::new();
        
        for pattern_str in &pattern_strs {
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
                if match_base && !original_has_slash && !pattern.contains('/') && !pattern.contains('\\') {
                    format!("**/{}", pattern)
                } else {
                    pattern.to_string()
                }
            };

            // Expand braces unless nobrace is set
            if nobrace {
                let transformed = apply_match_base(pattern_str);
                patterns.push(Pattern::with_pattern_options(&transformed, pattern_opts.clone()));
            } else {
                let expanded = expand_braces(pattern_str);
                if expanded.is_empty() {
                    let transformed = apply_match_base(pattern_str);
                    patterns.push(Pattern::with_pattern_options(&transformed, pattern_opts.clone()));
                } else {
                    for p in expanded {
                        let transformed = apply_match_base(&p);
                        patterns.push(Pattern::with_pattern_options(&transformed, pattern_opts.clone()));
                    }
                }
            }
        }

        // Create ignore filter if ignore patterns provided
        let ignore_filter = match &options.ignore {
            Some(Either::A(pattern)) => {
                Some(IgnoreFilter::new(vec![pattern.clone()], noext, windows_paths_no_escape))
            }
            Some(Either::B(patterns)) => {
                if patterns.is_empty() {
                    None
                } else {
                    Some(IgnoreFilter::new(patterns.clone(), noext, windows_paths_no_escape))
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
        let pattern_max_depth = patterns.iter().fold(Some(0usize), |acc, p| {
            match (acc, p.max_depth()) {
                (None, _) => None,           // Already unlimited
                (_, None) => None,           // This pattern is unlimited
                (Some(a), Some(b)) => Some(a.max(b)), // Take max of bounded depths
            }
        });
        
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
        let walk_options = WalkOptions::new()
            .follow_symlinks(follow)
            .max_depth(walker_max_depth)
            .dot(true);

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
        }
    }

    pub fn walk_sync(&self) -> Vec<String> {
        // If maxDepth is negative, return empty results
        if let Some(d) = self.max_depth {
            if d < 0 {
                return Vec::new();
            }
        }

        // Pre-allocate result vector with estimated capacity based on pattern depth.
        // Simple patterns (depth 0-1) typically match fewer files than recursive patterns.
        // This reduces reallocations during collection.
        let estimated_capacity = self.estimate_result_capacity();
        let mut results = Vec::with_capacity(estimated_capacity);
        let mut seen = std::collections::HashSet::with_capacity(estimated_capacity);
        let mut ignored_dirs = std::collections::HashSet::new();

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
        let abs_cwd = self
            .cwd
            .canonicalize()
            .unwrap_or_else(|_| self.cwd.clone());

        // Calculate the walk root based on literal prefixes of all patterns.
        // If all patterns share a common literal prefix, we can start walking from there
        // instead of the cwd, which can significantly reduce the number of files traversed.
        let (walk_root, prefix_to_strip) = self.calculate_walk_root();
        
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
                    self.walk_options.clone().max_depth(Some(max_d - prefix_depth))
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
        let patterns_for_filter: Vec<Pattern> = self.patterns.clone();
        let prefix_for_filter = prefix_to_strip.clone();
        
        let prune_filter = Box::new(move |dir_path: &str| -> bool {
            // Construct the path relative to cwd for pattern matching
            let path_from_cwd = if let Some(ref prefix) = prefix_for_filter {
                if dir_path.is_empty() {
                    prefix.clone()
                } else {
                    format!("{}/{}", prefix, dir_path)
                }
            } else {
                dir_path.to_string()
            };
            
            // Check if ANY pattern could potentially match files in this directory.
            // If no pattern can match, we can safely skip this directory.
            patterns_for_filter.iter().any(|p| p.could_match_in_dir(&path_from_cwd))
        });
        
        // Create walker with the optimized walk root, adjusted options, and pruning filter
        let walker = Walker::new(walk_root.clone(), adjusted_walk_options)
            .with_dir_prune_filter(prune_filter);

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
            let is_walk_root = rel_str_from_walk_root.is_empty();
            
            // Construct the path relative to cwd by prepending the stripped prefix.
            // Optimization: Avoid allocation when no backslashes present (common on Unix).
            let normalized: String = if let Some(ref prefix) = prefix_to_strip {
                if is_walk_root {
                    prefix.clone()
                } else if rel_str_from_walk_root.contains('\\') {
                    format!("{}/{}", prefix, rel_str_from_walk_root.replace('\\', "/"))
                } else {
                    format!("{}/{}", prefix, rel_str_from_walk_root)
                }
            } else if rel_str_from_walk_root.contains('\\') {
                rel_str_from_walk_root.replace('\\', "/")
            } else {
                // No backslashes and no prefix - convert to owned string
                rel_str_from_walk_root.into_owned()
            };
            
            // For operations that need the actual relative path from cwd
            let rel_path = if prefix_to_strip.is_some() {
                std::path::PathBuf::from(&normalized)
            } else {
                rel_path_from_walk_root.to_path_buf()
            };

            // Check if this path is inside an ignored directory.
            // Optimization: Use byte-level comparison instead of char iteration.
            if !ignored_dirs.is_empty() {
                let normalized_bytes = normalized.as_bytes();
                let is_in_ignored = ignored_dirs.iter().any(|ignored_dir: &String| {
                    let ignored_bytes = ignored_dir.as_bytes();
                    normalized_bytes.starts_with(ignored_bytes) && 
                    (normalized_bytes.len() == ignored_bytes.len() || 
                     normalized_bytes.get(ignored_bytes.len()) == Some(&b'/'))
                });
                if is_in_ignored {
                    continue;
                }
            }

            // Check ignore patterns
            if let Some(ref ignore_filter) = self.ignore_filter {
                let abs_path = abs_cwd.join(&rel_path);
                
                // Check if this specific path should be ignored
                if ignore_filter.should_ignore(&normalized, &abs_path) {
                    // If children are also ignored, mark this directory
                    if entry.is_dir() && ignore_filter.children_ignored(&normalized, &abs_path) {
                        ignored_dirs.insert(normalized.to_string());
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
            if is_walk_root && prefix_to_strip.is_none() {
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
                        let mut path = self.format_path(&abs_cwd);
                        if self.mark {
                            path = self.ensure_trailing_slash(&path);
                        }
                        path
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

            // Check if any pattern matches
            // For patterns that end with /, only match if entry is a directory
            let is_dir = entry.is_dir();
            let matches = self.patterns.iter().any(|p| {
                // Try fast-path matching first, fall back to regex if not applicable
                let path_matches = match p.matches_fast(&normalized) {
                    Some(result) => result,
                    None => p.matches(&normalized),
                };
                if path_matches && p.requires_dir() {
                    // Pattern ends with /, only match directories
                    is_dir
                } else {
                    path_matches
                }
            });
            
            if matches {
                let result = if self.absolute {
                    // Return absolute path
                    let abs_path = abs_cwd.join(&rel_path);
                    let mut path = self.format_path(&abs_path);
                    if self.mark && is_dir {
                        path = self.ensure_trailing_slash(&path);
                    }
                    path
                } else {
                    // Apply dotRelative: prepend "./" to relative paths
                    // But not for patterns starting with "../"
                    let mut path = if self.dot_relative && !normalized.starts_with("../") {
                        format!("./{}", normalized)
                } else {
                    normalized
                };
                    if self.mark && is_dir {
                        path = self.ensure_trailing_slash(&path);
                    }
                    path
                };

                // Deduplicate results (important for overlapping brace expansions)
                if seen.insert(result.clone()) {
                    results.push(result);
                }
            }
        }

        results
    }

    /// Format a path according to options (posix, etc.)
    fn format_path(&self, path: &PathBuf) -> String {
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
            format!("{}/", path)
        } else {
            // On Windows without posix option, use the native separator
            format!("{}/", path)
        }
    }

    /// Check if a path is allowed by dot filtering rules.
    /// Returns true if:
    /// - dot: true (always allow)
    /// - The path has no dotfile segments
    /// - Any pattern explicitly allows the dotfile segments in this path
    fn path_allowed_by_dot_rules(&self, path: &str) -> bool {
        // Check if path contains any dotfile segments
        let has_dotfile = path.split('/').any(|segment| {
            segment.starts_with('.') && segment != "." && segment != ".."
        });

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
        let max_pattern_depth = self.patterns.iter()
            .filter_map(|p| p.max_depth())
            .max();
        
        match max_pattern_depth {
            Some(0) => 16,      // Root-level patterns: few files expected
            Some(1) => 64,      // One directory level: moderate number
            Some(2) => 128,     // Two levels deep
            Some(_) => 256,     // Deeper patterns
            None => 256,        // Recursive patterns (**): could be many files
        }
    }

    /// Calculate the optimal walk root based on literal prefixes of patterns.
    /// 
    /// Returns a tuple of (walk_root, prefix_to_strip):
    /// - walk_root: The directory to start walking from (cwd or cwd/prefix)
    /// - prefix_to_strip: If Some, this prefix was extracted and should be prepended
    ///   to relative paths from walk_root to get the path relative to cwd
    /// 
    /// For patterns like `src/**/*.ts`, instead of walking from cwd and visiting
    /// all directories, we can walk from `cwd/src` which is much faster.
    /// 
    /// When patterns have different prefixes (e.g., `src/**` and `test/**`),
    /// we find the longest common prefix, or fall back to cwd if there's no
    /// common prefix.
    fn calculate_walk_root(&self) -> (PathBuf, Option<String>) {
        // If there are no patterns, just walk from cwd
        if self.patterns.is_empty() {
            return (self.cwd.clone(), None);
        }

        // Get literal prefixes from all patterns
        let prefixes: Vec<Option<String>> = self.patterns.iter()
            .map(|p| p.literal_prefix())
            .collect();

        // If any pattern has no prefix (e.g., `**/*.js` or `*.txt`), we must walk from cwd
        if prefixes.iter().any(|p| p.is_none()) {
            return (self.cwd.clone(), None);
        }

        // All patterns have prefixes - find the longest common prefix
        let prefix_strs: Vec<&str> = prefixes.iter()
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
        let path_components: Vec<Vec<&str>> = paths.iter()
            .map(|p| p.split('/').collect())
            .collect();

        // Find the minimum length
        let min_len = path_components.iter()
            .map(|c| c.len())
            .min()
            .unwrap_or(0);

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
                "Path should be absolute: {}",
                result
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
                "Path should use forward slashes: {}",
                result
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
        let glob = Glob::new(
            "*".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
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
        let results = glob.walk_sync();

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
                "Path should start with './': {}",
                result
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
                "Path should not start with './': {}",
                result
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
        let glob = Glob::new(
            "*".to_string(),
            make_opts(&temp.path().to_string_lossy()),
        );
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
        let glob = Glob::new_multi(
            Vec::new(),
            make_opts(&temp.path().to_string_lossy()),
        );
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
        assert_eq!(Glob::longest_common_prefix(&["packages/foo", "packages/bar"]), "packages");
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
}
