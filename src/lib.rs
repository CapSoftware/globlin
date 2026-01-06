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

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
