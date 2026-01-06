#![deny(clippy::all)]
#![allow(dead_code)]

#[macro_use]
extern crate napi_derive;

// Module declarations - made public for profiling binary
pub mod cache;
pub mod glob;
pub mod ignore;
pub mod options;
pub mod pattern;
pub mod processor;
pub mod util;
pub mod walker;

// SIMD-optimized string operations
pub mod simd;

// Platform-specific I/O optimizations
#[cfg(target_os = "linux")]
pub mod io_uring_walker;

#[cfg(target_os = "macos")]
pub mod macos_walker;

#[cfg(target_os = "macos")]
pub mod gcd_walker;

// Re-exports
pub use glob::PathData;
pub use glob::*;
pub use options::GlobOptions;

/// Escape magic glob characters in a pattern.
/// After escaping, the pattern will match literally (no globbing).
///
/// @param pattern - The glob pattern to escape
/// @param windowsPathsNoEscape - If true, use `[x]` wrapping instead of backslash escapes
/// @returns The escaped pattern
#[napi]
pub fn escape(pattern: String, windows_paths_no_escape: Option<bool>) -> String {
    pattern::escape_pattern(&pattern, windows_paths_no_escape.unwrap_or(false))
}

/// Unescape magic glob characters in a pattern.
/// This reverses the effect of `escape()`.
///
/// @param pattern - The escaped pattern to unescape
/// @param windowsPathsNoEscape - If true, remove `[x]` wrapping instead of backslash escapes
/// @returns The unescaped pattern
#[napi]
pub fn unescape(pattern: String, windows_paths_no_escape: Option<bool>) -> String {
    pattern::unescape_pattern(&pattern, windows_paths_no_escape.unwrap_or(false))
}

/// Check if a pattern contains any magic glob characters.
/// Takes into account escaped characters.
///
/// @param pattern - The glob pattern to check
/// @param options - Options affecting magic detection
/// @returns True if the pattern has magic (unescaped) glob characters
#[napi]
pub fn has_magic(
    pattern: String,
    noext: Option<bool>,
    windows_paths_no_escape: Option<bool>,
) -> bool {
    pattern::has_magic_in_pattern(
        &pattern,
        noext.unwrap_or(false),
        windows_paths_no_escape.unwrap_or(false),
    )
}

/// A pattern warning with message and optional suggestion.
/// Used for providing helpful feedback about potential pattern issues.
#[napi(object)]
pub struct PatternWarningInfo {
    /// The type of warning (e.g., "escaped_wildcard", "performance", "empty")
    pub warning_type: String,
    /// Human-readable warning message
    pub message: String,
    /// The original problematic pattern
    pub pattern: Option<String>,
    /// Suggested fix (if applicable)
    pub suggestion: Option<String>,
}

impl From<pattern::PatternWarning> for PatternWarningInfo {
    fn from(warning: pattern::PatternWarning) -> Self {
        let message = warning.message();
        match warning {
            pattern::PatternWarning::EscapedWildcardAtStart {
                pattern,
                suggestion,
            } => PatternWarningInfo {
                warning_type: "escaped_wildcard_at_start".to_string(),
                message,
                pattern: Some(pattern),
                suggestion: Some(suggestion),
            },
            pattern::PatternWarning::DoubleEscaped {
                pattern,
                suggestion,
            } => PatternWarningInfo {
                warning_type: "double_escaped".to_string(),
                message,
                pattern: Some(pattern),
                suggestion: Some(suggestion),
            },
            pattern::PatternWarning::BackslashOnWindows {
                pattern,
                suggestion,
            } => PatternWarningInfo {
                warning_type: "backslash_on_windows".to_string(),
                message,
                pattern: Some(pattern),
                suggestion: Some(suggestion),
            },
            pattern::PatternWarning::PerformanceWarning {
                pattern,
                suggestion,
                ..
            } => PatternWarningInfo {
                warning_type: "performance".to_string(),
                message,
                pattern: Some(pattern),
                suggestion: Some(suggestion),
            },
            pattern::PatternWarning::TrailingSpaces {
                pattern,
                suggestion,
            } => PatternWarningInfo {
                warning_type: "trailing_spaces".to_string(),
                message,
                pattern: Some(pattern),
                suggestion: Some(suggestion),
            },
            pattern::PatternWarning::EmptyPattern => PatternWarningInfo {
                warning_type: "empty_pattern".to_string(),
                message,
                pattern: None,
                suggestion: None,
            },
            pattern::PatternWarning::NullBytes { pattern } => PatternWarningInfo {
                warning_type: "null_bytes".to_string(),
                message,
                pattern: Some(pattern),
                suggestion: None,
            },
        }
    }
}

/// Analyze a pattern for potential issues and return warnings.
/// This is useful for providing helpful feedback about common mistakes.
///
/// @param pattern - The glob pattern to analyze
/// @param windowsPathsNoEscape - Whether backslashes are path separators (Windows mode)
/// @param platform - The target platform ("win32", "darwin", "linux")
/// @returns Array of warnings (empty if no issues detected)
#[napi]
pub fn analyze_pattern(
    pattern: String,
    windows_paths_no_escape: Option<bool>,
    platform: Option<String>,
) -> Vec<PatternWarningInfo> {
    pattern::analyze_pattern(
        &pattern,
        windows_paths_no_escape.unwrap_or(false),
        platform.as_deref(),
    )
    .into_iter()
    .map(PatternWarningInfo::from)
    .collect()
}

/// Analyze multiple patterns for potential issues and return all warnings.
///
/// @param patterns - Array of glob patterns to analyze
/// @param windowsPathsNoEscape - Whether backslashes are path separators (Windows mode)
/// @param platform - The target platform ("win32", "darwin", "linux")
/// @returns Array of warnings for all patterns (empty if no issues detected)
#[napi]
pub fn analyze_patterns(
    patterns: Vec<String>,
    windows_paths_no_escape: Option<bool>,
    platform: Option<String>,
) -> Vec<PatternWarningInfo> {
    pattern::analyze_patterns(
        &patterns,
        windows_paths_no_escape.unwrap_or(false),
        platform.as_deref(),
    )
    .into_iter()
    .map(PatternWarningInfo::from)
    .collect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
