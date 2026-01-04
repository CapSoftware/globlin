// Result processing and match walking

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::pattern::{preprocess_pattern, Pattern};
use crate::walker::{WalkEntry, WalkOptions, Walker};

/// Options for the GlobWalker
#[derive(Debug, Clone, Default)]
pub struct GlobWalkerOptions {
    /// Return absolute paths instead of relative paths
    pub absolute: bool,
    /// Use POSIX path separators (forward slashes) on all platforms
    pub posix: bool,
    /// Include `.dot` files in matches
    pub dot: bool,
    /// Follow symbolic links
    pub follow: bool,
    /// Maximum directory depth to traverse
    pub max_depth: Option<i32>,
    /// Only return files, not directories
    pub nodir: bool,
}

impl GlobWalkerOptions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn absolute(mut self, value: bool) -> Self {
        self.absolute = value;
        self
    }

    pub fn posix(mut self, value: bool) -> Self {
        self.posix = value;
        self
    }

    pub fn dot(mut self, value: bool) -> Self {
        self.dot = value;
        self
    }

    pub fn follow(mut self, value: bool) -> Self {
        self.follow = value;
        self
    }

    pub fn max_depth(mut self, value: Option<i32>) -> Self {
        self.max_depth = value;
        self
    }

    pub fn nodir(mut self, value: bool) -> Self {
        self.nodir = value;
        self
    }
}

/// A walker that combines filesystem traversal with pattern matching.
///
/// GlobWalker is responsible for:
/// 1. Walking the directory tree
/// 2. Testing each entry against all patterns
/// 3. Applying filters (nodir, dot, etc.)
/// 4. Formatting result paths
/// 5. Deduplicating results
pub struct GlobWalker {
    patterns: Vec<Pattern>,
    cwd: PathBuf,
    options: GlobWalkerOptions,
    walk_options: WalkOptions,
}

impl GlobWalker {
    /// Create a new GlobWalker with the given patterns and options.
    pub fn new(patterns: Vec<Pattern>, cwd: PathBuf, options: GlobWalkerOptions) -> Self {
        // Convert max_depth for walker
        let walker_max_depth = match options.max_depth {
            Some(d) if d >= 0 => Some(d as usize),
            Some(_) => Some(0), // Negative values: will return empty in walk_sync
            None => None,       // Unlimited
        };

        // Create walk options
        // Always walk with dot=true in the walker, handle dot filtering at pattern level
        // This allows explicit dot patterns (like ".hidden") to match even when dot:false
        let walk_options = WalkOptions::new()
            .follow_symlinks(options.follow)
            .max_depth(walker_max_depth)
            .dot(true);

        Self {
            patterns,
            cwd,
            options,
            walk_options,
        }
    }

    /// Create a GlobWalker from a single pattern string.
    pub fn from_pattern(pattern: &str, cwd: PathBuf, options: GlobWalkerOptions) -> Self {
        let patterns = vec![Pattern::new(pattern)];
        Self::new(patterns, cwd, options)
    }

    /// Get the current working directory.
    pub fn cwd(&self) -> &Path {
        &self.cwd
    }

    /// Get the patterns being matched.
    pub fn patterns(&self) -> &[Pattern] {
        &self.patterns
    }

    /// Walk the directory tree synchronously and collect all matching paths.
    pub fn walk_sync(&self) -> Vec<String> {
        // If maxDepth is negative, return empty results
        if let Some(d) = self.options.max_depth {
            if d < 0 {
                return Vec::new();
            }
        }

        let mut results = Vec::new();
        let mut seen = HashSet::new();

        // Check if any pattern is just "**" - should include "." (cwd itself)
        let include_cwd = self
            .patterns
            .iter()
            .any(|p| preprocess_pattern(p.raw()) == "**");

        // Get the absolute cwd path, canonicalized
        let abs_cwd = self.cwd.canonicalize().unwrap_or_else(|_| self.cwd.clone());

        // Create walker
        let walker = Walker::new(self.cwd.clone(), self.walk_options.clone());

        for entry in walker.walk() {
            if let Some(result) = self.process_entry(&entry, &abs_cwd, include_cwd) {
                if seen.insert(result.clone()) {
                    results.push(result);
                }
            }
        }

        results
    }

