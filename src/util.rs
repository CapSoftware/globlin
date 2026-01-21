// Utility functions for globlin
//
// This module contains helper functions used across the crate.

use std::path::{Path, PathBuf};

/// Strip the Windows extended-length path prefix (\\?\) from a path.
/// On Windows, `canonicalize()` returns paths with this prefix.
/// We need to strip it to match glob v13's behavior.
///
/// Examples:
/// - `\\?\C:\Users\foo` -> `C:\Users\foo`
/// - `\\?\UNC\server\share` -> `\\server\share`
/// - `/path/to/file` -> `/path/to/file` (unchanged on non-Windows)
#[inline]
pub fn strip_windows_extended_prefix(path: PathBuf) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let path_str = path.to_string_lossy();

        // Check for \\?\ prefix (verbatim path)
        if path_str.starts_with(r"\\?\") {
            let stripped = &path_str[4..];

            // Handle UNC paths: \\?\UNC\server\share -> \\server\share
            if stripped.starts_with(r"UNC\") {
                return PathBuf::from(format!(r"\\{}", &stripped[4..]));
            }

            // Regular path: \\?\C:\... -> C:\...
            return PathBuf::from(stripped);
        }

        path
    }

    #[cfg(not(target_os = "windows"))]
    {
        path
    }
}

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

    #[test]
    fn test_strip_windows_extended_prefix() {
        // On non-Windows, should return path unchanged
        let path = PathBuf::from("/home/user/file.txt");
        assert_eq!(strip_windows_extended_prefix(path.clone()), path);

        // Test Windows-style paths (will only be stripped on Windows)
        #[cfg(target_os = "windows")]
        {
            use std::path::PathBuf;

            // Regular verbatim path: \\?\C:\Users\foo -> C:\Users\foo
            let path = PathBuf::from(r"\\?\C:\Users\foo");
            assert_eq!(
                strip_windows_extended_prefix(path),
                PathBuf::from(r"C:\Users\foo")
            );

            // UNC path: \\?\UNC\server\share -> \\server\share
            let path = PathBuf::from(r"\\?\UNC\server\share");
            assert_eq!(
                strip_windows_extended_prefix(path),
                PathBuf::from(r"\\server\share")
            );

            // Non-verbatim path should be unchanged
            let path = PathBuf::from(r"C:\Users\foo");
            assert_eq!(strip_windows_extended_prefix(path.clone()), path);
        }
    }

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
