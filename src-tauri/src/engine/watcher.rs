// 文件系统监听模块（增量索引）
// 通过 notify crate 监听文件变更事件，触发增量索引更新

/// 监听状态（占位结构，后续实现 notify 集成）
pub struct FileWatcher {
    pub watch_paths: Vec<String>,
}

impl FileWatcher {
    pub fn new() -> Self {
        Self { watch_paths: vec![] }
    }

    pub fn add_path(&mut self, path: String) {
        self.watch_paths.push(path);
    }
}

impl Default for FileWatcher {
    fn default() -> Self {
        Self::new()
    }
}