    /// Walk the directory tree and return an iterator over matching paths.
    ///
    /// Note: This returns a boxed iterator to handle the lifetime constraints
    /// of the internal walker. For simple use cases, prefer `walk_sync()`.
    pub fn walk_iter(&self) -> Box<dyn Iterator<Item = String> + '_> {
        // If maxDepth is negative, return empty iterator
        if let Some(d) = self.options.max_depth {
            if d < 0 {
                return Box::new(std::iter::empty());
            }
        }

        // Get the absolute cwd path, canonicalized
        let abs_cwd = self.cwd.canonicalize().unwrap_or_else(|_| self.cwd.clone());

        // Check if any pattern is just "**"
        let include_cwd = self
            .patterns
            .iter()
            .any(|p| preprocess_pattern(p.raw()) == "**");

        // Collect walker entries first to avoid lifetime issues
        let walker = Walker::new(self.cwd.clone(), self.walk_options.clone());
        let entries: Vec<WalkEntry> = walker.walk().collect();

        let mut seen = HashSet::new();
        let results: Vec<String> = entries
            .into_iter()
            .filter_map(|entry| self.process_entry(&entry, &abs_cwd, include_cwd))
            .filter(move |result| seen.insert(result.clone()))
            .collect();

        Box::new(results.into_iter())
    }

    /// Process a single entry and return the result path if it matches.
    fn process_entry(
        &self,
        entry: &WalkEntry,
        abs_cwd: &Path,
        include_cwd: bool,
    ) -> Option<String> {
        let path = entry.path();

        let rel_path = match path.strip_prefix(&self.cwd) {
            Ok(p) => p,
            Err(_) => return None,
        };

        let rel_str = rel_path.to_string_lossy();

        if rel_str.is_empty() {
            // Root directory - only include if pattern matches it
            // With nodir: true, skip even the root directory
            if include_cwd && !self.options.nodir {
                let result = if self.options.absolute {
                    self.format_path(abs_cwd)
                } else {
                    ".".to_string()
                };
                return Some(result);
            }
            return None;
        }

        // If nodir is true, skip directories
        if self.options.nodir && entry.is_dir() {
            return None;
        }

        let normalized = rel_str.replace('\\', "/");

        // If dot:false, check if this path contains dotfile segments
        // that aren't explicitly allowed by any pattern
        if !self.options.dot && !self.path_allowed_by_dot_rules(&normalized) {
            return None;
        }

        // Check if any pattern matches
        if !self.patterns.iter().any(|p| p.matches(&normalized)) {
            return None;
        }

        let result = if self.options.absolute {
            let abs_path = abs_cwd.join(rel_path);
            self.format_path(&abs_path)
        } else {
            normalized
        };

        Some(result)
    }

    /// Format a path according to options (posix, etc.)
    fn format_path(&self, path: &Path) -> String {
        let path_str = path.to_string_lossy().to_string();
        if self.options.posix {
            path_str.replace('\\', "/")
        } else {
            path_str
        }
    }

    /// Check if a path is allowed by dot filtering rules.
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
}

/// Match result containing path and optional metadata.
#[derive(Debug, Clone)]
pub struct MatchResult {
    /// The matched path (relative or absolute depending on options)
    pub path: String,
    /// Whether this is a directory
    pub is_dir: bool,
    /// Whether this is a file
    pub is_file: bool,
    /// Whether this is a symlink
    pub is_symlink: bool,
    /// Depth from the root
    pub depth: usize,
}

impl MatchResult {
    pub fn from_entry(entry: &WalkEntry, formatted_path: String) -> Self {
        Self {
            path: formatted_path,
            is_dir: entry.is_dir(),
            is_file: entry.is_file(),
            is_symlink: entry.is_symlink(),
            depth: entry.depth(),
        }
    }
}

/// Extended walker that returns full match results with metadata.
pub struct GlobWalkerWithMeta {
    inner: GlobWalker,
}

impl GlobWalkerWithMeta {
    pub fn new(patterns: Vec<Pattern>, cwd: PathBuf, options: GlobWalkerOptions) -> Self {
        Self {
            inner: GlobWalker::new(patterns, cwd, options),
        }
    }

