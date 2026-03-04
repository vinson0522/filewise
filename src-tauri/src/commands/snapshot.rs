use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SnapshotInfo {
    pub id: String,
    pub created_at: i64,
    pub description: String,
    pub file_count: usize,
    pub status: String,
}

/// IPC: 获取快照列表
#[tauri::command]
pub async fn list_snapshots() -> Result<Vec<SnapshotInfo>, String> {
    // TODO: 从数据库读取
    Ok(vec![])
}

/// IPC: 从快照恢复操作
#[tauri::command]
pub async fn restore_snapshot(snapshot_id: String) -> Result<String, String> {
    // TODO: 实现快照恢复逻辑
    Ok(format!("快照 {} 已恢复", snapshot_id))
}

/// IPC: 删除快照
#[tauri::command]
pub async fn delete_snapshot(snapshot_id: String) -> Result<String, String> {
    // TODO: 从数据库删除
    Ok(format!("快照 {} 已删除", snapshot_id))
}
