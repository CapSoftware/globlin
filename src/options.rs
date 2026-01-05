use napi::bindgen_prelude::*;

/// Complete GlobOptions struct with all glob v13 options.
///
/// All options are optional and false by default unless otherwise noted.
/// This struct is designed to be 100% API-compatible with glob v13.0.0.
#[napi(object)]
#[derive(Default, Clone)]
pub struct GlobOptions {
    // ==================== Path Options ====================
    /// The current working directory in which to search.
    /// Defaults to `process.cwd()`.
    ///
    /// May be either a string path or a `file://` URL object or string.
    /// URL handling is done in the JavaScript wrapper.
    pub cwd: Option<String>,

    /// A string path resolved against the `cwd` option, which is used as the
    /// starting point for absolute patterns that start with `/`.
    ///
    /// Note that this doesn't necessarily limit the walk to the `root` directory,
    /// and doesn't affect the cwd starting point for non-absolute patterns.
    /// A pattern containing `..` will still be able to traverse out of the root
    /// directory, if it is not an actual root directory on the filesystem.
    pub root: Option<String>,

    // ==================== Pattern Options ====================
    /// Include `.dot` files in normal matches and `globstar` matches.
    /// Note that an explicit dot in a portion of the pattern will always match dot files.
    pub dot: Option<bool>,

    /// Do not expand `{a,b}` and `{1..3}` brace sets.
    pub nobrace: Option<bool>,

    /// Do not match `**` against multiple filenames.
    /// (Ie, treat it as a normal `*` instead.)
    ///
    /// Conflicts with `matchBase`.
    pub noglobstar: Option<bool>,

    /// Do not match "extglob" patterns such as `+(a|b)`.
    pub noext: Option<bool>,

    /// Perform a case-insensitive match.
    ///
    /// Defaults to `true` on macOS and Windows systems, and `false` on all others.
    ///
    /// **Note:** `nocase` should only be explicitly set when it is known that the
    /// filesystem's case sensitivity differs from the platform default.
    pub nocase: Option<bool>,

    /// Treat brace expansion like `{a,b}` as a "magic" pattern.
    /// Has no effect if `nobrace` is set.
    ///
    /// Only affects the `hasMagic` function.
    #[napi(js_name = "magicalBraces")]
    pub magical_braces: Option<bool>,

    // ==================== Traversal Options ====================
    /// Follow symlinked directories when expanding `**` patterns.
    /// This can result in a lot of duplicate references in the presence of
    /// cyclic links, and make performance quite bad.
    ///
    /// By default, a `**` in a pattern will follow 1 symbolic link if it is not
    /// the first item in the pattern, or none if it is the first item in the
    /// pattern, following the same behavior as Bash.
    pub follow: Option<bool>,

    /// Limit the directory traversal to a given depth below the cwd.
    ///
    /// - `undefined`/`None`: No limit (traverse all levels)
    /// - `0`: Only the starting directory itself
    /// - `1`: Starting directory and immediate children
    /// - `n`: Up to n levels deep from the starting directory
    ///
    /// Negative values result in empty results.
    /// Note that this does NOT prevent traversal to sibling folders, root patterns,
    /// and so on. It only limits the maximum folder depth that the walk will descend.
    #[napi(js_name = "maxDepth")]
    pub max_depth: Option<i32>,

    /// Perform a basename-only match if the pattern does not contain any slash
    /// characters. That is, a pattern like "*.js" would be treated as equivalent
    /// to a recursive pattern matching all js files in all directories.
    ///
    /// Cannot be used with noglobstar: true.
    #[napi(js_name = "matchBase")]
    pub match_base: Option<bool>,

    // ==================== Output Options ====================
    /// Set to `true` to always receive absolute paths for matched files.
    /// Set to `false` to always return relative paths.
    ///
    /// When this option is not set, absolute paths are returned for patterns
    /// that are absolute, and otherwise paths are returned that are relative
    /// to the `cwd` setting.
    ///
    /// This does _not_ make an extra system call to get the realpath, it only
    /// does string path resolution.
    ///
    /// Conflicts with `withFileTypes`.
    pub absolute: Option<bool>,

    /// Prepend all relative path strings with `./` (or `.\` on Windows).
    ///
    /// Without this option, returned relative paths are "bare", so instead of
    /// returning `'./foo/bar'`, they are returned as `'foo/bar'`.
    ///
    /// Relative patterns starting with `'../'` are not prepended with `./`,
    /// even if this option is set.
    #[napi(js_name = "dotRelative")]
    pub dot_relative: Option<bool>,

    /// Add a `/` character to directory matches.
    /// Note that this requires additional stat calls in some cases.
    pub mark: Option<bool>,

    /// Do not match directories, only files.
    /// (Note: to match _only_ directories, put a `/` at the end of the pattern.)
    pub nodir: Option<bool>,