    /// Walk and return results with metadata.
    pub fn walk_sync(&self) -> Vec<MatchResult> {
        // If maxDepth is negative, return empty results
        if let Some(d) = self.inner.options.max_depth {
            if d < 0 {
                return Vec::new();
            }
        }

        let mut results = Vec::new();
        let mut seen = HashSet::new();

        let include_cwd = self
            .inner
            .patterns
            .iter()
            .any(|p| preprocess_pattern(p.raw()) == "**");

        let abs_cwd = self
            .inner
            .cwd
            .canonicalize()
            .unwrap_or_else(|_| self.inner.cwd.clone());

        let walker = Walker::new(self.inner.cwd.clone(), self.inner.walk_options.clone());

        for entry in walker.walk() {
            if let Some(result) = self.process_entry_with_meta(&entry, &abs_cwd, include_cwd) {
                if seen.insert(result.path.clone()) {
                    results.push(result);
                }
            }
        }

        results
    }

    fn process_entry_with_meta(
        &self,
        entry: &WalkEntry,
        abs_cwd: &Path,
        include_cwd: bool,
    ) -> Option<MatchResult> {
        let path = entry.path();

        let rel_path = match path.strip_prefix(&self.inner.cwd) {
            Ok(p) => p,
            Err(_) => return None,
        };

        let rel_str = rel_path.to_string_lossy();

        if rel_str.is_empty() {
            if include_cwd && !self.inner.options.nodir {
                let formatted = if self.inner.options.absolute {
                    self.inner.format_path(abs_cwd)
                } else {
                    ".".to_string()
                };
                return Some(MatchResult {
                    path: formatted,
                    is_dir: true,
                    is_file: false,
                    is_symlink: entry.is_symlink(),
                    depth: 0,
                });
            }
            return None;
        }

        if self.inner.options.nodir && entry.is_dir() {
            return None;
        }

        let normalized = rel_str.replace('\\', "/");

        if !self.inner.options.dot && !self.inner.path_allowed_by_dot_rules(&normalized) {
            return None;
        }

        if !self.inner.patterns.iter().any(|p| p.matches(&normalized)) {
            return None;
        }

        let formatted = if self.inner.options.absolute {
            let abs_path = abs_cwd.join(rel_path);
            self.inner.format_path(&abs_path)
        } else {
            normalized
        };

        Some(MatchResult::from_entry(entry, formatted))
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
        File::create(base.join(".hidden")).unwrap();

        fs::create_dir_all(base.join("src")).unwrap();
        File::create(base.join("src/main.js")).unwrap();
        File::create(base.join("src/util.js")).unwrap();

        fs::create_dir_all(base.join("src/lib")).unwrap();
        File::create(base.join("src/lib/helper.js")).unwrap();

        fs::create_dir_all(base.join(".git")).unwrap();
        File::create(base.join(".git/config")).unwrap();

        temp
    }

