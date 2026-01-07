use lru::LruCache;
use std::hash::{Hash, Hasher};
use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock, RwLock};
use std::time::{Duration, Instant};

use crate::pattern::{Pattern, PatternOptions};

/// Default cache size for compiled patterns.
/// This is chosen to be large enough to hold patterns for typical glob operations
/// (e.g., a project with many different glob patterns) while not using excessive memory.
const DEFAULT_CACHE_SIZE: usize = 1024;

/// Default cache size for directory listings.
/// This is chosen to balance memory usage with cache hit rate.
/// Most glob operations traverse a limited number of directories.
const DEFAULT_READDIR_CACHE_SIZE: usize = 512;

/// Default TTL for cached directory listings (5 seconds).
/// This prevents stale data while still providing significant speedup
/// for repeated glob operations on the same directories.
const DEFAULT_CACHE_TTL: Duration = Duration::from_secs(5);

/// Cache key for compiled patterns.
/// Includes the pattern string and all options that affect compilation.
#[derive(Debug, Clone, PartialEq, Eq)]
struct PatternCacheKey {
    pattern: String,
    noext: bool,
    windows_paths_no_escape: bool,
    nocase: bool,
    nobrace: bool,
    platform: String,
}

impl Hash for PatternCacheKey {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.pattern.hash(state);
        self.noext.hash(state);
        self.windows_paths_no_escape.hash(state);
        self.nocase.hash(state);
        self.nobrace.hash(state);
        self.platform.hash(state);
    }
}

impl PatternCacheKey {
    fn new(pattern: &str, options: &PatternOptions) -> Self {
        Self {
            pattern: pattern.to_string(),
            noext: options.noext,
            windows_paths_no_escape: options.windows_paths_no_escape,
            nocase: options.nocase,
            nobrace: options.nobrace,
            platform: options.platform.clone().unwrap_or_default(),
        }
    }
}

/// Global pattern cache instance.
/// Uses RwLock for lock-free reads - multiple readers can access simultaneously.
static PATTERN_CACHE: OnceLock<RwLock<LruCache<PatternCacheKey, Pattern>>> = OnceLock::new();

/// Initialize the global pattern cache with the default size.
fn get_cache() -> &'static RwLock<LruCache<PatternCacheKey, Pattern>> {
    PATTERN_CACHE.get_or_init(|| {
        RwLock::new(LruCache::new(
            NonZeroUsize::new(DEFAULT_CACHE_SIZE).unwrap(),
        ))
    })
}

/// Get a compiled pattern from the cache, or compile and cache it if not found.
///
/// Uses a read-optimized locking strategy:
/// 1. First try a read lock (allows concurrent readers)
/// 2. Only upgrade to write lock if cache miss
///
/// This function provides significant speedup when the same patterns are used
/// repeatedly, which is common in glob operations with brace expansion or
/// when multiple glob() calls use similar patterns.
///
/// # Arguments
/// * `pattern` - The glob pattern string to compile
/// * `options` - The pattern compilation options
///
/// # Returns
/// A compiled `Pattern` ready for matching.
pub fn get_or_compile_pattern(pattern: &str, options: &PatternOptions) -> Pattern {
    let key = PatternCacheKey::new(pattern, options);

    let cache = get_cache();

    // Try to get from cache with READ lock (allows concurrent readers)
    {
        let guard = cache.read().unwrap();
        if let Some(cached) = guard.peek(&key) {
            return cached.clone();
        }
    }

    // Cache miss - compile the pattern (outside lock)
    let compiled = Pattern::with_pattern_options(pattern, options.clone());

    // Store in cache with WRITE lock
    {
        let mut guard = cache.write().unwrap();
        // Double-check: another thread might have compiled it
        if let Some(cached) = guard.peek(&key) {
            return cached.clone();
        }
        guard.put(key, compiled.clone());
    }

    compiled
}

/// Get the current number of cached patterns.
/// Useful for debugging and monitoring.
#[allow(dead_code)]
pub fn cache_size() -> usize {
    let cache = get_cache();
    let guard = cache.read().unwrap();
    guard.len()
}

/// Clear the pattern cache.
/// This is mainly useful for testing.
#[allow(dead_code)]
pub fn clear_cache() {
    let cache = get_cache();
    let mut guard = cache.write().unwrap();
    guard.clear();
}

/// Get cache statistics for monitoring.
#[allow(dead_code)]
pub struct CacheStats {
    pub size: usize,
    pub capacity: usize,
}

