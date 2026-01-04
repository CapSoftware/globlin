// Directory walking and filesystem traversal

use std::path::{Path, PathBuf};
use walkdir::{DirEntry, WalkDir};

/// Options for directory walking
#[derive(Debug, Clone, Default)]
pub struct WalkOptions {
    /// Follow symbolic links
    pub follow_symlinks: bool,
    /// Maximum depth to traverse (None = unlimited)
    pub max_depth: Option<usize>,
    /// Include dotfiles (files starting with .)
    pub dot: bool,
}

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
    pub fn from_dir_entry(entry: &DirEntry) -> Self {
        let file_type = entry.file_type();
        Self {
            path: entry.path().to_path_buf(),
            depth: entry.depth(),
            is_dir: file_type.is_dir(),
            is_file: file_type.is_file(),
            is_symlink: file_type.is_symlink(),
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
}

/// Directory walker that can traverse filesystem trees
pub struct Walker {
    root: PathBuf,
    options: WalkOptions,
}

impl Walker {
    pub fn new(root: PathBuf, options: WalkOptions) -> Self {
        Self { root, options }
    }

    /// Create a walker with default options
    pub fn with_root(root: PathBuf) -> Self {
        Self::new(root, WalkOptions::default())
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn options(&self) -> &WalkOptions {
        &self.options
    }

    /// Walk the directory tree, returning an iterator over entries
    pub fn walk(&self) -> impl Iterator<Item = WalkEntry> + '_ {
        let mut walker = WalkDir::new(&self.root).follow_links(self.options.follow_symlinks);

        if let Some(max_depth) = self.options.max_depth {
            walker = walker.max_depth(max_depth);
        }

        let dot = self.options.dot;

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
            .filter_map(|result| {
                match result {
                    Ok(entry) => Some(WalkEntry::from_dir_entry(&entry)),
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
            })
    }

    /// Walk the directory tree synchronously, collecting all entries
    pub fn walk_sync(&self) -> Vec<WalkEntry> {
        self.walk().collect()
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
}
