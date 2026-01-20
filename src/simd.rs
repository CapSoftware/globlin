//! SIMD-optimized string operations for pattern matching.
//!
//! This module provides optimized string operations using platform-specific SIMD
//! intrinsics when available:
//! - ARM64 (Apple Silicon): NEON intrinsics
//! - x86_64: SSE2/AVX2 intrinsics (fallback to SSE2 for broad compatibility)
//!
//! All functions have scalar fallbacks for platforms without SIMD support.

// Allow manual indexing in SIMD code for performance-critical fallback paths
#![allow(
    clippy::needless_range_loop,
    clippy::manual_find,
    clippy::manual_retain
)]

/// Check if two byte slices are equal using SIMD when available.
///
/// This is optimized for comparing path segments and extensions,
/// which are typically short strings (1-50 bytes).
#[inline]
pub fn bytes_equal(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }

    if a.is_empty() {
        return true;
    }

    // Use SIMD for strings >= 16 bytes
    #[cfg(all(target_arch = "aarch64", target_feature = "neon"))]
    {
        if a.len() >= 16 {
            return bytes_equal_neon(a, b);
        }
    }

    #[cfg(all(target_arch = "x86_64", target_feature = "sse2"))]
    {
        if a.len() >= 16 {
            return bytes_equal_sse2(a, b);
        }
    }

    // Scalar fallback for short strings or unsupported platforms
    a == b
}

/// Check if a byte slice starts with a prefix using SIMD when available.
#[inline]
pub fn starts_with_fast(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.len() > haystack.len() {
        return false;
    }

    if needle.is_empty() {
        return true;
    }

    // Use SIMD for prefixes >= 16 bytes
    #[cfg(all(target_arch = "aarch64", target_feature = "neon"))]
    {
        if needle.len() >= 16 {
            return bytes_equal_neon(&haystack[..needle.len()], needle);
        }
    }

    #[cfg(all(target_arch = "x86_64", target_feature = "sse2"))]
    {
        if needle.len() >= 16 {
            return bytes_equal_sse2(&haystack[..needle.len()], needle);
        }
    }

    // Scalar fallback
    haystack.starts_with(needle)
}

/// Check if a byte slice ends with a suffix using SIMD when available.
#[inline]
pub fn ends_with_fast(haystack: &[u8], needle: &[u8]) -> bool {
    if needle.len() > haystack.len() {
        return false;
    }

    if needle.is_empty() {
        return true;
    }

    let offset = haystack.len() - needle.len();

    // Use SIMD for suffixes >= 16 bytes
    #[cfg(all(target_arch = "aarch64", target_feature = "neon"))]
    {
        if needle.len() >= 16 {
            return bytes_equal_neon(&haystack[offset..], needle);
        }
    }

    #[cfg(all(target_arch = "x86_64", target_feature = "sse2"))]
    {
        if needle.len() >= 16 {
            return bytes_equal_sse2(&haystack[offset..], needle);
        }
    }

    // Scalar fallback
    haystack.ends_with(needle)
}

/// Find the first occurrence of a byte in a slice using SIMD when available.
/// Returns the index of the first occurrence, or None if not found.
#[inline]
pub fn memchr_fast(needle: u8, haystack: &[u8]) -> Option<usize> {
    if haystack.is_empty() {
        return None;
    }

    // Use SIMD for haystack >= 16 bytes
    #[cfg(all(target_arch = "aarch64", target_feature = "neon"))]
    {
        if haystack.len() >= 16 {
            return memchr_neon(needle, haystack);
        }
    }

    #[cfg(all(target_arch = "x86_64", target_feature = "sse2"))]
    {
        if haystack.len() >= 16 {
            return memchr_sse2(needle, haystack);
        }
    }

    // Scalar fallback
    haystack.iter().position(|&b| b == needle)
}

/// Check if a slice contains a specific byte using SIMD when available.
#[inline]
pub fn contains_byte(haystack: &[u8], needle: u8) -> bool {
    memchr_fast(needle, haystack).is_some()
}

