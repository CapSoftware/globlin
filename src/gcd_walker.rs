// Grand Central Dispatch (GCD) based parallel directory walker for macOS
//
// This module provides a high-performance parallel directory walker using Apple's
// Grand Central Dispatch (GCD) framework. GCD provides optimal parallelism on macOS:
//
// Key benefits:
// - Native macOS scheduling that respects system load
// - Automatic handling of efficiency vs performance cores on Apple Silicon
// - Lower overhead than generic thread pools (rayon)
// - Better power management integration
// - Optimal queue management for I/O-bound workloads
//
// This module is only available on macOS (target_os = "macos").

#![cfg(target_os = "macos")]

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use dispatch::{Queue, QueuePriority};

use crate::macos_walker::{read_dir_fast, read_dir_getattrlistbulk, RawDirEntry};
use crate::walker::{WalkEntry, WalkOptions};

/// GCD-based parallel directory walker for macOS.
///
/// This walker uses Grand Central Dispatch (GCD) for parallel directory traversal,
/// providing better performance than rayon on macOS due to:
/// - Native integration with the macOS scheduler
/// - Automatic P-core vs E-core handling on Apple Silicon
/// - Lower overhead for I/O-bound workloads
/// - Better power management
pub struct GcdWalker {
    root: PathBuf,
    options: WalkOptions,
}

impl GcdWalker {
    /// Create a new GCD-based walker
    pub fn new(root: PathBuf, options: WalkOptions) -> Self {
        Self { root, options }
    }

    /// Read directory entries using the optimized macOS functions
    fn read_dir(&self, path: &Path) -> Vec<RawDirEntry> {
        // Try the optimized getattrlistbulk path first
        match read_dir_getattrlistbulk(path) {
            Ok(entries) => entries,
            Err(_) => {
                // Fall back to standard readdir
                read_dir_fast(path).unwrap_or_default()
            }
        }
    }

    /// Walk the directory tree using GCD for parallel processing.
    ///
    /// This implementation uses a breadth-first approach with parallel processing
    /// at each level. The parallelism is handled by GCD's global concurrent queue,
    /// which automatically manages thread pool sizing and scheduling.
    pub fn walk(&self) -> Vec<WalkEntry> {
        if !self.root.exists() {
            return Vec::new();
        }

        // Shared state for collecting results (thread-safe)
        let entries = Arc::new(Mutex::new(Vec::new()));

        // Add root entry
        if let Ok(meta) = self.root.symlink_metadata() {
            let is_symlink = meta.file_type().is_symlink();
            let (is_dir, is_file) = if is_symlink && self.options.follow_symlinks {
                match self.root.metadata() {
                    Ok(target_meta) => {
                        let ft = target_meta.file_type();
                        (ft.is_dir(), ft.is_file())
                    }
                    Err(_) => (false, false),
                }
            } else {
                let ft = meta.file_type();
                (ft.is_dir(), ft.is_file())
            };

            entries.lock().unwrap().push(WalkEntry {
                path: self.root.clone(),
                depth: 0,
                is_dir,
                is_file,
                is_symlink,
            });

            if is_dir {
                // Start parallel BFS traversal
                self.walk_parallel_bfs(entries.clone());
            }
        }

        // Extract results from Arc<Mutex<>>
        match Arc::try_unwrap(entries) {
            Ok(mutex) => mutex.into_inner().unwrap(),
            Err(arc) => arc.lock().unwrap().clone(),
        }
    }

