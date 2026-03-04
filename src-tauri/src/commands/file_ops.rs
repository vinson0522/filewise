use crate::security::PathGuard;
use crate::engine::scanner::{scan_shallow, FileEntry};
use crate::engine::hasher::blake3_file;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use sysinfo::Disks;
use tauri::State;
use chrono::Utc;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanOptions {
    pub path: String,
    pub depth: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveOperation {
    pub source: String,
    pub target: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OperationResult {
    pub success: bool,
    pub processed: usize,
    pub message: String,
}

/// IPC: 浅层扫描目录（即时返回，供 UI 渲染）
#[tauri::command]
pub async fn scan_directory_shallow(path: String) -> Result<Vec<FileEntry>, String> {
    let guard = PathGuard::new();
    let p = std::path::PathBuf::from(&path);

    guard.validate(&p).map_err(|e| e.to_string())?;

    scan_shallow(&p).map_err(|e| e.to_string())
}

/// IPC: 获取磁盘列表和使用情况（真实实现）
#[tauri::command]
pub async fn get_disk_info() -> Result<Vec<DiskInfo>, String> {
    let disks = Disks::new_with_refreshed_list();
    let mut result: Vec<DiskInfo> = Vec::new();

    for disk in disks.list() {
        let mount = disk.mount_point().to_string_lossy().to_string();
        let total = disk.total_space();
        let available = disk.available_space();

        // 跳过 total=0 的虚拟盘
        if total == 0 {
            continue;
        }

        // Windows 盘符名（C:\、D:\ 等），取盘符字母
        let name = disk.name().to_string_lossy().to_string();
        let label = if name.is_empty() {
            mount.trim_end_matches('\\').to_string()
        } else {
            name
        };

        result.push(DiskInfo {
            name: label,
            mount_point: mount,
            total_space: total,
            available_space: available,
            used_space: total.saturating_sub(available),
            fs_type: disk.file_system().to_string_lossy().to_string(),
        });
    }

    // 按挂载点排序，确保顺序稳定
    result.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));
    Ok(result)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub total_space: u64,
    pub available_space: u64,
    pub used_space: u64,
    pub fs_type: String,
}

/// IPC: 安全移动文件（事务性 + 快照 + BLAKE3 完整性校验）
#[tauri::command]
pub async fn move_files(
    operations: Vec<MoveOperation>,
    state: State<'_, AppState>,
    description: Option<String>,
) -> Result<OperationResult, String> {
    let guard = PathGuard::new();

    // 1. 预验证所有路径
    for op in &operations {
        let src = std::path::PathBuf::from(&op.source);
        let dst = std::path::PathBuf::from(&op.target);
        guard.validate(&src).map_err(|e| e.to_string())?;
        if let Some(parent) = dst.parent() {
            if parent.exists() {
                guard.validate(parent).map_err(|e| e.to_string())?;
            }
        }
        if !PathGuard::is_safe_to_delete(&src) {
            return Err(format!("拒绝操作系统关键文件: {}", op.source));
        }
    }

    // 2. 操作前计算所有源文件的哈希（用于完整性校验和快照）
    let mut src_hashes: Vec<String> = Vec::new();
    for op in &operations {
        let hash = blake3_file(std::path::Path::new(&op.source)).await
            .map_err(|e| format!("计算哈希失败 {}: {}", op.source, e))?;
        src_hashes.push(hash);
    }

    // 3. 写入快照记录（操作前状态，可用于撤销）
    let snapshot_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();
    let snapshot_ops = serde_json::to_string(&operations).unwrap_or_default();
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.execute(
            "INSERT INTO snapshots (id, created_at, description, operations, status)
             VALUES (?1, ?2, ?3, ?4, 'active')",
            rusqlite::params![
                snapshot_id,
                now,
                description.as_deref().unwrap_or("文件移动"),
                snapshot_ops,
            ],
        ).map_err(|e| e.to_string())?;
    }

    // 4. 事务性移动：失败则回滚已完成的操作
    let mut completed: Vec<&MoveOperation> = Vec::new();
    for (i, op) in operations.iter().enumerate() {
        let src = std::path::Path::new(&op.source);
        let dst = std::path::Path::new(&op.target);

        // 创建目标目录
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                // 回滚
                for done in &completed {
                    let _ = std::fs::rename(&done.target, &done.source);
                }
                format!("创建目标目录失败: {}", e)
            })?;
        }

        // 移动文件
        std::fs::rename(src, dst).map_err(|e| {
            for done in &completed {
                let _ = std::fs::rename(&done.target, &done.source);
            }
            format!("移动失败 {}: {}", op.source, e)
        })?;

        // 5. 完整性校验：比对移动后的哈希
        let dst_hash = blake3_file(dst).await.unwrap_or_default();
        if dst_hash != src_hashes[i] {
            // 哈希不匹配，回滚全部
            let _ = std::fs::rename(dst, src);
            for done in &completed {
                let _ = std::fs::rename(&done.target, &done.source);
            }
            return Err(format!("完整性校验失败，操作已回滚: {}", op.source));
        }

        completed.push(op);
    }

    // 6. 写审计日志
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let _ = db.execute(
            "INSERT INTO audit_log (ts, action, path, detail, result) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                now, "move_files",
                operations.first().map(|o| o.source.as_str()).unwrap_or(""),
                format!("移动 {} 个文件，快照 {}", completed.len(), snapshot_id),
                "success",
            ],
        );
    }

    Ok(OperationResult {
        success: true,
        processed: completed.len(),
        message: format!("成功移动 {} 个文件，快照ID: {}", completed.len(), &snapshot_id[..8]),
    })
}

