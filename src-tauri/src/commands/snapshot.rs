use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct SnapshotInfo {
    pub id: String,
    pub created_at: i64,
    pub description: String,
    pub file_count: usize,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct MoveOp {
    source: String,
    target: String,
}

/// IPC: 获取快照列表（从数据库读取真实数据）
#[tauri::command]
pub async fn list_snapshots(state: State<'_, AppState>) -> Result<Vec<SnapshotInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, created_at, description, operations, status
         FROM snapshots WHERE status = 'active'
         ORDER BY created_at DESC LIMIT 50"
    ).map_err(|e| e.to_string())?;

    let snapshots = stmt.query_map([], |row| {
        let ops_json: String = row.get(3)?;
        let file_count = serde_json::from_str::<Vec<serde_json::Value>>(&ops_json)
            .map(|v| v.len()).unwrap_or(0);
        Ok(SnapshotInfo {
            id: row.get(0)?,
            created_at: row.get(1)?,
            description: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            file_count,
            status: row.get(4)?,
        })
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(snapshots)
}

/// IPC: 从快照恢复（将文件移回原位）
#[tauri::command]
pub async fn restore_snapshot(
    snapshot_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // 读取快照操作记录
    let ops_json: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT operations FROM snapshots WHERE id = ?1 AND status = 'active'",
            rusqlite::params![snapshot_id],
            |row| row.get(0),
        ).map_err(|e| format!("快照不存在或已失效: {}", e))?
    };

    let ops: Vec<MoveOp> = serde_json::from_str(&ops_json)
        .map_err(|e| format!("快照数据解析失败: {}", e))?;

    // 反向执行：source ↔ target 互换
    let mut restored = 0usize;
    let mut failed: Vec<String> = Vec::new();
    for op in &ops {
        if std::path::Path::new(&op.target).exists() {
            match std::fs::rename(&op.target, &op.source) {
                Ok(_) => restored += 1,
                Err(e) => failed.push(format!("{}: {}", op.target, e)),
            }
        }
    }

    // 标记快照为已恢复
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let _ = db.execute(
            "UPDATE snapshots SET status = 'restored' WHERE id = ?1",
            rusqlite::params![snapshot_id],
        );
    }

    if failed.is_empty() {
        Ok(format!("成功恢复 {} 个文件", restored))
    } else {
        Ok(format!("恢复 {} 个文件，{} 个失败: {}", restored, failed.len(), failed.join("; ")))
    }
}

/// IPC: 删除快照
#[tauri::command]
pub async fn delete_snapshot(
    snapshot_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let affected = db.execute(
        "DELETE FROM snapshots WHERE id = ?1",
        rusqlite::params![snapshot_id],
    ).map_err(|e| e.to_string())?;

    if affected > 0 {
        Ok(format!("快照 {} 已删除", &snapshot_id[..8]))
    } else {
        Err("快照不存在".into())
    }
}