    /// Perform parallel BFS traversal using GCD.
    ///
    /// This processes directories level by level, with each level being
    /// processed in parallel using GCD's concurrent queue.
    fn walk_parallel_bfs(&self, entries: Arc<Mutex<Vec<WalkEntry>>>) {
        let queue = Queue::global(QueuePriority::Default);

        // Current level directories to process
        let mut current_level: Vec<(PathBuf, usize)> = vec![(self.root.clone(), 1)];

        // Process level by level
        while !current_level.is_empty() {
            // Check depth limit
            if let Some(max_depth) = self.options.max_depth {
                if current_level[0].1 > max_depth {
                    break;
                }
            }

            // Shared state for next level directories
            let next_level = Arc::new(Mutex::new(Vec::new()));

            // Clone references for parallel closure
            let entries_clone = entries.clone();
            let next_level_clone = next_level.clone();
            let dot = self.options.dot;
            let follow_symlinks = self.options.follow_symlinks;
            let max_depth = self.options.max_depth;

            // Process all directories at current level in parallel
            let num_dirs = current_level.len();

            // Use dispatch_apply for parallel iteration
            queue.apply(num_dirs, |i| {
                let (dir_path, depth) = &current_level[i];

                // Read directory entries
                let dir_entries = match read_dir_getattrlistbulk(dir_path) {
                    Ok(e) => e,
                    Err(_) => read_dir_fast(dir_path).unwrap_or_default(),
                };

                // Collect entries for this directory
                let mut local_entries = Vec::with_capacity(dir_entries.len());
                let mut local_next_dirs = Vec::new();

                for raw_entry in dir_entries {
                    let name_str = raw_entry.name.to_string_lossy();

                    // Filter dotfiles if needed
                    if !dot && name_str.starts_with('.') {
                        continue;
                    }

                    let entry_path = dir_path.join(&raw_entry.name);

                    // Determine actual types (handle symlinks)
                    let (is_dir, is_file, is_symlink) = if raw_entry.is_symlink && follow_symlinks {
                        match entry_path.metadata() {
                            Ok(target_meta) => {
                                let ft = target_meta.file_type();
                                (ft.is_dir(), ft.is_file(), true)
                            }
                            Err(_) => (false, false, true),
                        }
                    } else {
                        (raw_entry.is_dir, raw_entry.is_file, raw_entry.is_symlink)
                    };

                    local_entries.push(WalkEntry {
                        path: entry_path.clone(),
                        depth: *depth,
                        is_dir,
                        is_file,
                        is_symlink,
                    });

                    // Queue directories for next level
                    if is_dir && (follow_symlinks || !raw_entry.is_symlink) {
                        // Check if we should continue to next level
                        let should_recurse = match max_depth {
                            Some(max) => *depth < max,
                            None => true,
                        };
                        if should_recurse {
                            local_next_dirs.push((entry_path, depth + 1));
                        }
                    }
                }

                // Add local entries to shared collection
                if !local_entries.is_empty() {
                    entries_clone.lock().unwrap().extend(local_entries);
                }

                // Add next level directories
                if !local_next_dirs.is_empty() {
                    next_level_clone.lock().unwrap().extend(local_next_dirs);
                }
            });

            // Move to next level
            current_level = match Arc::try_unwrap(next_level) {
                Ok(mutex) => mutex.into_inner().unwrap(),
                Err(arc) => arc.lock().unwrap().clone(),
            };
        }
    }