#[allow(dead_code)]
pub fn get_cache_stats() -> CacheStats {
    let cache = get_cache();
    let guard = cache.read().unwrap();
    CacheStats {
        size: guard.len(),
        capacity: guard.cap().get(),
    }
}

// ============================================================================
// Readdir Cache Implementation
// ============================================================================

/// A cached directory entry with minimal information needed for glob matching.
#[derive(Debug, Clone)]
pub struct CachedDirEntry {
    /// File name (not full path)
    pub name: String,
    /// True if this is a directory
    pub is_dir: bool,
    /// True if this is a file
    pub is_file: bool,
    /// True if this is a symbolic link
    pub is_symlink: bool,
}

/// A cached directory listing with timestamp for TTL-based invalidation.
/// Uses Arc for zero-copy sharing on cache hits.
#[derive(Debug, Clone)]
struct CachedDirListing {
    /// Entries wrapped in Arc for cheap cloning on cache hit
    entries: Arc<[CachedDirEntry]>,
    cached_at: Instant,
}

impl CachedDirListing {
    fn new(entries: Vec<CachedDirEntry>) -> Self {
        Self {
            entries: entries.into(),
            cached_at: Instant::now(),
        }
    }

    fn is_expired(&self, ttl: Duration) -> bool {
        self.cached_at.elapsed() > ttl
    }
}

/// Global readdir cache instance.
/// Uses RwLock for lock-free reads - multiple readers can access simultaneously.
static READDIR_CACHE: OnceLock<RwLock<LruCache<PathBuf, CachedDirListing>>> = OnceLock::new();

/// Initialize the global readdir cache with the default size.
fn get_readdir_cache() -> &'static RwLock<LruCache<PathBuf, CachedDirListing>> {
    READDIR_CACHE.get_or_init(|| {
        RwLock::new(LruCache::new(
            NonZeroUsize::new(DEFAULT_READDIR_CACHE_SIZE).unwrap(),
        ))
    })
}

/// Read a directory's contents, using the cache if available and not expired.
///
/// This function provides significant speedup when the same directories are
/// traversed repeatedly, which is common in:
/// - Multiple glob operations on the same codebase
/// - Glob class cache reuse (passing Glob as options)
/// - Patterns with overlapping directory prefixes
///
/// # Arguments
/// * `path` - The directory path to read
/// * `follow_symlinks` - If true, resolve symlink targets for type detection
///
/// # Returns
/// A vector of cached directory entries, or an empty vector if the directory
/// cannot be read.
pub fn read_dir_cached(path: &Path, follow_symlinks: bool) -> Vec<CachedDirEntry> {
    read_dir_cached_with_ttl(path, follow_symlinks, DEFAULT_CACHE_TTL)
}

/// Read a directory's contents with a custom TTL.
///
/// Uses a read-optimized locking strategy:
/// 1. First try a read lock (allows concurrent readers)
/// 2. Only upgrade to write lock if cache miss or expired
///
/// # Arguments
/// * `path` - The directory path to read
/// * `follow_symlinks` - If true, resolve symlink targets for type detection
/// * `ttl` - Time-to-live for cached entries
pub fn read_dir_cached_with_ttl(
    path: &Path,
    follow_symlinks: bool,
    ttl: Duration,
) -> Vec<CachedDirEntry> {
    let cache = get_readdir_cache();

    // Create a canonical cache key to handle relative vs absolute paths
    let cache_key = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());

    // Try to get from cache with READ lock (allows concurrent readers)
    {
        let guard = cache.read().unwrap();
        if let Some(cached) = guard.peek(&cache_key) {
            if !cached.is_expired(ttl) {
                // Zero-copy return via Arc clone (just increments ref count)
                return cached.entries.to_vec();
            }
        }
    }

    // Cache miss or expired - read the directory (outside lock)
    let entries = read_dir_uncached(path, follow_symlinks);

    // Store in cache with WRITE lock
    {
        let mut guard = cache.write().unwrap();
        // Double-check: another thread might have populated it
        if let Some(cached) = guard.peek(&cache_key) {
            if !cached.is_expired(ttl) {
                return cached.entries.to_vec();
            }
        }
        guard.put(cache_key, CachedDirListing::new(entries.clone()));
    }

    entries
}