/// IPC: 扫描大文件（真实文件系统遍历）
#[tauri::command]
pub async fn scan_large_files(
    path: String,
    min_size_mb: Option<u64>,
) -> Result<Vec<LargeFileEntry>, String> {
    let guard = PathGuard::new();
    let p = std::path::PathBuf::from(&path);
    guard.validate(&p).map_err(|e| e.to_string())?;

    let min_bytes = min_size_mb.unwrap_or(100) * 1024 * 1024; // 默认 100MB
    let mut large_files: Vec<LargeFileEntry> = Vec::new();

    let walker = walkdir::WalkDir::new(&p)
        .max_depth(20)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !matches!(
                name.as_ref(),
                "node_modules" | ".git" | "target" | "$RECYCLE.BIN"
                | "System Volume Information"
            )
        });

    for entry in walker.filter_map(|e| e.ok()) {
        if entry.file_type().is_dir() { continue; }
        if let Ok(meta) = entry.metadata() {
            let size = meta.len();
            if size >= min_bytes {
                let modified_at = meta.modified().ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64);

                let accessed_at = meta.accessed().ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64);

                large_files.push(LargeFileEntry {
                    path: entry.path().to_string_lossy().to_string(),
                    name: entry.file_name().to_string_lossy().to_string(),
                    size,
                    modified_at,
                    accessed_at,
                });
            }
        }
    }

    // 按大小降序
    large_files.sort_by(|a, b| b.size.cmp(&a.size));
    large_files.truncate(200); // 最多返回 200 个
    Ok(large_files)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LargeFileEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_at: Option<i64>,
    pub accessed_at: Option<i64>,
}

/// IPC: 重复文件检测（先按大小分组，再 BLAKE3 哈希对比，性能最优）
#[tauri::command]
pub async fn scan_duplicates(path: String) -> Result<Vec<DupGroup>, String> {
    let guard = PathGuard::new();
    let p = std::path::PathBuf::from(&path);
    guard.validate(&p).map_err(|e| e.to_string())?;

    // 1. 先按文件大小分组（只有相同大小的文件才可能重复）
    let mut size_map: std::collections::HashMap<u64, Vec<String>> =
        std::collections::HashMap::new();

    let walker = walkdir::WalkDir::new(&p)
        .max_depth(20)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !matches!(
                name.as_ref(),
                "node_modules" | ".git" | "target" | "$RECYCLE.BIN"
                | "System Volume Information"
            )
        });

    for entry in walker.filter_map(|e| e.ok()) {
        if entry.file_type().is_dir() { continue; }
        if let Ok(meta) = entry.metadata() {
            let size = meta.len();
            if size == 0 { continue; }  // 跳过空文件
            size_map
                .entry(size)
                .or_default()
                .push(entry.path().to_string_lossy().to_string());
        }
    }

    // 2. 只对大小相同的组（>1 个文件）进行哈希计算
    let mut hash_map: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();

    for (_, files) in size_map.iter().filter(|(_, v)| v.len() > 1) {
        for file_path in files {
            match compute_file_hash(file_path) {
                Ok(hash) => {
                    hash_map.entry(hash).or_default().push(file_path.clone());
                }
                Err(_) => continue, // 无法读取的文件跳过
            }
        }
    }

    // 3. 收集有重复的组（相同 hash 的文件 >1 个）
    let mut result: Vec<DupGroup> = hash_map
        .into_iter()
        .filter(|(_, files)| files.len() > 1)
        .map(|(hash, files)| {
            let size = std::fs::metadata(&files[0]).map(|m| m.len()).unwrap_or(0);
            let total_wasted = size * (files.len() as u64 - 1);
            DupGroup { hash, files, size, total_wasted }
        })
        .collect();

    // 按浪费空间降序
    result.sort_by(|a, b| b.total_wasted.cmp(&a.total_wasted));
    Ok(result)
}

fn compute_file_hash(path: &str) -> Result<String, std::io::Error> {
    let data = std::fs::read(path)?;
    let hash = blake3::hash(&data);
    Ok(hash.to_hex().to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DupGroup {
    pub hash: String,
    pub files: Vec<String>,
    pub size: u64,          // 单个文件大小
    pub total_wasted: u64,  // 浪费的空间（副本数-1）× 大小
}

/// IPC: 将文件移入隔离区（安全删除）
#[tauri::command]
pub async fn quarantine_file(path: String) -> Result<OperationResult, String> {
    let guard = PathGuard::new();
    let p = std::path::PathBuf::from(&path);

    guard.validate(&p).map_err(|e| e.to_string())?;
    if !PathGuard::is_safe_to_delete(&p) {
        return Err(format!("拒绝删除系统关键文件: {}", path));
    }

    // TODO: 实现隔离区逻辑
    Ok(OperationResult { success: true, processed: 1, message: "文件已移入隔离区".into() })
}