/// Count occurrences of a byte in a slice using SIMD when available.
#[inline]
pub fn count_byte(haystack: &[u8], needle: u8) -> usize {
    if haystack.is_empty() {
        return 0;
    }

    #[cfg(all(target_arch = "aarch64", target_feature = "neon"))]
    {
        if haystack.len() >= 16 {
            return count_byte_neon(needle, haystack);
        }
    }

    #[cfg(all(target_arch = "x86_64", target_feature = "sse2"))]
    {
        if haystack.len() >= 16 {
            return count_byte_sse2(needle, haystack);
        }
    }

    // Scalar fallback
    haystack.iter().filter(|&&b| b == needle).count()
}

// =============================================================================
// ARM64 NEON Implementation
// =============================================================================

#[cfg(all(target_arch = "aarch64", target_feature = "neon"))]
mod neon_impl {
    use std::arch::aarch64::*;

    /// Compare two byte slices of equal length using NEON.
    /// Assumes len >= 16 and both slices have the same length.
    #[inline]
    pub fn bytes_equal_neon(a: &[u8], b: &[u8]) -> bool {
        debug_assert_eq!(a.len(), b.len());
        debug_assert!(a.len() >= 16);

        let len = a.len();
        let mut i = 0;

        // Process 16 bytes at a time using NEON
        // Safety: we've verified len >= 16 and we stay within bounds
        unsafe {
            while i + 16 <= len {
                let va = vld1q_u8(a.as_ptr().add(i));
                let vb = vld1q_u8(b.as_ptr().add(i));

                // Compare the vectors: result is 0xFF where equal, 0x00 where different
                let cmp = vceqq_u8(va, vb);

                // Check if all bytes matched (all bits should be 1)
                // Use vminvq to find minimum - if all 0xFF, result is 0xFF
                let min = vminvq_u8(cmp);
                if min != 0xFF {
                    return false;
                }

                i += 16;
            }
        }

        // Handle remaining bytes (< 16)
        if i < len {
            return a[i..] == b[i..];
        }

        true
    }

    /// Find first occurrence of byte using NEON.
    /// Assumes haystack.len() >= 16.
    #[inline]
    pub fn memchr_neon(needle: u8, haystack: &[u8]) -> Option<usize> {
        debug_assert!(haystack.len() >= 16);

        let len = haystack.len();
        let mut i = 0;

        // Safety: we've verified len >= 16
        unsafe {
            let needle_vec = vdupq_n_u8(needle);

            while i + 16 <= len {
                let chunk = vld1q_u8(haystack.as_ptr().add(i));

                // Compare: result is 0xFF where equal
                let cmp = vceqq_u8(chunk, needle_vec);

                // Check if any byte matched using vmaxvq
                let max = vmaxvq_u8(cmp);
                if max != 0 {
                    // Found a match - find the position
                    // Extract the mask and find first set bit
                    let mask = cmp_to_bitmask(cmp);
                    if mask != 0 {
                        return Some(i + mask.trailing_zeros() as usize);
                    }
                }

                i += 16;
            }
        }

        // Handle remaining bytes
        (i..len).find(|&j| haystack[j] == needle)
    }

    /// Count occurrences of byte using NEON.
    /// Assumes haystack.len() >= 16.
    #[inline]
    pub fn count_byte_neon(needle: u8, haystack: &[u8]) -> usize {
        debug_assert!(haystack.len() >= 16);

        let len = haystack.len();
        let mut count: usize = 0;
        let mut i = 0;

        // Safety: we've verified len >= 16
        unsafe {
            let needle_vec = vdupq_n_u8(needle);
            let mut acc = vdupq_n_u8(0);

            // Process in chunks, periodically summing the accumulator to avoid overflow
            while i + 16 <= len {
                let chunk = vld1q_u8(haystack.as_ptr().add(i));
                let cmp = vceqq_u8(chunk, needle_vec);

                // Each matching byte is 0xFF = 255, which we can use for counting
                // But we need to convert to 1s: (0xFF >> 7) = 1, (0x00 >> 7) = 0
                // However, subtraction is easier: 0 - 0xFF = 1 (wrapping), 0 - 0 = 0
                // Actually, let's use the fact that 0xFF = -1 in two's complement
                // So we can subtract: accumulator - cmp will add 1 for each 0xFF
                acc = vsubq_u8(acc, cmp);

                i += 16;

                // Sum accumulator every 255 iterations to avoid overflow
                // (each byte can hold max 255 matches)
                if i % (255 * 16) == 0 {
                    count += horizontal_sum_u8(acc);
                    acc = vdupq_n_u8(0);
                }
            }

            // Final accumulator sum
            count += horizontal_sum_u8(acc);
        }

        // Handle remaining bytes
        count += haystack[i..len].iter().filter(|&&b| b == needle).count();

        count
    }