    /// Return `/` delimited paths, even on Windows.
    ///
    /// On posix systems, this has no effect. But, on Windows, it means that
    /// paths will be `/` delimited, and absolute paths will be their full
    /// resolved UNC forms, eg instead of `'C:\\foo\\bar'`, it would return
    /// `'//?/C:/foo/bar'`
    pub posix: Option<bool>,

    /// Return PathScurry `Path` objects instead of strings.
    /// These are similar to a NodeJS `Dirent` object, but with additional
    /// methods and properties.
    ///
    /// Conflicts with `absolute`.
    ///
    /// Note: In globlin, this is handled in the JavaScript wrapper which converts
    /// Rust results to PathScurry objects.
    #[napi(js_name = "withFileTypes")]
    pub with_file_types: Option<bool>,

    // ==================== Performance Options ====================
    /// Call `lstat()` on all entries, whether required or not to determine
    /// if it's a valid match. When used with `withFileTypes`, this means
    /// that matches will include data such as modified time, permissions, etc.
    ///
    /// Note that this will incur a performance cost due to the added system calls.
    pub stat: Option<bool>,

    /// Set to true to call `fs.realpath` on all of the results.
    /// In the case of an entry that cannot be resolved, the entry is omitted.
    ///
    /// This incurs a slight performance penalty due to the added system calls.
    pub realpath: Option<bool>,

    // ==================== Filtering Options ====================
    /// Patterns to exclude from matching.
    /// Can be a single pattern string or an array of patterns.
    ///
    /// If an object with `ignored(path)` and/or `childrenIgnored(path)` methods
    /// is provided, those methods will be called to determine whether any Path
    /// is a match or if its children should be traversed.
    ///
    /// **Note:** `ignore` patterns are _always_ in `dot:true` mode, regardless
    /// of any other settings.
    ///
    /// Patterns ending in `/**` will ignore the directory and all its children.
    pub ignore: Option<Either<String, Vec<String>>>,

    /// Do not match any children of any matches.
    ///
    /// For example, a recursive pattern would match "a/foo" but not "a/foo/b/foo"
    /// in this mode.
    ///
    /// This is especially useful for cases like "find all `node_modules` folders,
    /// but not the ones in `node_modules`".
    ///
    /// Defaults to `true`.
    #[napi(js_name = "includeChildMatches")]
    pub include_child_matches: Option<bool>,

    // ==================== Platform Options ====================
    /// Defaults to value of `process.platform` if available, or `'linux'` if not.
    ///
    /// Setting `platform:'win32'` on non-Windows systems may cause strange behavior.
    pub platform: Option<String>,

    /// Use `\\` as a path separator _only_, and _never_ as an escape character.
    /// If set, all `\\` characters are replaced with `/` in the pattern.
    ///
    /// Note that this makes it **impossible** to match against paths containing
    /// literal glob pattern characters, but allows matching with patterns
    /// constructed using `path.join()` and `path.resolve()` on Windows platforms.
    #[napi(js_name = "windowsPathsNoEscape")]
    pub windows_paths_no_escape: Option<bool>,

    /// Set to false to enable `windowsPathsNoEscape`.
    ///
    /// @deprecated Use `windowsPathsNoEscape` instead.
    #[napi(js_name = "allowWindowsEscape")]
    pub allow_windows_escape: Option<bool>,

    // ==================== Performance Options (globlin-specific) ====================
    /// Enable parallel directory walking using multiple threads.
    ///
    /// When `true`, uses parallel traversal which can be faster on:
    /// - Spinning hard drives (HDDs)
    /// - Network filesystems (NFS, CIFS)
    /// - Very large directory trees
    ///
    /// When `false` (default), uses serial traversal which is:
    /// - Faster on SSDs for small to medium directories
    /// - Deterministic result ordering
    /// - Lower memory overhead
    ///
    /// **Note:** This is a globlin-specific option not present in the original glob package.
    /// Results may be returned in a different order when `parallel: true`.
    pub parallel: Option<bool>,
    // ==================== Not Supported in Rust ====================
    // The following options are handled in the JavaScript wrapper:
    // - signal: AbortSignal (JS-only)
    // - fs: Custom FS implementation (not needed for native code)
    // - scurry: PathScurry instance (created in JS wrapper)
    // - debug: Debug logging (not implemented)
}

impl GlobOptions {
    /// Get the effective windowsPathsNoEscape value, considering the deprecated allowWindowsEscape option.
    pub fn effective_windows_paths_no_escape(&self) -> bool {
        if let Some(val) = self.windows_paths_no_escape {
            val
        } else if let Some(allow) = self.allow_windows_escape {
            !allow // allowWindowsEscape: false means windowsPathsNoEscape: true
        } else {
            false
        }
    }

    /// Get the platform string, defaulting to the current OS.
    pub fn effective_platform(&self) -> String {
        if let Some(ref p) = self.platform {
            p.clone()
        } else {
            // Map Rust OS constants to Node.js platform strings
            match std::env::consts::OS {
                "macos" => "darwin".to_string(),
                "windows" => "win32".to_string(),
                os => os.to_string(),
            }
        }
    }

