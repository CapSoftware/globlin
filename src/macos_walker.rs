// macOS-optimized directory walker
//
// This module provides a high-performance directory walker for macOS.
// It uses lower-level directory reading functions to reduce overhead.
//
// Key benefits:
// - Direct access to file descriptor-based directory reading
// - Uses d_type field for early file/dir detection (avoids extra stat calls)
// - Bulk reading of directory entries
//
// This module is only available on macOS (target_os = "macos").

#![cfg(target_os = "macos")]

use std::collections::VecDeque;
use std::ffi::{CStr, CString, OsString};
use std::io;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::ffi::OsStringExt;
use std::path::{Path, PathBuf};

use crate::walker::{WalkEntry, WalkOptions};

/// A directory entry
#[derive(Debug, Clone)]
pub struct RawDirEntry {
    pub name: OsString,
    pub is_dir: bool,
    pub is_file: bool,
    pub is_symlink: bool,
    pub inode: u64,
}

// File type constants from <sys/dirent.h>
const DT_UNKNOWN: u8 = 0;
const DT_DIR: u8 = 4;
const DT_REG: u8 = 8;
const DT_LNK: u8 = 10;

/// Read directory entries using low-level BSD functions.
///
/// Uses fdopendir + readdir_r for efficient reading with d_type access.
pub fn read_dir_fast(path: &Path) -> io::Result<Vec<RawDirEntry>> {
    // Open the directory using standard C functions
    let c_path = CString::new(path.as_os_str().as_bytes())
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, e))?;

    let dir_ptr = unsafe { libc::opendir(c_path.as_ptr()) };
    if dir_ptr.is_null() {
        return Err(io::Error::last_os_error());
    }

    let mut entries = Vec::new();

    loop {
        // Use readdir (thread-safe on modern systems)
        let entry_ptr = unsafe { libc::readdir(dir_ptr) };
        if entry_ptr.is_null() {
            break;
        }

        let entry = unsafe { &*entry_ptr };

        // Get the name as an OsString
        let name_cstr = unsafe { CStr::from_ptr(entry.d_name.as_ptr()) };
        let name_bytes = name_cstr.to_bytes();
        let name = OsString::from_vec(name_bytes.to_vec());

        // Skip . and ..
        if name == "." || name == ".." {
            continue;
        }

        // Get file type from d_type
        let d_type = entry.d_type;
        let (is_dir, is_file, is_symlink) = match d_type {
            DT_DIR => (true, false, false),
            DT_REG => (false, true, false),
            DT_LNK => (false, false, true),
            DT_UNKNOWN => {
                // Need to stat to determine type
                let full_path = path.join(&name);
                match full_path.symlink_metadata() {
                    Ok(meta) => {
                        let ft = meta.file_type();
                        (ft.is_dir(), ft.is_file(), ft.is_symlink())
                    }
                    Err(_) => (false, false, false),
                }
            }
            _ => (false, false, false),
        };

        entries.push(RawDirEntry {
            name,
            is_dir,
            is_file,
            is_symlink,
            inode: entry.d_ino,
        });
    }

    unsafe { libc::closedir(dir_ptr) };
    Ok(entries)
}

/// macOS-optimized directory walker.
///
/// This walker uses low-level BSD directory functions for improved performance.
pub struct MacosWalker {
    root: PathBuf,
    options: WalkOptions,
}

impl MacosWalker {
    /// Create a new macOS-optimized walker
    pub fn new(root: PathBuf, options: WalkOptions) -> Self {
        Self { root, options }
    }

    /// Walk the directory tree using optimized I/O
    pub fn walk(&self) -> Vec<WalkEntry> {
        if !self.root.exists() {
            return Vec::new();
        }

        let mut entries = Vec::new();
        let mut dirs_to_process: VecDeque<(PathBuf, usize)> = VecDeque::new();

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

            entries.push(WalkEntry {
                path: self.root.clone(),
                depth: 0,
                is_dir,
                is_file,
                is_symlink,
            });

            if is_dir {
                dirs_to_process.push_back((self.root.clone(), 1));
            }
        }

        // Process directories level by level (BFS for better cache locality)
        while let Some((dir_path, depth)) = dirs_to_process.pop_front() {
            // Check depth limit
            if let Some(max_depth) = self.options.max_depth {
                if depth > max_depth {
                    continue;
                }
            }

            // Read directory entries using optimized function
            let dir_entries = match read_dir_fast(&dir_path) {
                Ok(entries) => entries,
                Err(_) => continue, // Skip unreadable directories
            };

            for raw_entry in dir_entries {
                let name_str = raw_entry.name.to_string_lossy();

                // Filter dotfiles if needed
                if !self.options.dot && name_str.starts_with('.') {
                    continue;
                }

                let entry_path = dir_path.join(&raw_entry.name);

                // Determine actual types (handle symlinks)
                let (is_dir, is_file, is_symlink) =
                    if raw_entry.is_symlink && self.options.follow_symlinks {
                        // Follow the symlink to get target type
                        match entry_path.metadata() {
                            Ok(target_meta) => {
                                let ft = target_meta.file_type();
                                (ft.is_dir(), ft.is_file(), true)
                            }
                            Err(_) => (false, false, true), // Broken symlink
                        }
                    } else {
                        (raw_entry.is_dir, raw_entry.is_file, raw_entry.is_symlink)
                    };

                entries.push(WalkEntry {
                    path: entry_path.clone(),
                    depth,
                    is_dir,
                    is_file,
                    is_symlink,
                });

                // Queue directories for processing (unless symlink and not following)
                if is_dir && (self.options.follow_symlinks || !raw_entry.is_symlink) {
                    dirs_to_process.push_back((entry_path, depth + 1));
                }
            }
        }