    /// Convert NEON comparison result to a bitmask.
    /// Each byte in the vector becomes one bit in the result.
    #[inline]
    unsafe fn cmp_to_bitmask(cmp: uint8x16_t) -> u16 {
        // Narrow to get the high bit of each byte into a 16-bit mask
        // We do this by shifting and combining
        let shifted: [u8; 16] = std::mem::transmute(cmp);
        let mut mask: u16 = 0;
        for (i, &byte) in shifted.iter().enumerate() {
            if byte != 0 {
                mask |= 1 << i;
            }
        }
        mask
    }

    /// Sum all bytes in a NEON u8x16 vector.
    #[inline]
    unsafe fn horizontal_sum_u8(v: uint8x16_t) -> usize {
        // Add pairwise to reduce 16 bytes -> 8 halfwords -> 4 words -> 2 dwords -> 1 qword
        let sum1 = vpaddlq_u8(v); // 8 x u16
        let sum2 = vpaddlq_u16(sum1); // 4 x u32
        let sum3 = vpaddlq_u32(sum2); // 2 x u64
        let lo = vgetq_lane_u64(sum3, 0);
        let hi = vgetq_lane_u64(sum3, 1);
        (lo + hi) as usize
    }
}

#[cfg(all(target_arch = "aarch64", target_feature = "neon"))]
use neon_impl::{bytes_equal_neon, count_byte_neon, memchr_neon};

// =============================================================================
// x86_64 SSE2 Implementation
// =============================================================================

#[cfg(all(target_arch = "x86_64", target_feature = "sse2"))]
mod sse2_impl {
    use std::arch::x86_64::*;

    /// Compare two byte slices of equal length using SSE2.
    /// Assumes len >= 16 and both slices have the same length.
    #[inline]
    pub fn bytes_equal_sse2(a: &[u8], b: &[u8]) -> bool {
        debug_assert_eq!(a.len(), b.len());
        debug_assert!(a.len() >= 16);

        let len = a.len();
        let mut i = 0;

        // Safety: we've verified len >= 16 and we stay within bounds
        unsafe {
            while i + 16 <= len {
                let va = _mm_loadu_si128(a.as_ptr().add(i) as *const __m128i);
                let vb = _mm_loadu_si128(b.as_ptr().add(i) as *const __m128i);

                // Compare the vectors
                let cmp = _mm_cmpeq_epi8(va, vb);

                // Check if all bytes matched
                let mask = _mm_movemask_epi8(cmp);
                if mask != 0xFFFF {
                    return false;
                }

                i += 16;
            }
        }

        // Handle remaining bytes (< 16)
        if i < len {
            return a[i..] == b[i..];
        }

        true
    }

    /// Find first occurrence of byte using SSE2.
    /// Assumes haystack.len() >= 16.
    #[inline]
    pub fn memchr_sse2(needle: u8, haystack: &[u8]) -> Option<usize> {
        debug_assert!(haystack.len() >= 16);

        let len = haystack.len();
        let mut i = 0;

        // Safety: we've verified len >= 16
        unsafe {
            let needle_vec = _mm_set1_epi8(needle as i8);

            while i + 16 <= len {
                let chunk = _mm_loadu_si128(haystack.as_ptr().add(i) as *const __m128i);
                let cmp = _mm_cmpeq_epi8(chunk, needle_vec);
                let mask = _mm_movemask_epi8(cmp) as u32;

                if mask != 0 {
                    return Some(i + mask.trailing_zeros() as usize);
                }

                i += 16;
            }
        }

        // Handle remaining bytes
        for j in i..len {
            if haystack[j] == needle {
                return Some(j);
            }
        }

        None
    }