    #[test]
    fn test_glob_walker_basic() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("*.txt")];
        let options = GlobWalkerOptions::new();
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);

        let results = walker.walk_sync();

        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        assert!(!results.contains(&"baz.js".to_string()));
    }

    #[test]
    fn test_glob_walker_recursive() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("**/*.js")];
        let options = GlobWalkerOptions::new();
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);

        let results = walker.walk_sync();

        assert!(results.contains(&"baz.js".to_string()));
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(results.contains(&"src/util.js".to_string()));
        assert!(results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_glob_walker_dot_option_false() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("*")];

        // Without dot option
        let options = GlobWalkerOptions::new().dot(false);
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);
        let results = walker.walk_sync();
        assert!(!results.contains(&".hidden".to_string()));
    }

    #[test]
    fn test_glob_walker_dot_option_true() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("*")];

        // With dot option
        let options = GlobWalkerOptions::new().dot(true);
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);
        let results = walker.walk_sync();
        assert!(results.contains(&".hidden".to_string()));
    }

    #[test]
    fn test_glob_walker_nodir_option_true() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("**/*")];

        // With nodir
        let options = GlobWalkerOptions::new().nodir(true);
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);
        let results = walker.walk_sync();
        assert!(!results.contains(&"src".to_string()));
        assert!(!results.contains(&"src/lib".to_string()));
        assert!(results.contains(&"src/main.js".to_string()));
    }

    #[test]
    fn test_glob_walker_nodir_option_false() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("**/*")];

        // Without nodir
        let options = GlobWalkerOptions::new().nodir(false);
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);
        let results = walker.walk_sync();
        assert!(results.contains(&"src".to_string()));
    }

    #[test]
    fn test_glob_walker_absolute_option() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("*.txt")];
        let options = GlobWalkerOptions::new().absolute(true);
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);

        let results = walker.walk_sync();

        for result in &results {
            assert!(
                std::path::Path::new(result).is_absolute(),
                "Path should be absolute: {}",
                result
            );
        }
    }

    #[test]
    fn test_glob_walker_max_depth_1() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("**/*.js")];

        // Depth 1 - only root level
        let options = GlobWalkerOptions::new().max_depth(Some(1));
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);
        let results = walker.walk_sync();
        assert!(results.contains(&"baz.js".to_string()));
        assert!(!results.contains(&"src/main.js".to_string()));
    }

    #[test]
    fn test_glob_walker_max_depth_2() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("**/*.js")];

        // Depth 2 - includes src/*
        let options = GlobWalkerOptions::new().max_depth(Some(2));
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);
        let results = walker.walk_sync();
        assert!(results.contains(&"src/main.js".to_string()));
        assert!(!results.contains(&"src/lib/helper.js".to_string()));
    }

    #[test]
    fn test_glob_walker_max_depth_negative() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("**/*.js")];

        // Negative depth - empty results
        let options = GlobWalkerOptions::new().max_depth(Some(-1));
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);
        let results = walker.walk_sync();
        assert!(results.is_empty());
    }

    #[test]
    fn test_glob_walker_multiple_patterns() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("*.txt"), Pattern::new("*.js")];
        let options = GlobWalkerOptions::new();
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);

        let results = walker.walk_sync();

        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        assert!(results.contains(&"baz.js".to_string()));
    }

    #[test]
    fn test_glob_walker_iterator() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("*.txt")];
        let options = GlobWalkerOptions::new();
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);

        let results: Vec<String> = walker.walk_iter().collect();

        assert!(results.contains(&"foo.txt".to_string()));
        assert!(results.contains(&"bar.txt".to_string()));
        assert!(!results.contains(&"baz.js".to_string()));
    }

    #[test]
    fn test_glob_walker_from_pattern() {
        let temp = create_test_fixture();
        let options = GlobWalkerOptions::new();
        let walker = GlobWalker::from_pattern("**/*.js", temp.path().to_path_buf(), options);

        let results = walker.walk_sync();

        assert!(results.contains(&"baz.js".to_string()));
        assert!(results.contains(&"src/main.js".to_string()));
    }

    #[test]
    fn test_glob_walker_with_meta() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("**/*")];
        let options = GlobWalkerOptions::new().nodir(false);
        let walker = GlobWalkerWithMeta::new(patterns, temp.path().to_path_buf(), options);

        let results = walker.walk_sync();

        // Find the src directory
        let src_result = results.iter().find(|r| r.path == "src").unwrap();
        assert!(src_result.is_dir);
        assert!(!src_result.is_file);

        // Find a file
        let file_result = results.iter().find(|r| r.path == "foo.txt").unwrap();
        assert!(!file_result.is_dir);
        assert!(file_result.is_file);
    }

    #[test]
    fn test_glob_walker_deduplication() {
        let temp = create_test_fixture();
        // Two patterns that could match the same file
        let patterns = vec![Pattern::new("*.txt"), Pattern::new("foo.*")];
        let options = GlobWalkerOptions::new();
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);

        let results = walker.walk_sync();

        // foo.txt should only appear once
        let foo_count = results.iter().filter(|r| *r == "foo.txt").count();
        assert_eq!(foo_count, 1);
    }

    #[test]
    fn test_glob_walker_globstar_includes_cwd() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("**")];
        let options = GlobWalkerOptions::new();
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);

        let results = walker.walk_sync();

        // ** should include "." (cwd)
        assert!(results.contains(&".".to_string()));
    }

    #[test]
    fn test_glob_walker_posix_option() {
        let temp = create_test_fixture();
        let patterns = vec![Pattern::new("*.txt")];
        let options = GlobWalkerOptions::new().absolute(true).posix(true);
        let walker = GlobWalker::new(patterns, temp.path().to_path_buf(), options);

        let results = walker.walk_sync();

        for result in &results {
            assert!(
                !result.contains('\\'),
                "Path should use forward slashes: {}",
                result
            );
        }
    }
}