    /// Walk the directory tree using GCD with work-stealing pattern.
    ///
    /// This is an alternative implementation that uses a work-stealing approach
    /// where directories are dynamically distributed to workers as they complete.
    /// This can be more efficient for unbalanced directory structures.
    pub fn walk_work_stealing(&self) -> Vec<WalkEntry> {
        if !self.root.exists() {
            return Vec::new();
        }

        let queue = Queue::global(QueuePriority::Default);
        let entries = Arc::new(Mutex::new(Vec::new()));
        let work_queue = Arc::new(Mutex::new(VecDeque::new()));

        // Add root entry
        if let Ok(meta) = self.root.symlink_metadata() {
            let is_symlink = meta.file_type().is_symlink();
            let (is_dir, is_file) = if is_symlink && self.options.follow_symlinks {
                match self.root.metadata() {
                    Ok(target_meta) => {
                        let ft = target_meta.file_type();
                        (ft.is_dir(), ft.is_file())
                    }
                    Err(_) => (false, false),
                }
            } else {
                let ft = meta.file_type();
                (ft.is_dir(), ft.is_file())
            };

            entries.lock().unwrap().push(WalkEntry {
                path: self.root.clone(),
                depth: 0,
                is_dir,
                is_file,
                is_symlink,
            });

            if is_dir {
                work_queue.lock().unwrap().push_back((self.root.clone(), 1));
            }
        }

        // Number of workers (use number of CPUs)
        let num_workers = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            .max(1);
        let active_workers = Arc::new(std::sync::atomic::AtomicUsize::new(num_workers));
        let done = Arc::new(std::sync::atomic::AtomicBool::new(false));

        // Clone options for workers
        let dot = self.options.dot;
        let follow_symlinks = self.options.follow_symlinks;
        let max_depth = self.options.max_depth;

        // Spawn workers using GCD
        queue.apply(num_workers, |_worker_id| {
            loop {
                // Try to get work
                let work = {
                    let mut wq = work_queue.lock().unwrap();
                    wq.pop_front()
                };

                match work {
                    Some((dir_path, depth)) => {
                        // Check depth limit
                        if max_depth.map(|m| depth > m).unwrap_or(false) {
                            continue;
                        }

                        // Read directory entries
                        let dir_entries = match read_dir_getattrlistbulk(&dir_path) {
                            Ok(e) => e,
                            Err(_) => read_dir_fast(&dir_path).unwrap_or_default(),
                        };

                        let mut local_entries = Vec::with_capacity(dir_entries.len());
                        let mut new_dirs = VecDeque::new();

                        for raw_entry in dir_entries {
                            let name_str = raw_entry.name.to_string_lossy();

                            if !dot && name_str.starts_with('.') {
                                continue;
                            }

                            let entry_path = dir_path.join(&raw_entry.name);

                            let (is_dir, is_file, is_symlink) =
                                if raw_entry.is_symlink && follow_symlinks {
                                    match entry_path.metadata() {
                                        Ok(target_meta) => {
                                            let ft = target_meta.file_type();
                                            (ft.is_dir(), ft.is_file(), true)
                                        }
                                        Err(_) => (false, false, true),
                                    }
                                } else {
                                    (raw_entry.is_dir, raw_entry.is_file, raw_entry.is_symlink)
                                };

                            local_entries.push(WalkEntry {
                                path: entry_path.clone(),
                                depth,
                                is_dir,
                                is_file,
                                is_symlink,
                            });

                            if is_dir && (follow_symlinks || !raw_entry.is_symlink) {
                                let should_recurse = match max_depth {
                                    Some(max) => depth < max,
                                    None => true,
                                };
                                if should_recurse {
                                    new_dirs.push_back((entry_path, depth + 1));
                                }
                            }
                        }

                        // Add collected entries
                        if !local_entries.is_empty() {
                            entries.lock().unwrap().extend(local_entries);
                        }

                        // Add new work
                        if !new_dirs.is_empty() {
                            work_queue.lock().unwrap().extend(new_dirs);
                        }
                    }
                    None => {
                        // No work available - check if we should exit
                        // Decrement active workers
                        let prev = active_workers.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
                        if prev == 1 {
                            // Last worker - check if work queue is really empty
                            if work_queue.lock().unwrap().is_empty() {
                                done.store(true, std::sync::atomic::Ordering::SeqCst);
                                return;
                            }
                        }

                        // Wait a bit and try again
                        std::thread::sleep(std::time::Duration::from_micros(100));

                        // Check if done
                        if done.load(std::sync::atomic::Ordering::SeqCst) {
                            return;
                        }

                        // Re-increment if still running
                        active_workers.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    }
                }
            }
        });

        match Arc::try_unwrap(entries) {
            Ok(mutex) => mutex.into_inner().unwrap(),
            Err(arc) => arc.lock().unwrap().clone(),
        }
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

        // Create test structure
        File::create(base.join("file1.txt")).unwrap();
        File::create(base.join("file2.txt")).unwrap();
        File::create(base.join(".hidden")).unwrap();

        fs::create_dir_all(base.join("subdir1")).unwrap();
        File::create(base.join("subdir1/a.txt")).unwrap();
        File::create(base.join("subdir1/b.txt")).unwrap();

        fs::create_dir_all(base.join("subdir2")).unwrap();
        File::create(base.join("subdir2/c.txt")).unwrap();

        fs::create_dir_all(base.join("deep/level1/level2")).unwrap();
        File::create(base.join("deep/level1/level2/file.txt")).unwrap();

        temp
    }