    /// Count occurrences of byte using SSE2.
    /// Assumes haystack.len() >= 16.
    #[inline]
    pub fn count_byte_sse2(needle: u8, haystack: &[u8]) -> usize {
        debug_assert!(haystack.len() >= 16);

        let len = haystack.len();
        let mut count: usize = 0;
        let mut i = 0;

        // Safety: we've verified len >= 16
        unsafe {
            let needle_vec = _mm_set1_epi8(needle as i8);

            while i + 16 <= len {
                let chunk = _mm_loadu_si128(haystack.as_ptr().add(i) as *const __m128i);
                let cmp = _mm_cmpeq_epi8(chunk, needle_vec);
                let mask = _mm_movemask_epi8(cmp) as u32;
                count += mask.count_ones() as usize;

                i += 16;
            }
        }

        // Handle remaining bytes
        for j in i..len {
            if haystack[j] == needle {
                count += 1;
            }
        }

        count
    }
}

#[cfg(all(target_arch = "x86_64", target_feature = "sse2"))]
use sse2_impl::{bytes_equal_sse2, count_byte_sse2, memchr_sse2};

// =============================================================================
// High-level String Operations
// =============================================================================

/// Fast case-insensitive ASCII string comparison.
/// This is optimized for comparing extensions and path segments.
#[inline]
pub fn eq_ignore_ascii_case_fast(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }

    // For short strings, use scalar comparison
    if a.len() < 16 {
        return a.eq_ignore_ascii_case(b);
    }

    // For longer strings, we could use SIMD with case folding
    // but for now, use standard library (which is already well-optimized)
    a.eq_ignore_ascii_case(b)
}

/// Find the position of the last path separator (/ or \) in a path.
/// Returns None if no separator is found.
#[inline]
pub fn find_last_separator(path: &[u8]) -> Option<usize> {
    // Search from the end for better locality
    (0..path.len())
        .rev()
        .find(|&i| path[i] == b'/' || path[i] == b'\\')
}

/// Count the number of path separators in a path.
/// This is useful for depth calculations.
#[inline]
pub fn count_separators(path: &[u8]) -> usize {
    count_byte(path, b'/')
}

/// Check if a path contains any path separator.
#[inline]
pub fn has_separator(path: &[u8]) -> bool {
    contains_byte(path, b'/')
}

/// Get the file extension from a path (portion after last dot in the filename).
/// Returns None if no extension is found.
#[inline]
pub fn get_extension(path: &[u8]) -> Option<&[u8]> {
    // Find the last separator to isolate the filename
    let filename_start = find_last_separator(path).map(|i| i + 1).unwrap_or(0);
    let filename = &path[filename_start..];

    // Find the last dot in the filename
    for i in (0..filename.len()).rev() {
        if filename[i] == b'.' {
            // Don't count leading dot as extension separator (e.g., ".gitignore")
            if i == 0 {
                return None;
            }
            return Some(&filename[i + 1..]);
        }
    }
    None
}

/// Check if a filename has a specific extension.
/// Extension should NOT include the leading dot.
#[inline]
pub fn has_extension(path: &[u8], ext: &[u8]) -> bool {
    match get_extension(path) {
        Some(file_ext) => bytes_equal(file_ext, ext),
        None => false,
    }
}