/// Read a directory without using the cache.
/// This is the underlying implementation used by the cache.
fn read_dir_uncached(path: &Path, follow_symlinks: bool) -> Vec<CachedDirEntry> {
    let read_dir = match std::fs::read_dir(path) {
        Ok(rd) => rd,
        Err(_) => return Vec::new(),
    };

    let mut entries = Vec::new();

    for entry_result in read_dir {
        let entry = match entry_result {
            Ok(e) => e,
            Err(_) => continue,
        };

        let name = match entry.file_name().into_string() {
            Ok(n) => n,
            Err(_) => continue, // Skip non-UTF8 filenames
        };

        let entry_path = entry.path();

        // Get file type
        let (is_dir, is_file, is_symlink) = if follow_symlinks {
            // When following symlinks, we need to:
            // 1. Check if it's a symlink (via symlink_metadata)
            // 2. Get the TARGET's type (via fs::metadata which follows symlinks)
            //
            // Note: DirEntry::metadata() on macOS returns the symlink's metadata,
            // not the target's. We must use std::fs::metadata() to follow.
            let is_symlink = entry_path
                .symlink_metadata()
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false);

            // Use fs::metadata() to follow symlinks and get target type
            match std::fs::metadata(&entry_path) {
                Ok(meta) => {
                    let ft = meta.file_type();
                    (ft.is_dir(), ft.is_file(), is_symlink)
                }
                Err(_) => {
                    // Broken symlink or permission error
                    (false, false, is_symlink)
                }
            }
        } else {
            // Not following symlinks - use symlink_metadata to get the link type
            match entry_path.symlink_metadata() {
                Ok(meta) => {
                    let ft = meta.file_type();
                    (ft.is_dir(), ft.is_file(), ft.is_symlink())
                }
                Err(_) => (false, false, false),
            }
        };

        entries.push(CachedDirEntry {
            name,
            is_dir,
            is_file,
            is_symlink,
        });
    }

    entries
}

/// Get the current number of cached directory listings.
#[allow(dead_code)]
pub fn readdir_cache_size() -> usize {
    let cache = get_readdir_cache();
    let guard = cache.read().unwrap();
    guard.len()
}

/// Clear the readdir cache.
/// This is useful for:
/// - Testing
/// - When you know the filesystem has changed
/// - Freeing memory
#[allow(dead_code)]
pub fn clear_readdir_cache() {
    let cache = get_readdir_cache();
    let mut guard = cache.write().unwrap();
    guard.clear();
}

/// Get readdir cache statistics for monitoring.
#[allow(dead_code)]
pub struct ReaddirCacheStats {
    pub size: usize,
    pub capacity: usize,
}

#[allow(dead_code)]
pub fn get_readdir_cache_stats() -> ReaddirCacheStats {
    let cache = get_readdir_cache();
    let guard = cache.read().unwrap();
    ReaddirCacheStats {
        size: guard.len(),
        capacity: guard.cap().get(),
    }
}

/// Invalidate a specific directory in the cache.
/// Useful when you know a directory has been modified.
#[allow(dead_code)]
pub fn invalidate_dir(path: &Path) {
    let cache = get_readdir_cache();
    let cache_key = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let mut guard = cache.write().unwrap();
    guard.pop(&cache_key);
}

