use std::borrow::Cow;
use std::path::Path;

use crate::pattern::{expand_braces, Pattern, PatternOptions};

/// Ignore filter for glob matching
///
/// Ignores paths matching the ignore patterns.
/// Ignore patterns are always parsed in dot:true mode.
/// Patterns ending in /** can skip entire directory trees.
pub struct IgnoreFilter {
    /// Patterns that match against relative paths
    relative: Vec<Pattern>,
    /// Patterns that indicate children should be ignored (ends with /**)
    relative_children: Vec<Pattern>,
    /// Patterns that match against absolute paths
    absolute: Vec<Pattern>,
    /// Absolute patterns that indicate children should be ignored
    absolute_children: Vec<Pattern>,
    /// Pattern options for creating patterns
    pattern_opts: PatternOptions,
}

/// Normalize path separators, avoiding allocation when no backslashes are present.
/// Returns Cow::Borrowed when the input already uses forward slashes only.
#[inline]
fn normalize_path_separators(path: &str) -> Cow<'_, str> {
    if path.contains('\\') {
        Cow::Owned(path.replace('\\', "/"))
    } else {
        Cow::Borrowed(path)
    }
}

/// Build path with trailing slash, avoiding allocation when already has slash.
#[inline]
fn with_trailing_slash<'a>(path: &'a str, buffer: &'a mut String) -> &'a str {
    if path == "." {
        "./"
    } else if path.ends_with('/') {
        path
    } else {
        buffer.clear();
        buffer.reserve(path.len() + 1);
        buffer.push_str(path);
        buffer.push('/');
        buffer.as_str()
    }
}

impl IgnoreFilter {
    /// Create a new IgnoreFilter from ignore patterns
    pub fn new(ignore_patterns: Vec<String>, noext: bool, windows_paths_no_escape: bool) -> Self {
        let pattern_opts = PatternOptions {
            noext,
            windows_paths_no_escape,
            nocase: false, // Ignore patterns are always case-sensitive per glob behavior
            ..Default::default()
        };

        let mut filter = Self {
            relative: Vec::new(),
            relative_children: Vec::new(),
            absolute: Vec::new(),
            absolute_children: Vec::new(),
            pattern_opts,
        };

        for pattern_str in ignore_patterns {
            filter.add(&pattern_str);
        }

        filter
    }

    /// Add an ignore pattern
    pub fn add(&mut self, pattern_str: &str) {
        // Expand braces first
        let expanded = expand_braces(pattern_str);
        let patterns_to_process = if expanded.is_empty() {
            vec![pattern_str.to_string()]
        } else {
            expanded
        };

        for pattern in patterns_to_process {
            // Strip leading ./ portions
            let stripped = pattern.trim_start_matches("./");

            // Check if this pattern ends with /** (children should be ignored)
            let is_children = stripped.ends_with("/**");

            // For children patterns, we need to match the parent directory
            // e.g., "node_modules/**" should match "node_modules" and its children
            let children_pattern = if is_children {
                // Create a pattern without the trailing /**
                let base = stripped.trim_end_matches("/**");
                if base.is_empty() {
                    None // "/**" alone doesn't make sense as a children pattern
                } else {
                    Some(base.to_string())
                }
            } else {
                None
            };

            // Check if pattern is absolute
            let is_absolute = stripped.starts_with('/')
                || (stripped.len() >= 2 && stripped.chars().nth(1) == Some(':'))
                || stripped.starts_with("//");

            // Create the pattern (ignore patterns always use dot:true mode internally)
            let pat = Pattern::with_pattern_options(stripped, self.pattern_opts.clone());

            if is_absolute {
                self.absolute.push(pat);
                if let Some(children_base) = children_pattern {
                    let children_pat =
                        Pattern::with_pattern_options(&children_base, self.pattern_opts.clone());
                    self.absolute_children.push(children_pat);
                }
            } else {
                self.relative.push(pat);
                if let Some(children_base) = children_pattern {
                    let children_pat =
                        Pattern::with_pattern_options(&children_base, self.pattern_opts.clone());
                    self.relative_children.push(children_pat);
                }
            }
        }
    }

    /// Check if a path should be ignored
    ///
    /// Both the path and path with trailing slash are checked.
    /// `rel_path` is the relative path from the glob's cwd.
    /// `abs_path` is the absolute path.
    pub fn should_ignore(&self, rel_path: &str, abs_path: &Path) -> bool {
        // Normalize the relative path (avoids allocation if no backslashes)
        let rel_normalized = normalize_path_separators(rel_path);

        // Build path with trailing slash using reusable buffer
        let mut slash_buffer = String::new();
        let rel_with_slash = with_trailing_slash(&rel_normalized, &mut slash_buffer);

        // Check relative patterns
        for pattern in &self.relative {
            // Use the pattern's match method which handles globstar correctly
            if pattern.matches(&rel_normalized) || pattern.matches(rel_with_slash) {
                return true;
            }
        }

        // Check absolute patterns
        let abs_lossy = abs_path.to_string_lossy();
        let abs_str = normalize_path_separators(&abs_lossy);

        // Reuse buffer for absolute path with slash
        slash_buffer.clear();
        let abs_with_slash = with_trailing_slash(&abs_str, &mut slash_buffer);

        for pattern in &self.absolute {
            if pattern.matches(&abs_str) || pattern.matches(abs_with_slash) {
                return true;
            }
        }

        false
    }