/// Check if a filename has a specific extension (case-insensitive).
/// Extension should NOT include the leading dot.
#[inline]
pub fn has_extension_nocase(path: &[u8], ext: &[u8]) -> bool {
    match get_extension(path) {
        Some(file_ext) => {
            if file_ext.len() != ext.len() {
                return false;
            }
            file_ext
                .iter()
                .zip(ext.iter())
                .all(|(&a, &b)| a.eq_ignore_ascii_case(&b))
        }
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bytes_equal() {
        assert!(bytes_equal(b"hello", b"hello"));
        assert!(!bytes_equal(b"hello", b"world"));
        assert!(!bytes_equal(b"hello", b"hell"));
        assert!(bytes_equal(b"", b""));

        // Test with strings >= 16 bytes (SIMD path)
        let long_a = b"this is a longer string for SIMD testing";
        let long_b = b"this is a longer string for SIMD testing";
        let long_c = b"this is a longer string for SIMD testinh";
        assert!(bytes_equal(long_a, long_b));
        assert!(!bytes_equal(long_a, long_c));
    }

    #[test]
    fn test_starts_with_fast() {
        assert!(starts_with_fast(b"hello world", b"hello"));
        assert!(!starts_with_fast(b"hello world", b"world"));
        assert!(starts_with_fast(b"hello", b""));
        assert!(!starts_with_fast(b"hi", b"hello"));

        // Test SIMD path
        let haystack = b"this is a longer string for testing prefixes";
        assert!(starts_with_fast(haystack, b"this is a longer string"));
        assert!(!starts_with_fast(haystack, b"that is a longer string"));
    }

    #[test]
    fn test_ends_with_fast() {
        assert!(ends_with_fast(b"hello world", b"world"));
        assert!(!ends_with_fast(b"hello world", b"hello"));
        assert!(ends_with_fast(b"hello", b""));
        assert!(!ends_with_fast(b"hi", b"hello"));

        // Test SIMD path
        let haystack = b"this is a longer string for testing suffixes";
        assert!(ends_with_fast(haystack, b"for testing suffixes"));
        assert!(!ends_with_fast(haystack, b"for testing prefixes"));
    }

    #[test]
    fn test_memchr_fast() {
        assert_eq!(memchr_fast(b'o', b"hello"), Some(4));
        assert_eq!(memchr_fast(b'l', b"hello"), Some(2));
        assert_eq!(memchr_fast(b'x', b"hello"), None);
        assert_eq!(memchr_fast(b'a', b""), None);

        // Test SIMD path
        let haystack = b"this is a longer string for testing memchr";
        assert_eq!(memchr_fast(b'm', haystack), Some(36));
        assert_eq!(memchr_fast(b'x', haystack), None);
    }

    #[test]
    fn test_contains_byte() {
        assert!(contains_byte(b"hello", b'e'));
        assert!(!contains_byte(b"hello", b'x'));
        assert!(contains_byte(b"path/to/file", b'/'));
    }

    #[test]
    fn test_count_byte() {
        assert_eq!(count_byte(b"hello", b'l'), 2);
        assert_eq!(count_byte(b"hello", b'x'), 0);
        assert_eq!(count_byte(b"a/b/c/d/e", b'/'), 4);

        // Test SIMD path
        let haystack = b"this/is/a/longer/path/for/testing/separators";
        assert_eq!(count_byte(haystack, b'/'), 7);
    }

    #[test]
    fn test_find_last_separator() {
        assert_eq!(find_last_separator(b"path/to/file.txt"), Some(7));
        assert_eq!(find_last_separator(b"file.txt"), None);
        assert_eq!(find_last_separator(b"path\\to\\file.txt"), Some(7));
    }

    #[test]
    fn test_count_separators() {
        assert_eq!(count_separators(b"a/b/c"), 2);
        assert_eq!(count_separators(b"file.txt"), 0);
        assert_eq!(count_separators(b"/root/path/to/file"), 4);
    }

    #[test]
    fn test_has_separator() {
        assert!(has_separator(b"path/to/file"));
        assert!(!has_separator(b"filename"));
    }

    #[test]
    fn test_get_extension() {
        assert_eq!(get_extension(b"file.txt"), Some(b"txt".as_ref()));
        assert_eq!(get_extension(b"path/to/file.rs"), Some(b"rs".as_ref()));
        assert_eq!(get_extension(b"noextension"), None);
        assert_eq!(get_extension(b".gitignore"), None);
        assert_eq!(get_extension(b"archive.tar.gz"), Some(b"gz".as_ref()));
    }

    #[test]
    fn test_has_extension() {
        assert!(has_extension(b"file.txt", b"txt"));
        assert!(!has_extension(b"file.txt", b"rs"));
        assert!(!has_extension(b"noext", b"txt"));
        assert!(has_extension(b"path/to/file.js", b"js"));
    }

    #[test]
    fn test_has_extension_nocase() {
        assert!(has_extension_nocase(b"file.TXT", b"txt"));
        assert!(has_extension_nocase(b"file.txt", b"TXT"));
        assert!(has_extension_nocase(b"file.Txt", b"tXt"));
        assert!(!has_extension_nocase(b"file.txt", b"rs"));
    }

    #[test]
    fn test_eq_ignore_ascii_case_fast() {
        assert!(eq_ignore_ascii_case_fast("hello", "HELLO"));
        assert!(eq_ignore_ascii_case_fast("Hello", "hello"));
        assert!(!eq_ignore_ascii_case_fast("hello", "world"));
        assert!(!eq_ignore_ascii_case_fast("hello", "hell"));
    }
}