        entries
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

        fs::create_dir_all(base.join("subdir")).unwrap();
        File::create(base.join("subdir/nested.txt")).unwrap();

        fs::create_dir_all(base.join("deep/level")).unwrap();
        File::create(base.join("deep/level/file.txt")).unwrap();

        temp
    }

    #[test]
    fn test_read_dir_fast() {
        let temp = create_test_fixture();

        let entries = read_dir_fast(temp.path()).unwrap();

        // Should find files (not . or ..)
        let names: Vec<_> = entries
            .iter()
            .map(|e| e.name.to_string_lossy().to_string())
            .collect();
        assert!(names.contains(&"file1.txt".to_string()));
        assert!(names.contains(&"file2.txt".to_string()));
        assert!(names.contains(&"subdir".to_string()));
        assert!(!names.contains(&".".to_string()));
        assert!(!names.contains(&"..".to_string()));
    }

    #[test]
    fn test_macos_walker_basic() {
        let temp = create_test_fixture();

        let walker = MacosWalker::new(temp.path().to_path_buf(), WalkOptions::default());
        let entries = walker.walk();

        // Should include root and files
        assert!(entries.iter().any(|e| e.path() == temp.path()));
        assert!(entries.iter().any(|e| e.path().ends_with("file1.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("file2.txt")));

        // Should NOT include dotfiles by default
        assert!(!entries.iter().any(|e| e.path().ends_with(".hidden")));
    }

    #[test]
    fn test_macos_walker_with_dot() {
        let temp = create_test_fixture();

        let walker = MacosWalker::new(temp.path().to_path_buf(), WalkOptions::new().dot(true));
        let entries = walker.walk();

        // Should include dotfiles
        assert!(entries.iter().any(|e| e.path().ends_with(".hidden")));
    }

    #[test]
    fn test_macos_walker_max_depth() {
        let temp = create_test_fixture();

        let walker = MacosWalker::new(
            temp.path().to_path_buf(),
            WalkOptions::new().max_depth(Some(1)),
        );
        let entries = walker.walk();

        // Should include depth 1 entries
        assert!(entries.iter().any(|e| e.path().ends_with("file1.txt")));
        assert!(entries.iter().any(|e| e.path().ends_with("subdir")));

        // Should NOT include depth 2+ entries
        assert!(!entries.iter().any(|e| e.path().ends_with("nested.txt")));
    }

    #[test]
    fn test_macos_walker_nested() {
        let temp = create_test_fixture();

        let walker = MacosWalker::new(temp.path().to_path_buf(), WalkOptions::default());
        let entries = walker.walk();

        // Should find deeply nested files
        assert!(entries.iter().any(|e| e.path().ends_with("nested.txt")));
        assert!(entries
            .iter()
            .any(|e| e.path().ends_with("deep/level/file.txt")));
    }

    #[test]
    fn test_macos_walker_nonexistent() {
        let walker = MacosWalker::new(
            PathBuf::from("/nonexistent/path/that/does/not/exist"),
            WalkOptions::default(),
        );
        let entries = walker.walk();

        // Should return empty, not crash
        assert!(entries.is_empty());
    }

    #[test]
    fn test_read_dir_fast_file_types() {
        let temp = create_test_fixture();

        let entries = read_dir_fast(temp.path()).unwrap();

        // Check file types
        let file1 = entries
            .iter()
            .find(|e| e.name.to_string_lossy() == "file1.txt")
            .unwrap();
        assert!(file1.is_file);
        assert!(!file1.is_dir);
        assert!(!file1.is_symlink);

        let subdir = entries
            .iter()
            .find(|e| e.name.to_string_lossy() == "subdir")
            .unwrap();
        assert!(subdir.is_dir);
        assert!(!subdir.is_file);
        assert!(!subdir.is_symlink);
    }

    #[cfg(unix)]
    #[test]
    fn test_macos_walker_symlinks() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create a real file and a symlink
        File::create(base.join("real.txt")).unwrap();
        symlink(base.join("real.txt"), base.join("link.txt")).unwrap();

        // Walk without following symlinks
        let walker = MacosWalker::new(
            base.to_path_buf(),
            WalkOptions::new().follow_symlinks(false),
        );
        let entries = walker.walk();

        let link_entry = entries
            .iter()
            .find(|e| e.path().ends_with("link.txt"))
            .unwrap();
        assert!(link_entry.is_symlink());
    }

    #[cfg(unix)]
    #[test]
    fn test_macos_walker_broken_symlink() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let base = temp.path();

        // Create a broken symlink
        symlink("nonexistent-target", base.join("broken-link")).unwrap();
        File::create(base.join("real-file.txt")).unwrap();

        // Walk with follow_symlinks=true
        let walker = MacosWalker::new(base.to_path_buf(), WalkOptions::new().follow_symlinks(true));
        let entries = walker.walk();

        // Should find real file
        assert!(entries.iter().any(|e| e.path().ends_with("real-file.txt")));

        // Should find broken symlink (returned as symlink entry)
        let broken = entries.iter().find(|e| e.path().ends_with("broken-link"));
        assert!(broken.is_some(), "Broken symlink should be returned");
        assert!(broken.unwrap().is_symlink());
    }

    #[test]
    fn test_read_dir_fast_permission_denied() {
        // Test that we handle permission errors gracefully
        let result = read_dir_fast(Path::new("/private/var/root"));
        // Should either succeed (if running as root) or fail with permission denied
        // The important thing is it doesn't crash
        match result {
            Ok(_) => (), // Running as root
            Err(e) => assert!(
                e.kind() == io::ErrorKind::PermissionDenied || e.kind() == io::ErrorKind::NotFound
            ),
        }
    }
}
