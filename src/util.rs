// Utility functions for globlin
//
// This module contains helper functions used across the crate.

use std::path::Path;

/// Checks if a filename starts with a dot (hidden file)
pub fn is_dot_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.starts_with('.'))
        .unwrap_or(false)
}

/// Normalizes a path separator to forward slashes
pub fn normalize_separator(path: &str) -> String {
    path.replace('\\', "/")
}

/// Joins path components with forward slashes
pub fn join_path(base: &str, path: &str) -> String {
    if base.is_empty() {
        path.to_string()
    } else if path.is_empty() {
        base.to_string()
    } else {
        format!(
            "{}/{}",
            base.trim_end_matches('/'),
            path.trim_start_matches('/')
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_is_dot_file() {
        assert!(is_dot_file(Path::new(".hidden")));
        assert!(is_dot_file(Path::new(".gitignore")));
        assert!(!is_dot_file(Path::new("visible")));
        assert!(!is_dot_file(Path::new("file.txt")));
    }

    #[test]
    fn test_normalize_separator() {
        assert_eq!(normalize_separator("foo\\bar"), "foo/bar");
        assert_eq!(normalize_separator("foo/bar"), "foo/bar");
        assert_eq!(normalize_separator("foo\\bar\\baz"), "foo/bar/baz");
    }

    #[test]
    fn test_join_path() {
        assert_eq!(join_path("foo", "bar"), "foo/bar");
        assert_eq!(join_path("foo/", "bar"), "foo/bar");
        assert_eq!(join_path("foo", "/bar"), "foo/bar");
        assert_eq!(join_path("", "bar"), "bar");
        assert_eq!(join_path("foo", ""), "foo");
    }
}
