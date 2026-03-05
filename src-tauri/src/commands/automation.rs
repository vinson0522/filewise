use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;

// ——————————————————————————————————————————————
// 数据结构
// ——————————————————————————————————————————————

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AutomationRule {
    pub id: i64,
    pub name: String,
    pub trigger_type: String,       // 'file_created' | 'schedule' | 'disk_threshold'
    pub trigger_config: String,     // JSON
    pub action_type: String,        // 'move' | 'clean' | 'tag' | 'encrypt' | 'notify' | 'quarantine'
    pub action_config: String,      // JSON
    pub enabled: bool,
    pub last_run: Option<String>,
    pub run_count: i64,
    pub created_at: String,
}

fn ensure_automation_table(state: &AppState) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute_batch("
        CREATE TABLE IF NOT EXISTS automation_rules (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            trigger_type    TEXT NOT NULL,
            trigger_config  TEXT NOT NULL DEFAULT '{}',
            action_type     TEXT NOT NULL,
            action_config   TEXT NOT NULL DEFAULT '{}',
            enabled         INTEGER NOT NULL DEFAULT 1,
            last_run        TEXT,
            run_count       INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
    ").map_err(|e| e.to_string())?;
    Ok(())
}

// ——————————————————————————————————————————————
// IPC: 创建自动化规则
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn create_automation_rule(
    name: String,
    trigger_type: String,
    trigger_config: String,
    action_type: String,
    action_config: String,
    state: State<'_, AppState>,
) -> Result<AutomationRule, String> {
    ensure_automation_table(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![name, trigger_type, trigger_config, action_type, action_config],
    ).map_err(|e| e.to_string())?;

    let id = db.last_insert_rowid();
    let rule = db.query_row(
        "SELECT id, name, trigger_type, trigger_config, action_type, action_config, enabled, last_run, run_count, created_at
         FROM automation_rules WHERE id = ?1",
        [id],
        |r| Ok(AutomationRule {
            id: r.get(0)?,
            name: r.get(1)?,
            trigger_type: r.get(2)?,
            trigger_config: r.get(3)?,
            action_type: r.get(4)?,
            action_config: r.get(5)?,
            enabled: r.get::<_, i64>(6)? != 0,
            last_run: r.get(7)?,
            run_count: r.get(8)?,
            created_at: r.get(9)?,
        }),
    ).map_err(|e| e.to_string())?;
    Ok(rule)
}

// ——————————————————————————————————————————————
// IPC: 列出所有规则
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn list_automation_rules(
    state: State<'_, AppState>,
) -> Result<Vec<AutomationRule>, String> {
    ensure_automation_table(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, name, trigger_type, trigger_config, action_type, action_config, enabled, last_run, run_count, created_at
         FROM automation_rules ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;

    let rows: Vec<AutomationRule> = stmt.query_map([], |r| {
        Ok(AutomationRule {
            id: r.get(0)?,
            name: r.get(1)?,
            trigger_type: r.get(2)?,
            trigger_config: r.get(3)?,
            action_type: r.get(4)?,
            action_config: r.get(5)?,
            enabled: r.get::<_, i64>(6)? != 0,
            last_run: r.get(7)?,
            run_count: r.get(8)?,
            created_at: r.get(9)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(rows)
}

// ——————————————————————————————————————————————
// IPC: 切换规则启用状态
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn toggle_automation_rule(
    id: i64,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    ensure_automation_table(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE automation_rules SET enabled = ?1 WHERE id = ?2",
        rusqlite::params![enabled as i64, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ——————————————————————————————————————————————
// IPC: 删除规则
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn delete_automation_rule(
    id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    ensure_automation_table(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM automation_rules WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ——————————————————————————————————————————————
// IPC: 更新规则运行状态（Agent 执行后调用）
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn mark_rule_executed(
    id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    ensure_automation_table(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE automation_rules SET last_run = datetime('now','localtime'), run_count = run_count + 1 WHERE id = ?1",
        [id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ——————————————————————————————————————————————
// IPC: 获取主动建议（基于系统状态分析）
// ——————————————————————————————————————————————

#[derive(Debug, Serialize, Deserialize)]
pub struct Suggestion {
    pub r#type: String,     // 'warning' | 'info' | 'tip'
    pub title: String,
    pub message: String,
    pub action: Option<String>,  // tool name to execute
    pub priority: i32,           // 0=low, 1=medium, 2=high
}

#[tauri::command]
pub async fn get_proactive_suggestions(
    state: State<'_, AppState>,
) -> Result<Vec<Suggestion>, String> {
    let mut suggestions: Vec<Suggestion> = Vec::new();

    // 1. 磁盘空间预警
    let disks = sysinfo::Disks::new_with_refreshed_list();
    for d in disks.list() {
        let total = d.total_space();
        let avail = d.available_space();
        if total == 0 { continue; }
        let pct = ((total - avail) as f64 / total as f64 * 100.0) as i32;
        if pct > 90 {
            suggestions.push(Suggestion {
                r#type: "warning".into(),
                title: format!("{} 空间严重不足（{}%）", d.mount_point().display(), pct),
                message: format!("仅剩 {:.1}GB 可用空间，建议立即清理。", avail as f64 / 1e9),
                action: Some("scan_clean".into()),
                priority: 2,
            });
        } else if pct > 80 {
            suggestions.push(Suggestion {
                r#type: "info".into(),
                title: format!("{} 空间偏紧（{}%）", d.mount_point().display(), pct),
                message: format!("剩余 {:.1}GB，建议定期清理。", avail as f64 / 1e9),
                action: Some("scan_clean".into()),
                priority: 1,
            });
        }
    }

    // 2. 索引状态检查
    if let Ok(db) = state.db.lock() {
        // 检查是否有索引
        if let Ok(cnt) = db.query_row::<i64, _, _>(
            "SELECT COUNT(*) FROM file_index", [], |r| r.get(0)
        ) {
            if cnt == 0 {
                suggestions.push(Suggestion {
                    r#type: "tip".into(),
                    title: "尚未建立文件索引".into(),
                    message: "建议对常用目录建立索引，以便快速搜索文件。".into(),
                    action: Some("get_index_stats".into()),
                    priority: 1,
                });
            }
        }

        // 3. 隔离区即将过期
        let now = chrono::Utc::now().timestamp();
        let soon = now + 3 * 86400; // 3天内
        if let Ok(cnt) = db.query_row::<i64, _, _>(
            "SELECT COUNT(*) FROM quarantine WHERE expires_at BETWEEN ?1 AND ?2",
            rusqlite::params![now, soon], |r| r.get(0)
        ) {
            if cnt > 0 {
                suggestions.push(Suggestion {
                    r#type: "info".into(),
                    title: format!("{} 个隔离文件即将过期", cnt),
                    message: "过期后将被永久删除，如需保留请尽快恢复。".into(),
                    action: Some("list_quarantine".into()),
                    priority: 1,
                });
            }
        }

        // 4. 长时间未检查健康
        if let Ok(last_ts) = db.query_row::<i64, _, _>(
            "SELECT COALESCE(MAX(ts), 0) FROM audit_log WHERE action = 'health_check'", [], |r| r.get(0)
        ) {
            if now - last_ts > 7 * 86400 {
                suggestions.push(Suggestion {
                    r#type: "tip".into(),
                    title: "超过 7 天未进行健康检查".into(),
                    message: "建议定期检查系统健康状态。".into(),
                    action: Some("health_check".into()),
                    priority: 0,
                });
            }
        }

        // 5. 审计日志统计 - 最近活跃度
        if let Ok(recent) = db.query_row::<i64, _, _>(
            "SELECT COUNT(*) FROM audit_log WHERE ts > ?1",
            [now - 86400], |r| r.get(0)
        ) {
            if recent > 50 {
                suggestions.push(Suggestion {
                    r#type: "info".into(),
                    title: format!("今日操作频繁（{} 次）", recent),
                    message: "可以查看操作报告了解详情。".into(),
                    action: Some("navigate".into()),
                    priority: 0,
                });
            }
        }
    }

    // 按优先级排序
    suggestions.sort_by(|a, b| b.priority.cmp(&a.priority));
    Ok(suggestions)
}
