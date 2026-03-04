use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

const DEFAULT_BATCH_SIZE: usize = 1000;
const MAX_DEPTH: usize = 10;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub extension: Option<String>,
    pub size: u64,
    pub modified_at: Option<i64>,
    pub is_dir: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    pub entries: Vec<FileEntry>,
    pub total_files: usize,
    pub total_size: u64,
    pub skipped: usize,
}

/// 浅层扫描（仅顶级，用于即时显示）
pub fn scan_shallow(path: &Path) -> Result<Vec<FileEntry>> {
    let mut entries = Vec::new();
    for entry in WalkDir::new(path).min_depth(1).max_depth(1) {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if let Some(fe) = entry_to_file_entry(&entry) {
            entries.push(fe);
        }
    }
    Ok(entries)
}

/// 分批扫描（异步，后台建索引）
/// 每批回调 callback，避免全量加载到内存
pub fn scan_batched<F>(path: &Path, depth: usize, mut callback: F) -> Result<ScanResult>
where
    F: FnMut(Vec<FileEntry>),
{
    let safe_depth = depth.min(MAX_DEPTH);
    let mut batch = Vec::with_capacity(DEFAULT_BATCH_SIZE);
    let mut total_files = 0usize;
    let mut total_size = 0u64;
    let mut skipped = 0usize;

    let walker = WalkDir::new(path)
        .max_depth(safe_depth)
        .follow_links(false)  // 禁止跟随符号链接（安全）
        .into_iter()
        .filter_entry(|e| !is_excluded(e.path()));

    for result in walker {
        let entry = match result {
            Ok(e) => e,
            Err(_) => { skipped += 1; continue; }
        };

        if entry.file_type().is_dir() {
            continue;
        }

        if let Some(fe) = entry_to_file_entry(&entry) {
            total_size += fe.size;
            total_files += 1;
            batch.push(fe);

            if batch.len() >= DEFAULT_BATCH_SIZE {
                callback(batch.drain(..).collect());
            }
        }
    }

    // 处理最后一批
    if !batch.is_empty() {
        callback(batch.drain(..).collect());
    }

    Ok(ScanResult { entries: vec![], total_files, total_size, skipped })
}

fn entry_to_file_entry(entry: &walkdir::DirEntry) -> Option<FileEntry> {
    let path = entry.path();
    let meta = entry.metadata().ok()?;
    let name = path.file_name()?.to_string_lossy().into_owned();
    let extension = path.extension().map(|e| e.to_string_lossy().into_owned());
    let modified_at = meta.modified().ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64);

    Some(FileEntry {
        path: path.to_string_lossy().into_owned(),
        name,
        extension,
        size: meta.len(),
        modified_at,
        is_dir: meta.is_dir(),
    })
}

/// 跳过无需扫描的目录
fn is_excluded(path: &Path) -> bool {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    matches!(
        name.as_ref(),
        "node_modules" | ".git" | ".svn" | "__pycache__"
        | "target" | ".gradle" | ".tox" | ".venv"
        | "$RECYCLE.BIN" | "System Volume Information"
    )
}