    /// Check if a directory's children should be ignored
    ///
    /// This is used to skip traversing into directories that match patterns like "node_modules/**".
    pub fn children_ignored(&self, rel_path: &str, abs_path: &Path) -> bool {
        // Normalize the relative path (avoids allocation if no backslashes)
        let rel_normalized = normalize_path_separators(rel_path);

        // Build path with trailing slash using reusable buffer
        let mut slash_buffer = String::new();
        let rel_with_slash = with_trailing_slash(&rel_normalized, &mut slash_buffer);

        // Check relative children patterns
        for pattern in &self.relative_children {
            if pattern.matches(&rel_normalized) || pattern.matches(rel_with_slash) {
                return true;
            }
        }

        // Check absolute children patterns
        let abs_lossy = abs_path.to_string_lossy();
        let abs_str = normalize_path_separators(&abs_lossy);

        // Reuse buffer for absolute path with slash
        slash_buffer.clear();
        let abs_with_slash = with_trailing_slash(&abs_str, &mut slash_buffer);

        for pattern in &self.absolute_children {
            if pattern.matches(&abs_str) || pattern.matches(abs_with_slash) {
                return true;
            }
        }

        false
    }

    /// Check if this filter has any patterns
    pub fn is_empty(&self) -> bool {
        self.relative.is_empty()
            && self.absolute.is_empty()
            && self.relative_children.is_empty()
            && self.absolute_children.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn make_filter(patterns: &[&str]) -> IgnoreFilter {
        IgnoreFilter::new(
            patterns.iter().map(|s| s.to_string()).collect(),
            false,
            false,
        )
    }

    #[test]
    fn test_simple_ignore() {
        let filter = make_filter(&["b"]);

        assert!(filter.should_ignore("b", &PathBuf::from("/test/b")));
        assert!(!filter.should_ignore("a", &PathBuf::from("/test/a")));
        assert!(!filter.should_ignore("bc", &PathBuf::from("/test/bc")));
    }

    #[test]
    fn test_wildcard_ignore() {
        let filter = make_filter(&["b*"]);

        assert!(filter.should_ignore("b", &PathBuf::from("/test/b")));
        assert!(filter.should_ignore("bc", &PathBuf::from("/test/bc")));
        assert!(!filter.should_ignore("a", &PathBuf::from("/test/a")));
        assert!(!filter.should_ignore("ab", &PathBuf::from("/test/ab")));
    }

    #[test]
    fn test_globstar_children() {
        let filter = make_filter(&["b/**"]);

        // The directory "b" itself should be ignored
        assert!(filter.should_ignore("b", &PathBuf::from("/test/b")));

        // Children of "b" should be ignored via childrenIgnored
        assert!(filter.children_ignored("b", &PathBuf::from("/test/b")));

        // But "bc" should not match
        assert!(!filter.should_ignore("bc", &PathBuf::from("/test/bc")));
        assert!(!filter.children_ignored("bc", &PathBuf::from("/test/bc")));
    }

    #[test]
    fn test_nested_pattern() {
        let filter = make_filter(&["b/c/d"]);

        assert!(filter.should_ignore("b/c/d", &PathBuf::from("/test/b/c/d")));
        assert!(!filter.should_ignore("b/c", &PathBuf::from("/test/b/c")));
        assert!(!filter.should_ignore("b", &PathBuf::from("/test/b")));
    }

    #[test]
    fn test_globstar_in_middle() {
        let filter = make_filter(&["**/d"]);

        assert!(filter.should_ignore("d", &PathBuf::from("/test/d")));
        assert!(filter.should_ignore("a/d", &PathBuf::from("/test/a/d")));
        assert!(filter.should_ignore("a/b/c/d", &PathBuf::from("/test/a/b/c/d")));
    }

    #[test]
    fn test_multiple_patterns() {
        let filter = make_filter(&["c", "bc", "symlink", "abcdef"]);

        assert!(filter.should_ignore("c", &PathBuf::from("/test/c")));
        assert!(filter.should_ignore("bc", &PathBuf::from("/test/bc")));
        assert!(filter.should_ignore("symlink", &PathBuf::from("/test/symlink")));
        assert!(filter.should_ignore("abcdef", &PathBuf::from("/test/abcdef")));
        assert!(!filter.should_ignore("abcfed", &PathBuf::from("/test/abcfed")));
    }

    #[test]
    fn test_brace_expansion_in_ignore() {
        let filter = make_filter(&["abc{def,fed}/**"]);

        assert!(filter.should_ignore("abcdef", &PathBuf::from("/test/abcdef")));
        assert!(filter.should_ignore("abcfed", &PathBuf::from("/test/abcfed")));
        assert!(filter.children_ignored("abcdef", &PathBuf::from("/test/abcdef")));
        assert!(filter.children_ignored("abcfed", &PathBuf::from("/test/abcfed")));
        assert!(!filter.should_ignore("abcxyz", &PathBuf::from("/test/abcxyz")));
    }

    #[test]
    fn test_dot_slash_stripped() {
        let filter = make_filter(&["./b"]);

        // ./b should match "b"
        assert!(filter.should_ignore("b", &PathBuf::from("/test/b")));
    }

    #[test]
    fn test_pattern_with_question_mark() {
        let filter = make_filter(&["a/**/[gh]"]);

        // Should match paths like a/*/g or a/*/h
        assert!(filter.should_ignore("a/abcdef/g", &PathBuf::from("/test/a/abcdef/g")));
        assert!(filter.should_ignore("a/abcdef/g/h", &PathBuf::from("/test/a/abcdef/g/h")));
    }

    #[test]
    fn test_is_empty() {
        let empty = make_filter(&[]);
        assert!(empty.is_empty());

        let non_empty = make_filter(&["*.txt"]);
        assert!(!non_empty.is_empty());
    }
}