    /// Get the effective nocase value based on platform defaults.
    /// - macOS (darwin): true (case-insensitive by default)
    /// - Windows (win32): true (case-insensitive by default)
    /// - Linux and others: false (case-sensitive by default)
    pub fn effective_nocase(&self) -> bool {
        if let Some(val) = self.nocase {
            val
        } else {
            let platform = self.effective_platform();
            platform == "darwin" || platform == "win32"
        }
    }

    /// Check if includeChildMatches is enabled (defaults to true).
    pub fn effective_include_child_matches(&self) -> bool {
        self.include_child_matches.unwrap_or(true)
    }
}

/// Validate glob options and return an error if invalid.
/// This matches glob v13's validation behavior.
pub fn validate_options(options: &GlobOptions) -> Result<()> {
    // matchBase and noglobstar cannot both be true
    if options.match_base.unwrap_or(false) && options.noglobstar.unwrap_or(false) {
        return Err(napi::Error::from_reason("base matching requires globstar"));
    }

    // withFileTypes and absolute are mutually exclusive
    if options.with_file_types.unwrap_or(false) && options.absolute.is_some() {
        return Err(napi::Error::from_reason(
            "cannot set absolute and withFileTypes:true",
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_options() {
        let opts = GlobOptions::default();
        assert!(opts.cwd.is_none());
        assert!(opts.dot.is_none());
        assert!(opts.absolute.is_none());
    }

    #[test]
    fn test_effective_windows_paths_no_escape() {
        // Default is false
        let opts = GlobOptions::default();
        assert!(!opts.effective_windows_paths_no_escape());

        // Explicit windowsPathsNoEscape
        let opts = GlobOptions {
            windows_paths_no_escape: Some(true),
            ..Default::default()
        };
        assert!(opts.effective_windows_paths_no_escape());

        // Deprecated allowWindowsEscape: false means windowsPathsNoEscape: true
        let opts = GlobOptions {
            allow_windows_escape: Some(false),
            ..Default::default()
        };
        assert!(opts.effective_windows_paths_no_escape());

        // windowsPathsNoEscape takes precedence over allowWindowsEscape
        let opts = GlobOptions {
            windows_paths_no_escape: Some(false),
            allow_windows_escape: Some(false),
            ..Default::default()
        };
        assert!(!opts.effective_windows_paths_no_escape());
    }

    #[test]
    fn test_effective_platform() {
        // Explicit platform
        let opts = GlobOptions {
            platform: Some("darwin".to_string()),
            ..Default::default()
        };
        assert_eq!(opts.effective_platform(), "darwin");

        let opts = GlobOptions {
            platform: Some("win32".to_string()),
            ..Default::default()
        };
        assert_eq!(opts.effective_platform(), "win32");

        // Default uses current OS
        let opts = GlobOptions::default();
        let platform = opts.effective_platform();
        // Just verify it returns something valid
        assert!(!platform.is_empty());
    }

    #[test]
    fn test_effective_nocase() {
        // Explicit nocase
        let opts = GlobOptions {
            nocase: Some(true),
            ..Default::default()
        };
        assert!(opts.effective_nocase());

        let opts = GlobOptions {
            nocase: Some(false),
            ..Default::default()
        };
        assert!(!opts.effective_nocase());

        // Platform-based defaults
        let opts = GlobOptions {
            platform: Some("darwin".to_string()),
            ..Default::default()
        };
        assert!(opts.effective_nocase());

        let opts = GlobOptions {
            platform: Some("win32".to_string()),
            ..Default::default()
        };
        assert!(opts.effective_nocase());

        let opts = GlobOptions {
            platform: Some("linux".to_string()),
            ..Default::default()
        };
        assert!(!opts.effective_nocase());
    }

    #[test]
    fn test_effective_include_child_matches() {
        // Defaults to true
        let opts = GlobOptions::default();
        assert!(opts.effective_include_child_matches());

        // Explicit false
        let opts = GlobOptions {
            include_child_matches: Some(false),
            ..Default::default()
        };
        assert!(!opts.effective_include_child_matches());
    }

    #[test]
    fn test_validate_options_valid() {
        let opts = GlobOptions::default();
        assert!(validate_options(&opts).is_ok());

        let opts = GlobOptions {
            match_base: Some(true),
            ..Default::default()
        };
        assert!(validate_options(&opts).is_ok());
    }

    #[test]
    fn test_validate_options_match_base_with_noglobstar() {
        let opts = GlobOptions {
            match_base: Some(true),
            noglobstar: Some(true),
            ..Default::default()
        };
        assert!(validate_options(&opts).is_err());
    }

    #[test]
    fn test_validate_options_with_file_types_and_absolute() {
        let opts = GlobOptions {
            with_file_types: Some(true),
            absolute: Some(true),
            ..Default::default()
        };
        assert!(validate_options(&opts).is_err());

        // withFileTypes alone is ok
        let opts = GlobOptions {
            with_file_types: Some(true),
            ..Default::default()
        };
        assert!(validate_options(&opts).is_ok());
    }
}
