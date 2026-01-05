use lru::LruCache;
use std::hash::{Hash, Hasher};
use std::num::NonZeroUsize;
use std::sync::{Mutex, OnceLock};

use crate::pattern::{Pattern, PatternOptions};

/// Default cache size for compiled patterns.
/// This is chosen to be large enough to hold patterns for typical glob operations
/// (e.g., a project with many different glob patterns) while not using excessive memory.
const DEFAULT_CACHE_SIZE: usize = 1024;

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
/// Uses a Mutex for thread-safe access.
static PATTERN_CACHE: OnceLock<Mutex<LruCache<PatternCacheKey, Pattern>>> = OnceLock::new();

/// Initialize the global pattern cache with the default size.
fn get_cache() -> &'static Mutex<LruCache<PatternCacheKey, Pattern>> {
    PATTERN_CACHE.get_or_init(|| {
        Mutex::new(LruCache::new(
            NonZeroUsize::new(DEFAULT_CACHE_SIZE).unwrap(),
        ))
    })
}

/// Get a compiled pattern from the cache, or compile and cache it if not found.
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

    // Try to get from cache
    {
        let mut guard = cache.lock().unwrap();
        if let Some(cached) = guard.get(&key) {
            return cached.clone();
        }
    }

    // Compile the pattern (outside lock to avoid holding lock during compilation)
    let compiled = Pattern::with_pattern_options(pattern, options.clone());

    // Store in cache
    {
        let mut guard = cache.lock().unwrap();
        guard.put(key, compiled.clone());
    }

    compiled
}

/// Get the current number of cached patterns.
/// Useful for debugging and monitoring.
#[allow(dead_code)]
pub fn cache_size() -> usize {
    let cache = get_cache();
    let guard = cache.lock().unwrap();
    guard.len()
}

/// Clear the pattern cache.
/// This is mainly useful for testing.
#[allow(dead_code)]
pub fn clear_cache() {
    let cache = get_cache();
    let mut guard = cache.lock().unwrap();
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
    let guard = cache.lock().unwrap();
    CacheStats {
        size: guard.len(),
        capacity: guard.cap().get(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_options() -> PatternOptions {
        PatternOptions::default()
    }

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
        let size_before = cache_size();

        // Use unique patterns
        get_or_compile_pattern("unique_diff_test_*.aaa", &options);
        get_or_compile_pattern("unique_diff_test_*.bbb", &options);
        get_or_compile_pattern("unique_diff_test_**/*.ccc", &options);

        let size_after = cache_size();
        // Should have added 3 entries
        assert!(size_after >= size_before + 3);
    }

    #[test]
    fn test_same_pattern_different_options() {
        let pattern = "unique_opts_test_*.ddd";
        let size_before = cache_size();

        // With nocase: false
        let opts1 = PatternOptions {
            nocase: false,
            ..Default::default()
        };
        get_or_compile_pattern(pattern, &opts1);

        // With nocase: true (different key)
        let opts2 = PatternOptions {
            nocase: true,
            ..Default::default()
        };
        get_or_compile_pattern(pattern, &opts2);

        let size_after = cache_size();
        // Should have added 2 entries (different options = different keys)
        assert!(size_after >= size_before + 2);
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

        let size_before = cache_size();
        assert!(size_before >= 2);

        clear_cache();
        assert_eq!(cache_size(), 0);
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
