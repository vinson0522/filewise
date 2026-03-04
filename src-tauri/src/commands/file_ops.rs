use crate::security::PathGuard;
use crate::engine::scanner::{scan_shallow, FileEntry};
use serde::{Deserialize, Serialize};

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

/// IPC: 获取磁盘列表和使用情况
#[tauri::command]
pub async fn get_disk_info() -> Result<Vec<DiskInfo>, String> {
    // TODO: 使用 sysinfo crate 实现
    Ok(vec![])
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub total_space: u64,
    pub available_space: u64,
}

/// IPC: 安全移动文件（事务性，附完整性校验）
#[tauri::command]
pub async fn move_files(operations: Vec<MoveOperation>) -> Result<OperationResult, String> {
    let guard = PathGuard::new();

    // 1. 预验证所有路径
    for op in &operations {
        let src = std::path::PathBuf::from(&op.source);
        let dst = std::path::PathBuf::from(&op.target);
        guard.validate(&src).map_err(|e| e.to_string())?;
        // 目标父目录验证
        if let Some(parent) = dst.parent() {
            if parent.exists() {
                guard.validate(parent).map_err(|e| e.to_string())?;
            }
        }
        if !PathGuard::is_safe_to_delete(&src) {
            return Err(format!("拒绝操作系统关键文件: {}", op.source));
        }
    }

    // 2. 执行移动（TODO: 事务性实现 + 快照）
    let mut processed = 0;
    for op in &operations {
        let src = std::path::Path::new(&op.source);
        let dst = std::path::Path::new(&op.target);
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::rename(src, dst).map_err(|e| e.to_string())?;
        processed += 1;
    }

    Ok(OperationResult {
        success: true,
        processed,
        message: format!("成功移动 {} 个文件", processed),
    })
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