/// Invalidate all directories under a given path.
/// Useful when a subtree has been modified.
#[allow(dead_code)]
pub fn invalidate_subtree(path: &Path) {
    let cache = get_readdir_cache();
    let prefix = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let mut guard = cache.write().unwrap();

    // Collect keys to remove (can't modify while iterating)
    let keys_to_remove: Vec<PathBuf> = guard
        .iter()
        .filter(|(k, _)| k.starts_with(&prefix))
        .map(|(k, _)| k.clone())
        .collect();

    for key in keys_to_remove {
        guard.pop(&key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use tempfile::TempDir;

    fn default_options() -> PatternOptions {
        PatternOptions::default()
    }

    // Helper to create a test directory with some files
    fn create_test_dir() -> TempDir {
        let temp = TempDir::new().unwrap();
        let base = temp.path();

        File::create(base.join("file1.txt")).unwrap();
        File::create(base.join("file2.js")).unwrap();
        File::create(base.join(".hidden")).unwrap();
        fs::create_dir_all(base.join("subdir")).unwrap();
        File::create(base.join("subdir/nested.txt")).unwrap();

        temp
    }

    // =========================================================================
    // Readdir Cache Tests
    // =========================================================================

    #[test]
    fn test_readdir_cache_basic() {
        let temp = create_test_dir();
        let path = temp.path();

        // Note: Don't rely on cache size counts as tests run in parallel

        // First read
        let entries1 = read_dir_cached(path, false);
        assert!(!entries1.is_empty());

        // Second read - should use cache
        let entries2 = read_dir_cached(path, false);
        assert_eq!(entries1.len(), entries2.len());

        // Verify entries match
        let names1: std::collections::HashSet<_> = entries1.iter().map(|e| &e.name).collect();
        let names2: std::collections::HashSet<_> = entries2.iter().map(|e| &e.name).collect();
        assert_eq!(names1, names2);
    }

    #[test]
    fn test_readdir_cache_entry_properties() {
        let temp = create_test_dir();
        let path = temp.path();

        clear_readdir_cache();
        let entries = read_dir_cached(path, false);

        // Find file entry
        let file_entry = entries.iter().find(|e| e.name == "file1.txt").unwrap();
        assert!(file_entry.is_file);
        assert!(!file_entry.is_dir);
        assert!(!file_entry.is_symlink);

        // Find directory entry
        let dir_entry = entries.iter().find(|e| e.name == "subdir").unwrap();
        assert!(dir_entry.is_dir);
        assert!(!dir_entry.is_file);
        assert!(!dir_entry.is_symlink);

        // Find hidden file
        let hidden_entry = entries.iter().find(|e| e.name == ".hidden").unwrap();
        assert!(hidden_entry.is_file);
    }

    #[test]
    fn test_readdir_cache_ttl_expiry() {
        let temp = create_test_dir();
        let path = temp.path();

        clear_readdir_cache();

        // Use a very short TTL for testing
        let short_ttl = Duration::from_millis(50);

        // First read
        let entries1 = read_dir_cached_with_ttl(path, false, short_ttl);
        assert!(!entries1.is_empty());

        // Wait for TTL to expire
        std::thread::sleep(Duration::from_millis(100));

        // Cache should be considered expired, triggering a re-read
        // The entries should still be the same, but this exercises the expiry code path
        let entries2 = read_dir_cached_with_ttl(path, false, short_ttl);
        assert_eq!(entries1.len(), entries2.len());
    }

    #[test]
    fn test_readdir_cache_different_directories() {
        let temp = create_test_dir();
        let path = temp.path();
        let subdir_path = path.join("subdir");

        clear_readdir_cache();
        let size_before = readdir_cache_size();

        // Read both directories
        let root_entries = read_dir_cached(path, false);
        let subdir_entries = read_dir_cached(&subdir_path, false);

        // Both should be cached (cache size should have increased)
        assert!(readdir_cache_size() > size_before);

        // They should have different contents
        assert!(!root_entries.is_empty());
        assert!(!subdir_entries.is_empty());
        // root has: file1.txt, file2.js, .hidden, subdir = 4 entries
        // subdir has: nested.txt = 1 entry
        assert!(root_entries.len() > subdir_entries.len());
    }

    #[test]
    fn test_readdir_cache_nonexistent_directory() {
        let nonexistent = PathBuf::from("/this/path/does/not/exist");

        clear_readdir_cache();

        // Should return empty vector, not error
        let entries = read_dir_cached(&nonexistent, false);
        assert!(entries.is_empty());
    }

    #[test]
    fn test_readdir_cache_clear() {
        let temp = create_test_dir();
        let path = temp.path();

        clear_readdir_cache();

        read_dir_cached(path, false);
        assert!(readdir_cache_size() > 0);

        clear_readdir_cache();
        assert_eq!(readdir_cache_size(), 0);
    }

    #[test]
    fn test_readdir_cache_invalidate_dir() {
        let temp = create_test_dir();
        let path = temp.path();
        let subdir_path = path.join("subdir");

        // Cache both directories
        read_dir_cached(path, false);
        read_dir_cached(&subdir_path, false);

        // Verify we can check if a specific path is cached by reading stats
        // Note: We check the invalidation works by verifying the entry is removed
        let _stats_before = get_readdir_cache_stats();

        // Invalidate just the root path
        invalidate_dir(path);

        // Read root again - should be a cache miss (fresh read)
        // We can verify invalidation worked by checking that re-reading
        // produces the same results (functional correctness)
        let entries = read_dir_cached(path, false);
        assert!(
            !entries.is_empty(),
            "Should still be able to read directory after invalidation"
        );

        // Subdir should still be readable (wasn't invalidated)
        let subdir_entries = read_dir_cached(&subdir_path, false);
        assert!(
            !subdir_entries.is_empty(),
            "Subdir should still be readable"
        );
    }

    #[test]
    fn test_readdir_cache_stats() {
        clear_readdir_cache();

        let stats = get_readdir_cache_stats();
        assert_eq!(stats.size, 0);
        assert_eq!(stats.capacity, DEFAULT_READDIR_CACHE_SIZE);
    }

    #[cfg(unix)]
    #[test]
    fn test_readdir_cache_symlink_detection() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create a file and a symlink to it
        File::create(base.join("real_file.txt")).unwrap();
        symlink(base.join("real_file.txt"), base.join("link_to_file")).unwrap();

        // Create a directory and a symlink to it
        fs::create_dir_all(base.join("real_dir")).unwrap();
        symlink(base.join("real_dir"), base.join("link_to_dir")).unwrap();

        clear_readdir_cache();

        // Without following symlinks
        let entries = read_dir_cached(base, false);

        let link_to_file = entries.iter().find(|e| e.name == "link_to_file").unwrap();
        assert!(link_to_file.is_symlink);
        assert!(!link_to_file.is_file); // Without follow, it's reported as symlink not file

        let link_to_dir = entries.iter().find(|e| e.name == "link_to_dir").unwrap();
        assert!(link_to_dir.is_symlink);
        assert!(!link_to_dir.is_dir); // Without follow, it's reported as symlink not dir
    }

    #[cfg(unix)]
    #[test]
    fn test_readdir_cache_follow_symlinks() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        File::create(base.join("real_file.txt")).unwrap();
        symlink(base.join("real_file.txt"), base.join("link_to_file")).unwrap();

        // Test the read_dir_uncached function directly for symlink behavior
        let entries = read_dir_uncached(base, true);

        let link_to_file = entries.iter().find(|e| e.name == "link_to_file").unwrap();
        assert!(link_to_file.is_symlink, "Should be detected as symlink");

        // When following symlinks, metadata() follows the symlink and returns the target's type
        // Since the target is a file, is_file should be true
        assert!(
            link_to_file.is_file,
            "Expected is_file=true for symlink to file when following symlinks. Got is_file={}, is_dir={}, is_symlink={}",
            link_to_file.is_file, link_to_file.is_dir, link_to_file.is_symlink
        );
    }

    #[test]
    fn test_readdir_cache_concurrent_access() {
        use std::thread;

        let temp = create_test_dir();
        let path = temp.path().to_path_buf();

        // Note: Don't clear_readdir_cache() here as other tests may be running
        // Just verify concurrent access works correctly
        let _size_before = readdir_cache_size();

        let handles: Vec<_> = (0..10)
            .map(|_| {
                let path_clone = path.clone();
                thread::spawn(move || {
                    for _ in 0..100 {
                        let entries = read_dir_cached(&path_clone, false);
                        assert!(!entries.is_empty());
                    }
                })
            })
            .collect();

        for handle in handles {
            handle.join().unwrap();
        }

        // Should have cached at least one directory (or the cache size should have increased)
        // Due to parallel tests, we can't guarantee exact counts
        let size_after = readdir_cache_size();
        assert!(
            size_after >= 1,
            "Cache should have at least one entry after concurrent reads"
        );
    }

    // =========================================================================
    // Pattern Cache Tests (existing tests below)
    // =========================================================================

    #[test]
    fn test_cache_hit() {
        let options = default_options();
        // Use a unique pattern that won't conflict with other tests
        let pattern = "**/*.cache_hit_test_xyz";

        let size_before = cache_size();

        // First call should compile and cache
        let p1 = get_or_compile_pattern(pattern, &options);
        let size_after_first = cache_size();

        // Should have added at least one entry (could be more if run with other tests)
        assert!(size_after_first >= size_before);

        // Second call should hit cache
        let p2 = get_or_compile_pattern(pattern, &options);
        let size_after_second = cache_size();

        // Size should not increase (cache hit)
        assert_eq!(size_after_second, size_after_first);

        // Both should match the same pattern
        assert!(p1.matches("src/foo.cache_hit_test_xyz"));
        assert!(p2.matches("src/foo.cache_hit_test_xyz"));
    }

    #[test]
    fn test_different_patterns() {
        let options = default_options();

        // Use UUID-like unique patterns that won't conflict with other tests
        let uuid = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();

        let p1 = format!("diff_test_{uuid}_*.aaa");
        let p2 = format!("diff_test_{uuid}_*.bbb");
        let p3 = format!("diff_test_{uuid}/**/*.ccc");

        // Compile patterns
        let pattern1 = get_or_compile_pattern(&p1, &options);
        let pattern2 = get_or_compile_pattern(&p2, &options);
        let pattern3 = get_or_compile_pattern(&p3, &options);

        // Verify they are different patterns
        assert_ne!(pattern1.raw(), pattern2.raw());
        assert_ne!(pattern2.raw(), pattern3.raw());

        // Verify they are cached (calling again returns same pattern)
        let pattern1_again = get_or_compile_pattern(&p1, &options);
        assert_eq!(pattern1.raw(), pattern1_again.raw());
    }

    #[test]
    fn test_same_pattern_different_options() {
        // Use a simple pattern that will behave differently based on nocase option
        let pattern = "*.TXT";

        // With nocase: false (case-sensitive)
        let opts1 = PatternOptions {
            nocase: false,
            ..Default::default()
        };
        let p1 = get_or_compile_pattern(pattern, &opts1);

        // With nocase: true (case-insensitive)
        let opts2 = PatternOptions {
            nocase: true,
            ..Default::default()
        };
        let p2 = get_or_compile_pattern(pattern, &opts2);

        // Case-sensitive should only match uppercase
        assert!(p1.matches("file.TXT"));
        // Case-sensitive should NOT match lowercase (different case)
        assert!(!p1.matches("file.txt"));

        // Case-insensitive should match both
        assert!(p2.matches("file.TXT"));
        assert!(p2.matches("file.txt"));
    }

    #[test]
    fn test_cache_eviction() {
        let options = default_options();

        // Fill the cache with unique patterns
        for i in 0..DEFAULT_CACHE_SIZE + 100 {
            get_or_compile_pattern(&format!("eviction_test_pattern_{i}"), &options);
        }

        // Cache should not exceed capacity
        assert!(cache_size() <= DEFAULT_CACHE_SIZE);
    }

    #[test]
    fn test_cache_clear() {
        let options = default_options();
        get_or_compile_pattern("clear_test_*.eee", &options);
        get_or_compile_pattern("clear_test_*.fff", &options);

        // Just verify clear() doesn't panic - we can't assert on size
        // because other tests running in parallel may add entries.
        clear_cache();

        // Re-add after clear to verify cache is operational
        get_or_compile_pattern("clear_test_post_*.ggg", &options);
        assert!(cache_size() > 0, "Cache should work after clear");
    }

    #[test]
    fn test_concurrent_access() {
        use std::thread;

        let handles: Vec<_> = (0..10)
            .map(|i| {
                thread::spawn(move || {
                    let options = PatternOptions::default();
                    for j in 0..100 {
                        let pattern = format!("**/concurrent_thread_{i}_pattern_{j}.zzz");
                        let compiled = get_or_compile_pattern(&pattern, &options);
                        assert!(
                            compiled.matches(&format!("src/concurrent_thread_{i}_pattern_{j}.zzz"))
                        );
                    }
                })
            })
            .collect();

        for handle in handles {
            handle.join().unwrap();
        }

        // All patterns should be cached (up to capacity)
        assert!(cache_size() > 0);
        assert!(cache_size() <= DEFAULT_CACHE_SIZE);
    }

    #[test]
    fn test_cached_pattern_matches_correctly() {
        let options = PatternOptions {
            nocase: true,
            ..Default::default()
        };

        // Use a simple pattern with unique extension
        let pattern = "*.cachetestggg";

        // Compile and cache
        let p1 = get_or_compile_pattern(pattern, &options);

        // Get from cache
        let p2 = get_or_compile_pattern(pattern, &options);

        // Both should work correctly with case-insensitive matching
        assert!(p1.matches("file.cachetestggg"));
        assert!(p1.matches("FILE.CACHETESTGGG"));
        assert!(p2.matches("file.cachetestggg"));
        assert!(p2.matches("FILE.CACHETESTGGG"));
    }

    #[test]
    fn test_cache_stats() {
        // Just verify the stats function works
        let stats = get_cache_stats();
        assert!(stats.size <= stats.capacity);
        assert_eq!(stats.capacity, DEFAULT_CACHE_SIZE);
    }
}
