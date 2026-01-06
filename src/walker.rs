// Directory walking and filesystem traversal

use std::borrow::Cow;
use std::path::{Path, PathBuf};
use walkdir::{DirEntry, WalkDir};

use crate::cache::read_dir_cached;

// Parallel walking support via jwalk (jwalk::WalkDir is used directly)

/// Normalize path separators from backslash to forward slash.
/// Returns Cow::Borrowed when no backslashes are present (avoids allocation).
#[inline]
fn normalize_path_str(path: &str) -> Cow<'_, str> {
    if path.contains('\\') {
        Cow::Owned(path.replace('\\', "/"))
    } else {
        Cow::Borrowed(path)
    }
}

/// Options for directory walking
#[derive(Debug, Clone, Default)]
pub struct WalkOptions {
    /// Follow symbolic links
    pub follow_symlinks: bool,
    /// Maximum depth to traverse (None = unlimited)
    pub max_depth: Option<usize>,
    /// Include dotfiles (files starting with .)
    pub dot: bool,
    /// Whether to accurately detect symlinks even when following them.
    /// This is needed for the `mark` option to correctly NOT add trailing slashes to symlinks.
    /// When false, avoids an extra stat call per file (faster).
    pub need_accurate_symlink_detection: bool,
    /// Enable parallel directory walking using multiple threads.
    /// When true, uses jwalk for parallel traversal which can be faster on HDDs and network drives.
    /// When false (default), uses walkdir for serial traversal which is faster on SSDs.
    pub parallel: bool,
    /// Enable directory caching for repeated glob operations.
    /// When true, uses an LRU cache with TTL-based invalidation to cache directory listings.
    /// This provides significant speedup for repeated glob operations on the same directories.
    pub cache: bool,
    /// Use native I/O optimizations (Linux only).
    /// When true on Linux, uses getdents64 syscall for faster directory reading.
    /// On other platforms, this option is ignored.
    pub use_native_io: bool,
}

/// A filter function that can prune directories during walking.
/// Returns true if the directory should be traversed, false to skip it.
pub type DirPruneFilter = Box<dyn Fn(&str) -> bool + Send + Sync>;

impl WalkOptions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn follow_symlinks(mut self, follow: bool) -> Self {
        self.follow_symlinks = follow;
        self
    }

    pub fn max_depth(mut self, depth: Option<usize>) -> Self {
        self.max_depth = depth;
        self
    }

    pub fn dot(mut self, include_dot: bool) -> Self {
        self.dot = include_dot;
        self
    }

    pub fn need_accurate_symlink_detection(mut self, need: bool) -> Self {
        self.need_accurate_symlink_detection = need;
        self
    }

    pub fn parallel(mut self, parallel: bool) -> Self {
        self.parallel = parallel;
        self
    }

    pub fn cache(mut self, cache: bool) -> Self {
        self.cache = cache;
        self
    }

    pub fn use_native_io(mut self, use_native_io: bool) -> Self {
        self.use_native_io = use_native_io;
        self
    }
}

/// A single entry returned from the walker
#[derive(Debug, Clone)]
pub struct WalkEntry {
    pub(crate) path: PathBuf,
    pub(crate) depth: usize,
    pub(crate) is_dir: bool,
    pub(crate) is_file: bool,
    pub(crate) is_symlink: bool,
}

impl WalkEntry {
    /// Create a WalkEntry from a walkdir DirEntry without checking symlink metadata.
    /// This is faster but may not correctly detect symlinks when following links.
    /// Use this when `mark` option is false and you don't need accurate symlink detection.
    #[inline]
    pub fn from_dir_entry_fast(entry: &DirEntry) -> Self {
        let file_type = entry.file_type();
        Self {
            path: entry.path().to_path_buf(),
            depth: entry.depth(),
            is_dir: file_type.is_dir(),
            is_file: file_type.is_file(),
            is_symlink: file_type.is_symlink(),
        }
    }

    /// Create a WalkEntry from a jwalk DirEntry without checking symlink metadata.
    /// Used for parallel walking mode.
    #[inline]
    pub fn from_jwalk_entry_fast<C: jwalk::ClientState>(entry: &jwalk::DirEntry<C>) -> Self {
        let file_type = entry.file_type();
        Self {
            path: entry.path(),
            depth: entry.depth,
            is_dir: file_type.is_dir(),
            is_file: file_type.is_file(),
            is_symlink: file_type.is_symlink(),
        }
    }

    /// Create a WalkEntry from a jwalk DirEntry with full symlink detection.
    /// Used for parallel walking mode when accurate symlink detection is needed.
    pub fn from_jwalk_entry<C: jwalk::ClientState>(entry: &jwalk::DirEntry<C>) -> Self {
        let file_type = entry.file_type();
        let path = entry.path();
        // When following symlinks, jwalk reports the TARGET type, not the symlink type.
        // To detect if the entry is a symlink, we need to check symlink_metadata.
        let is_symlink = if file_type.is_symlink() {
            true
        } else {
            path.symlink_metadata()
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false)
        };
        Self {
            path,
            depth: entry.depth,
            is_dir: file_type.is_dir(),
            is_file: file_type.is_file(),
            is_symlink,
        }
    }

    /// Create a WalkEntry from a walkdir DirEntry with full symlink detection.
    /// This is slower because it makes an extra syscall for symlink_metadata,
    /// but correctly detects symlinks even when following them.
    /// Use this when `mark` option is true.
    pub fn from_dir_entry(entry: &DirEntry) -> Self {
        let file_type = entry.file_type();
        // When following symlinks, walkdir reports the TARGET type, not the symlink type.
        // To detect if the entry is a symlink, we need to check symlink_metadata.
        // This is needed for correct behavior of the `mark` option.
        let is_symlink = if file_type.is_symlink() {
            true
        } else {
            // Check with symlink_metadata since walkdir may have followed the link
            entry
                .path()
                .symlink_metadata()
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false)
        };
        Self {
            path: entry.path().to_path_buf(),
            depth: entry.depth(),
            is_dir: file_type.is_dir(),
            is_file: file_type.is_file(),
            is_symlink,
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn depth(&self) -> usize {
        self.depth
    }

    pub fn is_dir(&self) -> bool {
        self.is_dir
    }

    pub fn is_file(&self) -> bool {
        self.is_file
    }

    pub fn is_symlink(&self) -> bool {
        self.is_symlink
    }

    pub fn file_name(&self) -> Option<&std::ffi::OsStr> {
        self.path.file_name()
    }

    /// Get the file name as a string slice if possible, for fast comparisons.
    #[inline]
    pub fn file_name_str(&self) -> Option<&str> {
        self.path.file_name().and_then(|s| s.to_str())
    }
}

