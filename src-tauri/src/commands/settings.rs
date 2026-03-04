use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: i64,
    pub ts: i64,
    pub action: String,
    pub path: String,
    pub detail: String,
    pub result: String,
}

/// IPC: 获取审计日志（最近 200 条）
#[tauri::command]
pub async fn list_audit_log(state: State<'_, AppState>) -> Result<Vec<AuditEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, ts, action, COALESCE(path,''), COALESCE(detail,''), result
         FROM audit_log ORDER BY ts DESC LIMIT 200"
    ).map_err(|e| e.to_string())?;

    let entries = stmt.query_map([], |row| {
        Ok(AuditEntry {
            id: row.get(0)?,
            ts: row.get(1)?,
            action: row.get(2)?,
            path: row.get(3)?,
            detail: row.get(4)?,
            result: row.get(5)?,
        })
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(entries)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub local_ai: bool,
    pub auto_organize: bool,
    pub snapshot_before_op: bool,
    pub auto_start: bool,
    pub minimize_to_tray: bool,
    pub excluded_paths: Vec<String>,
    pub large_file_threshold_mb: u64,
    pub ai_model: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            local_ai: true,
            auto_organize: false,
            snapshot_before_op: true,
            auto_start: false,
            minimize_to_tray: true,
            excluded_paths: vec![
                "C:\\Windows".into(),
                "C:\\Program Files".into(),
                "C:\\Program Files (x86)".into(),
            ],
            large_file_threshold_mb: 100,
            ai_model: "qwen2.5:7b".into(),
        }
    }
}

/// IPC: 读取所有设置（从数据库，缺失则返回默认值）
#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let json: Option<String> = db.query_row(
        "SELECT value FROM settings WHERE key = 'app_settings'",
        [],
        |row| row.get(0),
    ).ok();

    match json {
        Some(j) => serde_json::from_str::<AppSettings>(&j)
            .map_err(|e| format!("设置解析失败: {}", e)),
        None => Ok(AppSettings::default()),
    }
}

/// IPC: 保存所有设置到数据库
#[tauri::command]
pub async fn save_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let json = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO settings (key, value) VALUES ('app_settings', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![json],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