    #[test]
    fn test_gcd_walker_basic() {
        let temp = create_test_fixture();
        let walker = GcdWalker::new(temp.path().to_path_buf(), WalkOptions::default());
        let entries = walker.walk();

        // Should find all entries
        assert!(entries.iter().any(|e| e.path() == temp.path()));
        assert!(entries.iter().any(|e| e.path().ends_with("file1.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("file2.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("subdir1")));
        assert!(entries.iter().any(|e| e.path().ends_with("subdir2")));

        // Should NOT include dotfiles by default
        assert!(!entries.iter().any(|e| e.path().ends_with(".hidden")));
    }

    #[test]
    fn test_gcd_walker_with_dot() {
        let temp = create_test_fixture();
        let walker = GcdWalker::new(temp.path().to_path_buf(), WalkOptions::new().dot(true));
        let entries = walker.walk();

        // Should include dotfiles
        assert!(entries.iter().any(|e| e.path().ends_with(".hidden")));
    }

    #[test]
    fn test_gcd_walker_max_depth() {
        let temp = create_test_fixture();
        let walker = GcdWalker::new(
            temp.path().to_path_buf(),
            WalkOptions::new().max_depth(Some(1)),
        );
        let entries = walker.walk();

        // Should include depth 1 entries
        assert!(entries.iter().any(|e| e.path().ends_with("file1.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("subdir1")));

        // Should NOT include deeper entries
        assert!(!entries.iter().any(|e| e.path().ends_with("a.txt")));
        assert!(!entries
            .iter()
            .any(|e| e.path().ends_with("level2/file.txt")));
    }

    #[test]
    fn test_gcd_walker_nested() {
        let temp = create_test_fixture();
        let walker = GcdWalker::new(temp.path().to_path_buf(), WalkOptions::default());
        let entries = walker.walk();

        // Should find deeply nested files
        assert!(entries.iter().any(|e| e.path().ends_with("a.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("c.txt")));
        assert!(entries
            .iter()
            .any(|e| e.path().ends_with("deep/level1/level2/file.txt")));
    }

    #[test]
    fn test_gcd_walker_nonexistent() {
        let walker = GcdWalker::new(
            PathBuf::from("/nonexistent/path/that/does/not/exist"),
            WalkOptions::default(),
        );
        let entries = walker.walk();

        assert!(entries.is_empty());
    }

    #[test]
    fn test_gcd_walker_matches_serial() {
        let temp = create_test_fixture();

        // Walk with standard walker
        let serial_walker =
            crate::walker::Walker::new(temp.path().to_path_buf(), WalkOptions::default());
        let serial_entries: std::collections::HashSet<_> = serial_walker
            .walk_sync()
            .into_iter()
            .map(|e| e.path().to_path_buf())
            .collect();

        // Walk with GCD walker
        let gcd_walker = GcdWalker::new(temp.path().to_path_buf(), WalkOptions::default());
        let gcd_entries: std::collections::HashSet<_> = gcd_walker
            .walk()
            .into_iter()
            .map(|e| e.path().to_path_buf())
            .collect();

        // Results should match
        assert_eq!(serial_entries, gcd_entries);
    }

    #[test]
    fn test_gcd_work_stealing_basic() {
        let temp = create_test_fixture();
        let walker = GcdWalker::new(temp.path().to_path_buf(), WalkOptions::default());
        let entries = walker.walk_work_stealing();

        // Should find all entries
        assert!(entries.iter().any(|e| e.path() == temp.path()));
        assert!(entries.iter().any(|e| e.path().ends_with("file1.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("subdir1")));
    }

    #[test]
    fn test_gcd_work_stealing_matches_bfs() {
        let temp = create_test_fixture();

        let bfs_walker = GcdWalker::new(temp.path().to_path_buf(), WalkOptions::default());
        let bfs_entries: std::collections::HashSet<_> = bfs_walker
            .walk()
            .into_iter()
            .map(|e| e.path().to_path_buf())
            .collect();

        let ws_walker = GcdWalker::new(temp.path().to_path_buf(), WalkOptions::default());
        let ws_entries: std::collections::HashSet<_> = ws_walker
            .walk_work_stealing()
            .into_iter()
            .map(|e| e.path().to_path_buf())
            .collect();

        // Results should match
        assert_eq!(bfs_entries, ws_entries);
    }

    #[cfg(unix)]
    #[test]
    fn test_gcd_walker_symlinks() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create structure with symlink
        fs::create_dir_all(base.join("real")).unwrap();
        File::create(base.join("real/file.txt")).unwrap();
        symlink(base.join("real"), base.join("link")).unwrap();

        // Walk with follow_symlinks=true
        let walker = GcdWalker::new(base.to_path_buf(), WalkOptions::new().follow_symlinks(true));
        let entries = walker.walk();

        // Should find file through both paths
        assert!(entries.iter().any(|e| e.path().ends_with("real/file.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("link/file.txt")));
    }

    #[cfg(unix)]
    #[test]
    fn test_gcd_walker_broken_symlink() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create a broken symlink
        symlink("nonexistent-target", base.join("broken-link")).unwrap();
        File::create(base.join("real-file.txt")).unwrap();

        let walker = GcdWalker::new(base.to_path_buf(), WalkOptions::new().follow_symlinks(true));
        let entries = walker.walk();

        // Should find real file
        assert!(entries.iter().any(|e| e.path().ends_with("real-file.txt")));

        // Should find broken symlink
        let broken = entries.iter().find(|e| e.path().ends_with("broken-link"));
        assert!(broken.is_some());
        assert!(broken.unwrap().is_symlink());
    }
}