/// Directory walker that can traverse filesystem trees
pub struct Walker {
    root: PathBuf,
    options: WalkOptions,
    /// Optional filter to prune directories during traversal.
    /// The filter receives the path relative to root (as a string with forward slashes)
    /// and returns true if the directory should be traversed, false to skip it.
    dir_prune_filter: Option<DirPruneFilter>,
}

impl Walker {
    pub fn new(root: PathBuf, options: WalkOptions) -> Self {
        Self {
            root,
            options,
            dir_prune_filter: None,
        }
    }

    /// Create a walker with default options
    pub fn with_root(root: PathBuf) -> Self {
        Self::new(root, WalkOptions::default())
    }

    /// Set a directory pruning filter.
    /// The filter receives the path relative to root (as a string with forward slashes)
    /// and returns true if the directory should be traversed, false to skip it.
    pub fn with_dir_prune_filter(mut self, filter: DirPruneFilter) -> Self {
        self.dir_prune_filter = Some(filter);
        self
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn options(&self) -> &WalkOptions {
        &self.options
    }

    /// Walk the directory tree, returning an iterator over entries.
    ///
    /// Note: When a dir_prune_filter is set, the walk collects entries into a Vec
    /// to properly apply the filter. Without a filter, it returns a lazy iterator.
    ///
    /// If `use_native_io` is enabled on Linux, uses optimized getdents64 syscall.
    /// If `use_native_io` is enabled on macOS, uses optimized getdirentries64 syscall.
    /// If `cache` is enabled in options, uses a cached directory reader.
    /// If `parallel` is enabled in options, uses jwalk for parallel traversal.
    /// Otherwise, uses walkdir for serial traversal.
    pub fn walk(&self) -> Box<dyn Iterator<Item = WalkEntry> + '_> {
        // On Linux, use optimized I/O if requested
        #[cfg(target_os = "linux")]
        if self.options.use_native_io {
            return self.walk_native_io_linux();
        }

        // On macOS, use optimized I/O if requested
        #[cfg(target_os = "macos")]
        if self.options.use_native_io {
            return self.walk_native_io_macos();
        }

        if self.options.cache {
            self.walk_cached()
        } else if self.options.parallel {
            self.walk_parallel()
        } else {
            self.walk_serial()
        }
    }

    /// Walk using Linux-specific I/O optimizations (getdents64 syscall).
    /// This provides 1.3-1.5x speedup over standard readdir.
    #[cfg(target_os = "linux")]
    fn walk_native_io_linux(&self) -> Box<dyn Iterator<Item = WalkEntry> + '_> {
        use crate::io_uring_walker::IoUringWalker;

        let io_walker = IoUringWalker::new(self.root.clone(), self.options.clone());
        let mut entries = io_walker.walk();

        // Apply pruning filter if set
        if let Some(ref prune_filter) = self.dir_prune_filter {
            let root = self.root.clone();
            entries = entries
                .into_iter()
                .filter(|entry| {
                    if let Ok(rel_path) = entry.path().strip_prefix(&root) {
                        let rel_lossy = rel_path.to_string_lossy();
                        let rel_str = normalize_path_str(&rel_lossy);
                        // Root directory always passes
                        if rel_str.is_empty() {
                            return true;
                        }
                        // For directories, check if they should be included
                        if entry.is_dir() && !prune_filter(&rel_str) {
                            return false;
                        }
                        // For files, check if their parent directory passes the filter
                        if !entry.is_dir() {
                            if let Some(parent) = rel_path.parent() {
                                let parent_lossy = parent.to_string_lossy();
                                let parent_str = normalize_path_str(&parent_lossy);
                                if !parent_str.is_empty() && !prune_filter(&parent_str) {
                                    return false;
                                }
                            }
                        }
                    }
                    true
                })
                .collect();
        }

        Box::new(entries.into_iter())
    }

    /// Walk using macOS-specific I/O optimizations (getdirentries syscall).
    /// This provides 1.3-1.5x speedup over standard readdir.
    #[cfg(target_os = "macos")]
    fn walk_native_io_macos(&self) -> Box<dyn Iterator<Item = WalkEntry> + '_> {
        use crate::macos_walker::MacosWalker;

        let macos_walker = MacosWalker::new(self.root.clone(), self.options.clone());
        let mut entries = macos_walker.walk();

        // Apply pruning filter if set
        if let Some(ref prune_filter) = self.dir_prune_filter {
            let root = self.root.clone();
            entries = entries
                .into_iter()
                .filter(|entry| {
                    if let Ok(rel_path) = entry.path().strip_prefix(&root) {
                        let rel_lossy = rel_path.to_string_lossy();
                        let rel_str = normalize_path_str(&rel_lossy);
                        // Root directory always passes
                        if rel_str.is_empty() {
                            return true;
                        }
                        // For directories, check if they should be included
                        if entry.is_dir() && !prune_filter(&rel_str) {
                            return false;
                        }
                        // For files, check if their parent directory passes the filter
                        if !entry.is_dir() {
                            if let Some(parent) = rel_path.parent() {
                                let parent_lossy = parent.to_string_lossy();
                                let parent_str = normalize_path_str(&parent_lossy);
                                if !parent_str.is_empty() && !prune_filter(&parent_str) {
                                    return false;
                                }
                            }
                        }
                    }
                    true
                })
                .collect();
        }

        Box::new(entries.into_iter())
    }

    /// Walk the directory tree using serial (single-threaded) walkdir.
    /// This is the default mode, faster on SSDs for small to medium directories.
    fn walk_serial(&self) -> Box<dyn Iterator<Item = WalkEntry> + '_> {
        let mut walker = WalkDir::new(&self.root).follow_links(self.options.follow_symlinks);

        if let Some(max_depth) = self.options.max_depth {
            walker = walker.max_depth(max_depth);
        }

        let dot = self.options.dot;
        let root = self.root.clone();
        let need_accurate_symlink = self.options.need_accurate_symlink_detection;

        // Choose the appropriate entry creation function based on whether we need
        // accurate symlink detection. This avoids an extra syscall per file when not needed.
        let create_entry = if need_accurate_symlink {
            WalkEntry::from_dir_entry
        } else {
            WalkEntry::from_dir_entry_fast
        };

        // If we have a pruning filter, we need to use it in filter_entry
        if let Some(ref prune_filter) = self.dir_prune_filter {
            // Clone the filter reference for use in closure
            // We need to collect because filter_entry requires FnMut but our filter is in &self
            let entries: Vec<WalkEntry> = walker
                .into_iter()
                .filter_entry(|e| {
                    // Filter dot files if dot option is false
                    // Optimization: Use bytes comparison for dot check
                    if !dot {
                        if let Some(name) = e.file_name().to_str() {
                            if e.depth() > 0 && name.starts_with('.') {
                                return false;
                            }
                        }
                    }

                    // Apply directory pruning filter for directories
                    if e.file_type().is_dir() && e.depth() > 0 {
                        // Get the path relative to root
                        if let Ok(rel_path) = e.path().strip_prefix(&root) {
                            let rel_lossy = rel_path.to_string_lossy();
                            let rel_str = normalize_path_str(&rel_lossy);
                            // If the prune filter returns false, skip this directory and its descendants
                            if !prune_filter(&rel_str) {
                                return false;
                            }
                        }
                    }
                    true
                })
                .filter_map(|result| match result {
                    Ok(entry) => Some(create_entry(&entry)),
                    Err(err) => {
                        if let Some(path) = err.path() {
                            if let Ok(meta) = path.symlink_metadata() {
                                if meta.file_type().is_symlink() {
                                    return Some(WalkEntry {
                                        path: path.to_path_buf(),
                                        depth: err.depth(),
                                        is_dir: false,
                                        is_file: false,
                                        is_symlink: true,
                                    });
                                }
                            }
                        }
                        None
                    }
                })
                .collect();

            Box::new(entries.into_iter())
        } else {
            // No pruning filter - use lazy iteration
            Box::new(
                walker
                    .into_iter()
                    .filter_entry(move |e| {
                        // Filter dot files if dot option is false
                        if !dot {
                            if let Some(name) = e.file_name().to_str() {
                                // Allow the root entry to pass through
                                if e.depth() > 0 && name.starts_with('.') {
                                    return false;
                                }
                            }
                        }
                        true
                    })
                    .filter_map(move |result| {
                        match result {
                            Ok(entry) => Some(create_entry(&entry)),
                            Err(err) => {
                                // For broken symlinks (or other IO errors), try to extract the path
                                // and return it as an entry. This handles the case where follow_links
                                // is true but the symlink target doesn't exist.
                                if let Some(path) = err.path() {
                                    // Check if this is a symlink using symlink_metadata
                                    if let Ok(meta) = path.symlink_metadata() {
                                        if meta.file_type().is_symlink() {
                                            return Some(WalkEntry {
                                                path: path.to_path_buf(),
                                                depth: err.depth(),
                                                is_dir: false,
                                                is_file: false,
                                                is_symlink: true,
                                            });
                                        }
                                    }
                                }
                                // For other errors, skip the entry
                                None
                            }
                        }
                    }),
            )
        }
    }

    /// Walk the directory tree synchronously, collecting all entries
    pub fn walk_sync(&self) -> Vec<WalkEntry> {
        self.walk().collect()
    }

    /// Walk the directory tree using parallel (multi-threaded) jwalk.
    /// This mode can be faster on HDDs and network filesystems.
    /// Results may be returned in a different order than serial mode.
    fn walk_parallel(&self) -> Box<dyn Iterator<Item = WalkEntry> + '_> {
        let need_accurate_symlink = self.options.need_accurate_symlink_detection;
        let dot = self.options.dot;
        let root = self.root.clone();

        // Build jwalk walker with parallel traversal
        // Note: jwalk has skip_hidden=true by default, so we must disable it
        // and handle dot filtering ourselves in process_read_dir
        let mut builder = jwalk::WalkDir::new(&self.root)
            .follow_links(self.options.follow_symlinks)
            .skip_hidden(false); // Always read all files, filter manually

        if let Some(max_depth) = self.options.max_depth {
            builder = builder.max_depth(max_depth);
        }

        // Use rayon's default thread pool for parallelism
        builder = builder.parallelism(jwalk::Parallelism::RayonDefaultPool {
            busy_timeout: std::time::Duration::from_secs(1),
        });

        // Since dir_prune_filter is a Box<dyn Fn>, we can't clone it directly.
        // For parallel mode with pruning, we need to collect the patterns and
        // apply filtering in the process_read_dir callback.
        // For now, parallel mode only supports dot filtering via process_read_dir.
        // Pruning support would require restructuring to pass pattern data instead of closure.
        let has_prune_filter = self.dir_prune_filter.is_some();

        // Collect entries from jwalk
        let raw_entries: Vec<_> = builder
            .process_read_dir(move |_remaining_depth, _path, _state, children| {
                // Filter dot files if dot option is false
                if !dot {
                    children.retain(|child_result| {
                        if let Ok(child) = child_result {
                            // Only filter dotfiles at depth > 0 (allow root through)
                            // This matches the behavior of walk_serial which checks e.depth() > 0
                            if child.depth == 0 {
                                return true;
                            }
                            if let Some(name) = child.path().file_name().and_then(|n| n.to_str()) {
                                if name.starts_with('.') {
                                    return false;
                                }
                            }
                        }
                        true
                    });
                }
            })
            .into_iter()
            .filter_map(move |result| match result {
                Ok(entry) => {
                    let file_type = entry.file_type();
                    let path = entry.path();

                    // When following symlinks, we may need accurate symlink detection
                    let is_symlink = if need_accurate_symlink {
                        if file_type.is_symlink() {
                            true
                        } else {
                            path.symlink_metadata()
                                .map(|m| m.file_type().is_symlink())
                                .unwrap_or(false)
                        }
                    } else {
                        file_type.is_symlink()
                    };

                    Some(WalkEntry {
                        path,
                        depth: entry.depth,
                        is_dir: file_type.is_dir(),
                        is_file: file_type.is_file(),
                        is_symlink,
                    })
                }
                Err(err) => {
                    // Handle broken symlinks
                    if let Some(path) = err.path() {
                        if let Ok(meta) = path.symlink_metadata() {
                            if meta.file_type().is_symlink() {
                                return Some(WalkEntry {
                                    path: path.to_path_buf(),
                                    depth: err.depth(),
                                    is_dir: false,
                                    is_file: false,
                                    is_symlink: true,
                                });
                            }
                        }
                    }
                    None
                }
            })
            .collect();

        if has_prune_filter {
            // Apply the prune filter post-traversal
            // This is less efficient but works for parallel mode
            let prune_filter = self.dir_prune_filter.as_ref().unwrap();
            let filtered: Vec<WalkEntry> = raw_entries
                .into_iter()
                .filter(|entry| {
                    if let Ok(rel_path) = entry.path().strip_prefix(&root) {
                        let rel_lossy = rel_path.to_string_lossy();
                        let rel_str = normalize_path_str(&rel_lossy);
                        // Root directory always passes
                        if rel_str.is_empty() {
                            return true;
                        }
                        // For directories, check if they should be included
                        // Note: This doesn't prune children during traversal, but filters results
                        if entry.is_dir() && !prune_filter(&rel_str) {
                            return false;
                        }
                        // For files, check if their parent directory passes the filter
                        if !entry.is_dir() {
                            if let Some(parent) = rel_path.parent() {
                                let parent_lossy = parent.to_string_lossy();
                                let parent_str = normalize_path_str(&parent_lossy);
                                if !parent_str.is_empty() && !prune_filter(&parent_str) {
                                    return false;
                                }
                            }
                        }
                    }
                    true
                })
                .collect();

            Box::new(filtered.into_iter())
        } else {
            Box::new(raw_entries.into_iter())
        }
    }

    /// Walk the directory tree using cached directory reads.
    /// This mode provides significant speedup for repeated glob operations
    /// on the same directories by caching directory listings with TTL-based invalidation.
    fn walk_cached(&self) -> Box<dyn Iterator<Item = WalkEntry> + '_> {
        let need_accurate_symlink = self.options.need_accurate_symlink_detection;
        let dot = self.options.dot;
        let follow_symlinks = self.options.follow_symlinks;
        let max_depth = self.options.max_depth;
        let root = self.root.clone();

        // Collect entries using recursive cached walking
        let mut entries = Vec::new();

        // Add root entry
        if let Ok(meta) = self.root.symlink_metadata() {
            let is_symlink = meta.file_type().is_symlink();
            let (is_dir, is_file) = if is_symlink && follow_symlinks {
                // When following symlinks, get the target type
                match self.root.metadata() {
                    Ok(target_meta) => {
                        let ft = target_meta.file_type();
                        (ft.is_dir(), ft.is_file())
                    }
                    Err(_) => (false, false), // Broken symlink
                }
            } else {
                let ft = meta.file_type();
                (ft.is_dir(), ft.is_file())
            };

            entries.push(WalkEntry {
                path: self.root.clone(),
                depth: 0,
                is_dir,
                is_file,
                is_symlink,
            });

            // If root is a directory, walk its contents
            if is_dir {
                self.walk_cached_recursive(
                    &self.root,
                    1,
                    &root,
                    dot,
                    follow_symlinks,
                    max_depth,
                    need_accurate_symlink,
                    &mut entries,
                );
            }
        }

        // Apply pruning filter if set
        if let Some(ref prune_filter) = self.dir_prune_filter {
            let filtered: Vec<WalkEntry> = entries
                .into_iter()
                .filter(|entry| {
                    if let Ok(rel_path) = entry.path().strip_prefix(&root) {
                        let rel_lossy = rel_path.to_string_lossy();
                        let rel_str = normalize_path_str(&rel_lossy);
                        // Root directory always passes
                        if rel_str.is_empty() {
                            return true;
                        }
                        // For directories, check if they should be included
                        if entry.is_dir() && !prune_filter(&rel_str) {
                            return false;
                        }
                        // For files, check if their parent directory passes the filter
                        if !entry.is_dir() {
                            if let Some(parent) = rel_path.parent() {
                                let parent_lossy = parent.to_string_lossy();
                                let parent_str = normalize_path_str(&parent_lossy);
                                if !parent_str.is_empty() && !prune_filter(&parent_str) {
                                    return false;
                                }
                            }
                        }
                    }
                    true
                })
                .collect();

            Box::new(filtered.into_iter())
        } else {
            Box::new(entries.into_iter())
        }
    }

    /// Recursive helper for cached walking.
    fn walk_cached_recursive(
        &self,
        dir_path: &Path,
        depth: usize,
        root: &Path,
        dot: bool,
        follow_symlinks: bool,
        max_depth: Option<usize>,
        need_accurate_symlink: bool,
        entries: &mut Vec<WalkEntry>,
    ) {
        // Check depth limit
        if let Some(max) = max_depth {
            if depth > max {
                return;
            }
        }

        // Apply pruning filter before reading directory
        if let Some(ref prune_filter) = self.dir_prune_filter {
            if let Ok(rel_path) = dir_path.strip_prefix(root) {
                let rel_lossy = rel_path.to_string_lossy();
                let rel_str = normalize_path_str(&rel_lossy);
                if !rel_str.is_empty() && !prune_filter(&rel_str) {
                    return;
                }
            }
        }

        // Read directory using cache
        let cached_entries = read_dir_cached(dir_path, follow_symlinks);

        for cached_entry in cached_entries {
            // Filter dot files if dot option is false
            if !dot && cached_entry.name.starts_with('.') {
                continue;
            }

            let entry_path = dir_path.join(&cached_entry.name);

            // Determine entry types
            let (is_dir, is_file, is_symlink) = if need_accurate_symlink && follow_symlinks {
                // Need accurate symlink detection: check symlink_metadata
                let is_symlink = entry_path
                    .symlink_metadata()
                    .map(|m| m.file_type().is_symlink())
                    .unwrap_or(false);
                (cached_entry.is_dir, cached_entry.is_file, is_symlink)
            } else {
                (
                    cached_entry.is_dir,
                    cached_entry.is_file,
                    cached_entry.is_symlink,
                )
            };

            entries.push(WalkEntry {
                path: entry_path.clone(),
                depth,
                is_dir,
                is_file,
                is_symlink,
            });

            // Recurse into directories (unless it's a symlink and we're not following)
            if is_dir && (follow_symlinks || !cached_entry.is_symlink) {
                self.walk_cached_recursive(
                    &entry_path,
                    depth + 1,
                    root,
                    dot,
                    follow_symlinks,
                    max_depth,
                    need_accurate_symlink,
                    entries,
                );
            }
        }
    }
}

/// Iterator adapter that allows filtering with closures
pub struct FilteredWalker<F> {
    inner: Walker,
    filter: F,
}

impl<F> FilteredWalker<F>
where
    F: Fn(&WalkEntry) -> bool,
{
    pub fn new(walker: Walker, filter: F) -> Self {
        Self {
            inner: walker,
            filter,
        }
    }

    /// Walk and collect all entries that pass the filter
    pub fn walk(self) -> Vec<WalkEntry> {
        self.inner.walk().filter(|e| (self.filter)(e)).collect()
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

        // Regular files at root
        File::create(base.join("foo.txt")).unwrap();
        File::create(base.join("bar.txt")).unwrap();
        File::create(base.join("baz.js")).unwrap();

        // Dotfile at root
        File::create(base.join(".hidden")).unwrap();

        // Subdirectory with files
        fs::create_dir_all(base.join("src")).unwrap();
        File::create(base.join("src/main.js")).unwrap();
        File::create(base.join("src/util.js")).unwrap();

        // Hidden directory
        fs::create_dir_all(base.join(".git")).unwrap();
        File::create(base.join(".git/config")).unwrap();

        // Nested subdirectory
        fs::create_dir_all(base.join("src/lib")).unwrap();
        File::create(base.join("src/lib/helper.js")).unwrap();

        // Deep nesting
        fs::create_dir_all(base.join("a/b/c")).unwrap();
        File::create(base.join("a/b/c/deep.txt")).unwrap();

        temp
    }

    #[test]
    fn test_walker_basic() {
        let temp = create_test_fixture();
        let walker = Walker::with_root(temp.path().to_path_buf());
        let entries: Vec<_> = walker.walk_sync();

        // Should include root directory
        assert!(entries.iter().any(|e| e.path() == temp.path()));

        // Should include files (dot=false by default, so no .hidden)
        assert!(entries.iter().any(|e| e.path().ends_with("foo.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("bar.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("baz.js")));

        // Should NOT include dotfiles by default
        assert!(!entries.iter().any(|e| e.path().ends_with(".hidden")));
        assert!(!entries.iter().any(|e| e.path().ends_with(".git")));
    }

    #[test]
    fn test_walker_with_dot() {
        let temp = create_test_fixture();
        let walker = Walker::new(temp.path().to_path_buf(), WalkOptions::new().dot(true));
        let entries: Vec<_> = walker.walk_sync();

        // Should include dotfiles
        assert!(entries.iter().any(|e| e.path().ends_with(".hidden")));
        assert!(entries.iter().any(|e| e.path().ends_with(".git")));
        assert!(entries.iter().any(|e| e.path().ends_with(".git/config")));
    }

    #[test]
    fn test_walker_max_depth_0() {
        let temp = create_test_fixture();
        let walker = Walker::new(
            temp.path().to_path_buf(),
            WalkOptions::new().max_depth(Some(0)),
        );
        let entries: Vec<_> = walker.walk_sync();

        // max_depth: 0 means only root
        assert_eq!(entries.len(), 1);
        assert!(entries[0].path() == temp.path());
    }

    #[test]
    fn test_walker_max_depth_1() {
        let temp = create_test_fixture();
        let walker = Walker::new(
            temp.path().to_path_buf(),
            WalkOptions::new().max_depth(Some(1)),
        );
        let entries: Vec<_> = walker.walk_sync();

        // Should include root and immediate children only
        // root, foo.txt, bar.txt, baz.js, src, a
        // (no .hidden, .git because dot=false)
        assert!(entries.iter().all(|e| e.depth() <= 1));
        assert!(entries.iter().any(|e| e.path().ends_with("foo.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("src")));

        // Should NOT include deeper files
        assert!(!entries.iter().any(|e| e.path().ends_with("main.js")));
        assert!(!entries.iter().any(|e| e.path().ends_with("deep.txt")));
    }

    #[test]
    fn test_walker_max_depth_2() {
        let temp = create_test_fixture();
        let walker = Walker::new(
            temp.path().to_path_buf(),
            WalkOptions::new().max_depth(Some(2)),
        );
        let entries: Vec<_> = walker.walk_sync();

        // Should include up to depth 2
        assert!(entries.iter().all(|e| e.depth() <= 2));
        assert!(entries.iter().any(|e| e.path().ends_with("main.js"))); // depth 2
        assert!(entries.iter().any(|e| e.path().ends_with("src/lib"))); // depth 2

        // Should NOT include depth 3+
        assert!(!entries.iter().any(|e| e.path().ends_with("helper.js"))); // depth 3
        assert!(!entries.iter().any(|e| e.path().ends_with("deep.txt"))); // depth 4
    }

    #[test]
    fn test_walk_entry_properties() {
        let temp = create_test_fixture();
        let walker = Walker::with_root(temp.path().to_path_buf());
        let entries: Vec<_> = walker.walk_sync();

        // Check is_dir
        let src_entry = entries.iter().find(|e| e.path().ends_with("src")).unwrap();
        assert!(src_entry.is_dir());
        assert!(!src_entry.is_file());

        // Check is_file
        let foo_entry = entries
            .iter()
            .find(|e| e.path().ends_with("foo.txt"))
            .unwrap();
        assert!(foo_entry.is_file());
        assert!(!foo_entry.is_dir());
    }

    #[test]
    fn test_walker_chain_options() {
        // Test builder pattern
        let options = WalkOptions::new()
            .follow_symlinks(true)
            .max_depth(Some(3))
            .dot(true);

        assert!(options.follow_symlinks);
        assert_eq!(options.max_depth, Some(3));
        assert!(options.dot);
    }

    #[test]
    fn test_filtered_walker() {
        let temp = create_test_fixture();
        let walker = Walker::with_root(temp.path().to_path_buf());

        // Filter to only .js files
        let filtered = FilteredWalker::new(walker, |e| {
            e.path().extension().map(|ext| ext == "js").unwrap_or(false)
        });

        let entries = filtered.walk();

        // Should only have .js files
        assert!(entries.iter().all(|e| e
            .path()
            .extension()
            .map(|ext| ext == "js")
            .unwrap_or(false)));
        assert!(entries.iter().any(|e| e.path().ends_with("baz.js")));
        assert!(entries.iter().any(|e| e.path().ends_with("main.js")));
        assert!(!entries.iter().any(|e| e.path().ends_with("foo.txt")));
    }

    #[cfg(unix)]
    #[test]
    fn test_walker_symlinks() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create a real file
        File::create(base.join("real.txt")).unwrap();

        // Create a symlink
        symlink(base.join("real.txt"), base.join("link.txt")).unwrap();

        // Walk without following symlinks
        let walker = Walker::new(
            base.to_path_buf(),
            WalkOptions::new().follow_symlinks(false),
        );
        let entries: Vec<_> = walker.walk_sync();

        let link_entry = entries
            .iter()
            .find(|e| e.path().ends_with("link.txt"))
            .unwrap();
        assert!(link_entry.is_symlink());

        // Walk with following symlinks
        let walker = Walker::new(base.to_path_buf(), WalkOptions::new().follow_symlinks(true));
        let entries: Vec<_> = walker.walk_sync();

        let link_entry = entries
            .iter()
            .find(|e| e.path().ends_with("link.txt"))
            .unwrap();
        // When following symlinks, it reports as the target type
        assert!(link_entry.is_file());
    }

    #[cfg(unix)]
    #[test]
    fn test_walker_cyclic_symlink_self_reference() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create structure:
        // dir/
        //   file.txt
        //   self -> . (symlink to itself)
        fs::create_dir_all(base.join("dir")).unwrap();
        File::create(base.join("dir/file.txt")).unwrap();
        symlink(".", base.join("dir/self")).unwrap();

        // Walk with follow_symlinks=true - should NOT infinite loop
        let walker = Walker::new(base.to_path_buf(), WalkOptions::new().follow_symlinks(true));
        let entries: Vec<_> = walker.walk_sync();

        // Should complete with finite results
        assert!(entries.len() < 100);
        assert!(entries.len() >= 2); // At least root and file.txt

        // Should find the file
        assert!(entries.iter().any(|e| e.path().ends_with("file.txt")));
    }

    #[cfg(unix)]
    #[test]
    fn test_walker_cyclic_symlink_parent_reference() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create structure:
        // root.txt
        // child/
        //   child.txt
        //   back -> .. (symlink to parent)
        File::create(base.join("root.txt")).unwrap();
        fs::create_dir_all(base.join("child")).unwrap();
        File::create(base.join("child/child.txt")).unwrap();
        symlink("..", base.join("child/back")).unwrap();

        // Walk with follow_symlinks=true - should NOT infinite loop
        let walker = Walker::new(base.to_path_buf(), WalkOptions::new().follow_symlinks(true));
        let entries: Vec<_> = walker.walk_sync();

        // Should complete with finite results
        assert!(entries.len() < 100);

        // Should find files
        assert!(entries.iter().any(|e| e.path().ends_with("root.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("child.txt")));
    }

    #[cfg(unix)]
    #[test]
    fn test_walker_cyclic_symlink_mutual_reference() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create structure:
        // a/
        //   a.txt
        //   to-b -> ../b
        // b/
        //   b.txt
        //   to-a -> ../a
        fs::create_dir_all(base.join("a")).unwrap();
        fs::create_dir_all(base.join("b")).unwrap();
        File::create(base.join("a/a.txt")).unwrap();
        File::create(base.join("b/b.txt")).unwrap();
        symlink("../b", base.join("a/to-b")).unwrap();
        symlink("../a", base.join("b/to-a")).unwrap();

        // Walk with follow_symlinks=true - should NOT infinite loop
        let walker = Walker::new(base.to_path_buf(), WalkOptions::new().follow_symlinks(true));
        let entries: Vec<_> = walker.walk_sync();

        // Should complete with finite results
        assert!(entries.len() < 100);

        // Should find files
        assert!(entries.iter().any(|e| e.path().ends_with("a.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("b.txt")));
    }

    #[cfg(unix)]
    #[test]
    fn test_walker_cyclic_symlink_without_follow() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create structure with cycle
        fs::create_dir_all(base.join("dir")).unwrap();
        File::create(base.join("dir/file.txt")).unwrap();
        symlink(".", base.join("dir/self")).unwrap();

        // Walk without following - symlink should be listed but not traversed
        let walker = Walker::new(
            base.to_path_buf(),
            WalkOptions::new().follow_symlinks(false),
        );
        let entries: Vec<_> = walker.walk_sync();

        // Should find the symlink entry
        assert!(entries
            .iter()
            .any(|e| { e.path().ends_with("self") && e.is_symlink() }));

        // Should NOT have any deeply nested paths through the cycle
        let deep_paths: Vec<_> = entries
            .iter()
            .filter(|e| e.path().to_string_lossy().contains("self/self"))
            .collect();
        assert!(deep_paths.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn test_walker_symlink_dir_with_follow() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create a real directory with a file
        fs::create_dir_all(base.join("real-dir")).unwrap();
        File::create(base.join("real-dir/file.txt")).unwrap();

        // Create a symlink to the directory
        symlink(base.join("real-dir"), base.join("symlink-to-dir")).unwrap();

        // Walk WITH following symlinks AND accurate symlink detection enabled
        // (This is needed to correctly detect symlinks when following them)
        let walker = Walker::new(
            base.to_path_buf(),
            WalkOptions::new()
                .follow_symlinks(true)
                .need_accurate_symlink_detection(true),
        );
        let entries: Vec<_> = walker.walk_sync();

        // Find the symlink entry
        let symlink_entry = entries
            .iter()
            .find(|e| e.path().ends_with("symlink-to-dir"))
            .expect("Should find symlink-to-dir");

        // When following symlinks, walkdir reports the TARGET type for is_dir/is_file,
        // but we use symlink_metadata to still detect that it IS a symlink.
        println!(
            "symlink_entry: is_dir={}, is_file={}, is_symlink={}",
            symlink_entry.is_dir(),
            symlink_entry.is_file(),
            symlink_entry.is_symlink()
        );

        // is_dir=true because we follow the link and see a directory
        assert!(symlink_entry.is_dir());
        assert!(!symlink_entry.is_file());
        // is_symlink=true because we check symlink_metadata regardless of follow setting
        // This is needed for correct `mark` option behavior
        assert!(symlink_entry.is_symlink());
    }

    #[cfg(unix)]
    #[test]
    fn test_walker_permission_denied_skips_directory() {
        use std::os::unix::fs::PermissionsExt;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create structure:
        // readable/
        //   file.txt
        // unreadable/
        //   secret.txt
        fs::create_dir_all(base.join("readable")).unwrap();
        File::create(base.join("readable/file.txt")).unwrap();
        fs::create_dir_all(base.join("unreadable")).unwrap();
        File::create(base.join("unreadable/secret.txt")).unwrap();

        // Remove permissions from unreadable directory
        let unreadable_path = base.join("unreadable");
        fs::set_permissions(&unreadable_path, fs::Permissions::from_mode(0o000)).unwrap();

        // Walker should not crash and should find readable files
        let walker = Walker::new(base.to_path_buf(), WalkOptions::new().dot(true));
        let entries: Vec<_> = walker.walk_sync();

        // Restore permissions for cleanup
        fs::set_permissions(&unreadable_path, fs::Permissions::from_mode(0o755)).unwrap();

        // Should find readable file
        assert!(entries.iter().any(|e| e.path().ends_with("file.txt")));
        // Should NOT find file in unreadable directory
        assert!(!entries.iter().any(|e| e.path().ends_with("secret.txt")));
        // Should not have crashed (test would fail if it did)
    }

    #[cfg(unix)]
    #[test]
    fn test_walker_permission_denied_continues_walking() {
        use std::os::unix::fs::PermissionsExt;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create structure:
        // a/
        //   a.txt
        // b/ (unreadable)
        //   b.txt
        // c/
        //   c.txt
        fs::create_dir_all(base.join("a")).unwrap();
        File::create(base.join("a/a.txt")).unwrap();
        fs::create_dir_all(base.join("b")).unwrap();
        File::create(base.join("b/b.txt")).unwrap();
        fs::create_dir_all(base.join("c")).unwrap();
        File::create(base.join("c/c.txt")).unwrap();

        // Remove permissions from b/
        let b_path = base.join("b");
        fs::set_permissions(&b_path, fs::Permissions::from_mode(0o000)).unwrap();

        // Walker should continue after permission error
        let walker = Walker::new(base.to_path_buf(), WalkOptions::new().dot(true));
        let entries: Vec<_> = walker.walk_sync();

        // Restore permissions for cleanup
        fs::set_permissions(&b_path, fs::Permissions::from_mode(0o755)).unwrap();

        // Should find files in a/ and c/
        assert!(entries.iter().any(|e| e.path().ends_with("a.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("c.txt")));
        // Should NOT find file in b/ (no permission)
        assert!(!entries.iter().any(|e| e.path().ends_with("b.txt")));
    }

    #[cfg(unix)]
    #[test]
    fn test_walker_deeply_nested_permission_denied() {
        use std::os::unix::fs::PermissionsExt;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create structure:
        // level1/
        //   level2/
        //     level3/ (unreadable)
        //       secret.txt
        //     visible.txt
        fs::create_dir_all(base.join("level1/level2/level3")).unwrap();
        File::create(base.join("level1/level2/level3/secret.txt")).unwrap();
        File::create(base.join("level1/level2/visible.txt")).unwrap();

        // Remove permissions from level3/
        let level3_path = base.join("level1/level2/level3");
        fs::set_permissions(&level3_path, fs::Permissions::from_mode(0o000)).unwrap();

        // Walker should find visible.txt but not secret.txt
        let walker = Walker::new(base.to_path_buf(), WalkOptions::new().dot(true));
        let entries: Vec<_> = walker.walk_sync();

        // Restore permissions for cleanup
        fs::set_permissions(&level3_path, fs::Permissions::from_mode(0o755)).unwrap();

        // Should find visible file
        assert!(entries.iter().any(|e| e.path().ends_with("visible.txt")));
        // Should NOT find file in unreadable directory
        assert!(!entries.iter().any(|e| e.path().ends_with("secret.txt")));
    }

    #[cfg(unix)]
    #[test]
    fn test_walker_multiple_permission_denied() {
        use std::os::unix::fs::PermissionsExt;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create multiple directories, some unreadable
        fs::create_dir_all(base.join("ok1")).unwrap();
        File::create(base.join("ok1/file.txt")).unwrap();
        fs::create_dir_all(base.join("bad1")).unwrap();
        File::create(base.join("bad1/secret.txt")).unwrap();
        fs::create_dir_all(base.join("ok2")).unwrap();
        File::create(base.join("ok2/file.txt")).unwrap();
        fs::create_dir_all(base.join("bad2")).unwrap();
        File::create(base.join("bad2/secret.txt")).unwrap();

        // Remove permissions from bad1/ and bad2/
        let bad1_path = base.join("bad1");
        let bad2_path = base.join("bad2");
        fs::set_permissions(&bad1_path, fs::Permissions::from_mode(0o000)).unwrap();
        fs::set_permissions(&bad2_path, fs::Permissions::from_mode(0o000)).unwrap();

        // Walker should find all accessible files
        let walker = Walker::new(base.to_path_buf(), WalkOptions::new().dot(true));
        let entries: Vec<_> = walker.walk_sync();

        // Restore permissions for cleanup
        fs::set_permissions(&bad1_path, fs::Permissions::from_mode(0o755)).unwrap();
        fs::set_permissions(&bad2_path, fs::Permissions::from_mode(0o755)).unwrap();

        // Should find files in ok1/ and ok2/
        let files: Vec<_> = entries
            .iter()
            .filter(|e| e.path().ends_with("file.txt"))
            .collect();
        assert_eq!(files.len(), 2);

        // Should NOT find files in bad1/ or bad2/
        let secrets: Vec<_> = entries
            .iter()
            .filter(|e| e.path().ends_with("secret.txt"))
            .collect();
        assert!(secrets.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn test_walker_broken_symlink_returns_entry() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create a broken symlink (target doesn't exist)
        symlink("nonexistent-target", base.join("broken-link")).unwrap();
        File::create(base.join("real-file.txt")).unwrap();

        // Walk without following symlinks - should find both entries
        let walker = Walker::new(
            base.to_path_buf(),
            WalkOptions::new().follow_symlinks(false),
        );
        let entries: Vec<_> = walker.walk_sync();

        // Should find real file
        assert!(entries.iter().any(|e| e.path().ends_with("real-file.txt")));
        // Should find broken symlink as well
        assert!(entries
            .iter()
            .any(|e| e.path().ends_with("broken-link") && e.is_symlink()));
    }

    #[cfg(unix)]
    #[test]
    fn test_walker_broken_symlink_with_follow() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create a broken symlink
        symlink("nonexistent-target", base.join("broken-link")).unwrap();
        File::create(base.join("real-file.txt")).unwrap();

        // Walk WITH following symlinks - broken symlink should still be returned
        let walker = Walker::new(base.to_path_buf(), WalkOptions::new().follow_symlinks(true));
        let entries: Vec<_> = walker.walk_sync();

        // Should find real file
        assert!(entries.iter().any(|e| e.path().ends_with("real-file.txt")));
        // Should find broken symlink (returned as symlink entry)
        let broken = entries.iter().find(|e| e.path().ends_with("broken-link"));
        assert!(broken.is_some(), "Broken symlink should be returned");
        assert!(broken.unwrap().is_symlink());
    }

    #[cfg(unix)]
    #[test]
    fn test_walker_symlink_target_deleted_after_creation() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create a real file and symlink to it
        let target = base.join("target.txt");
        File::create(&target).unwrap();
        symlink(&target, base.join("link.txt")).unwrap();

        // Create another file so we have something to find
        File::create(base.join("other.txt")).unwrap();

        // Delete the target, making the symlink broken
        fs::remove_file(&target).unwrap();

        // Walker should not crash and should return the broken symlink
        let walker = Walker::new(base.to_path_buf(), WalkOptions::new().follow_symlinks(true));
        let entries: Vec<_> = walker.walk_sync();

        // Should not have crashed
        assert!(entries.len() >= 2); // At least root and other.txt

        // Should find other.txt
        assert!(entries.iter().any(|e| e.path().ends_with("other.txt")));

        // Should find the broken symlink
        let link = entries.iter().find(|e| e.path().ends_with("link.txt"));
        assert!(link.is_some(), "Broken symlink should be in results");
    }

    #[test]
    fn test_walker_nonexistent_root() {
        let nonexistent = PathBuf::from("/definitely/does/not/exist/path");

        // Walker on nonexistent path should return empty, not crash
        let walker = Walker::new(nonexistent, WalkOptions::new());
        let entries: Vec<_> = walker.walk_sync();

        // Should return empty results or just a single entry with error
        // The important thing is it doesn't crash
        assert!(entries.len() <= 1);
    }

    #[test]
    fn test_walker_empty_directory() {
        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Don't create any files - empty directory
        let walker = Walker::new(base.to_path_buf(), WalkOptions::new());
        let entries: Vec<_> = walker.walk_sync();

        // Should have only the root entry
        assert_eq!(entries.len(), 1);
        assert!(entries[0].is_dir());
    }

    #[test]
    fn test_walker_special_characters_in_path() {
        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create files with special characters
        File::create(base.join("file with spaces.txt")).unwrap();
        File::create(base.join("file-with-dashes.txt")).unwrap();
        File::create(base.join("file_with_underscores.txt")).unwrap();
        File::create(base.join("file.multiple.dots.txt")).unwrap();

        let walker = Walker::new(base.to_path_buf(), WalkOptions::new());
        let entries: Vec<_> = walker.walk_sync();

        // Should find all files
        assert!(entries
            .iter()
            .any(|e| e.path().ends_with("file with spaces.txt")));
        assert!(entries
            .iter()
            .any(|e| e.path().ends_with("file-with-dashes.txt")));
        assert!(entries
            .iter()
            .any(|e| e.path().ends_with("file_with_underscores.txt")));
        assert!(entries
            .iter()
            .any(|e| e.path().ends_with("file.multiple.dots.txt")));
    }

    #[test]
    fn test_walker_unicode_filenames() {
        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create files with unicode names (these should work on most filesystems)
        let unicode_names = ["файл.txt", "ファイル.txt", "αρχείο.txt"];

        for name in unicode_names {
            if File::create(base.join(name)).is_err() {
                // Skip if filesystem doesn't support this filename
                continue;
            }
        }

        let walker = Walker::new(base.to_path_buf(), WalkOptions::new());
        let entries: Vec<_> = walker.walk_sync();

        // Should not crash regardless of what was created
        assert!(!entries.is_empty());
    }

    // Parallel walking tests

    #[test]
    fn test_walker_parallel_basic() {
        let temp = create_test_fixture();
        let walker = Walker::new(temp.path().to_path_buf(), WalkOptions::new().parallel(true));
        let entries: Vec<_> = walker.walk_sync();

        // Should find all files (same as serial)
        assert!(entries.iter().any(|e| e.path().ends_with("foo.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("bar.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("baz.js")));
        assert!(entries.iter().any(|e| e.path().ends_with("src/main.js")));
        assert!(entries
            .iter()
            .any(|e| e.path().ends_with("src/lib/helper.js")));
    }

    #[test]
    fn test_walker_parallel_with_dot() {
        let temp = create_test_fixture();
        let walker = Walker::new(
            temp.path().to_path_buf(),
            WalkOptions::new().parallel(true).dot(true),
        );
        let entries: Vec<_> = walker.walk_sync();

        // Should include dotfiles with parallel mode
        assert!(entries.iter().any(|e| e.path().ends_with(".hidden")));
        assert!(entries.iter().any(|e| e.path().ends_with(".git")));
    }

    #[test]
    fn test_walker_parallel_without_dot() {
        let temp = create_test_fixture();
        let walker = Walker::new(
            temp.path().to_path_buf(),
            WalkOptions::new().parallel(true).dot(false),
        );
        let entries: Vec<_> = walker.walk_sync();

        // Should NOT include dotfiles
        assert!(!entries.iter().any(|e| e.path().ends_with(".hidden")));
        assert!(!entries.iter().any(|e| e.path().ends_with(".git")));

        // Should include regular files
        assert!(entries.iter().any(|e| e.path().ends_with("foo.txt")));
    }

    #[test]
    fn test_walker_parallel_max_depth() {
        let temp = create_test_fixture();
        let walker = Walker::new(
            temp.path().to_path_buf(),
            WalkOptions::new().parallel(true).max_depth(Some(1)),
        );
        let entries: Vec<_> = walker.walk_sync();

        // Should include root-level items
        assert!(entries.iter().any(|e| e.path().ends_with("foo.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("src")));

        // Should NOT include nested items
        assert!(!entries.iter().any(|e| e.path().ends_with("main.js")));
    }

    #[test]
    fn test_walker_parallel_matches_serial_results() {
        let temp = create_test_fixture();

        // Run serial walk
        let serial_walker = Walker::new(
            temp.path().to_path_buf(),
            WalkOptions::new().parallel(false),
        );
        let serial_entries: std::collections::HashSet<_> = serial_walker
            .walk_sync()
            .into_iter()
            .map(|e| e.path().to_path_buf())
            .collect();

        // Run parallel walk
        let parallel_walker =
            Walker::new(temp.path().to_path_buf(), WalkOptions::new().parallel(true));
        let parallel_entries: std::collections::HashSet<_> = parallel_walker
            .walk_sync()
            .into_iter()
            .map(|e| e.path().to_path_buf())
            .collect();

        // Results should match (same files found, order may differ)
        assert_eq!(
            serial_entries, parallel_entries,
            "Parallel and serial should find the same files"
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_walker_parallel_with_symlinks() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create structure with symlink
        fs::create_dir_all(base.join("real")).unwrap();
        File::create(base.join("real/file.txt")).unwrap();
        symlink(base.join("real"), base.join("link")).unwrap();

        // Walk with follow_symlinks=true
        let walker = Walker::new(
            base.to_path_buf(),
            WalkOptions::new().parallel(true).follow_symlinks(true),
        );
        let entries: Vec<_> = walker.walk_sync();

        // Should find file through both paths
        assert!(entries.iter().any(|e| e.path().ends_with("real/file.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("link/file.txt")));
    }
}
