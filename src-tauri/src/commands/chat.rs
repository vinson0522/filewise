use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;

// ——————————————————————————————————————————————
// 数据结构
// ——————————————————————————————————————————————

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessageRecord {
    pub id: i64,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub tool_name: Option<String>,
    pub tool_result: Option<String>,
    pub widget_type: Option<String>,
    pub widget_data: Option<String>,
    pub created_at: String,
}

fn ensure_chat_tables(state: &AppState) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute_batch("
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS chat_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT NOT NULL,
            role        TEXT NOT NULL,
            content     TEXT NOT NULL,
            tool_name   TEXT,
            tool_result TEXT,
            widget_type TEXT,
            widget_data TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chat_msg_session ON chat_messages(session_id);
    ").map_err(|e| e.to_string())?;
    Ok(())
}

// ——————————————————————————————————————————————
// IPC: 创建会话
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn create_chat_session(
    title: Option<String>,
    state: State<'_, AppState>,
) -> Result<ChatSession, String> {
    ensure_chat_tables(&state)?;
    let id = uuid::Uuid::new_v4().to_string();
    let t = title.unwrap_or_else(|| "新对话".to_string());
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO chat_sessions (id, title) VALUES (?1, ?2)",
        rusqlite::params![id, t],
    ).map_err(|e| e.to_string())?;

    let session = db.query_row(
        "SELECT id, title, created_at, updated_at FROM chat_sessions WHERE id = ?1",
        [&id],
        |r| Ok(ChatSession {
            id: r.get(0)?,
            title: r.get(1)?,
            created_at: r.get(2)?,
            updated_at: r.get(3)?,
            message_count: 0,
        }),
    ).map_err(|e| e.to_string())?;
    Ok(session)
}

// ——————————————————————————————————————————————
// IPC: 列出所有会话
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn list_chat_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<ChatSession>, String> {
    ensure_chat_tables(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT s.id, s.title, s.created_at, s.updated_at,
                COALESCE((SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id), 0)
         FROM chat_sessions s ORDER BY s.updated_at DESC"
    ).map_err(|e| e.to_string())?;

    let rows: Vec<ChatSession> = stmt.query_map([], |r| {
        Ok(ChatSession {
            id: r.get(0)?,
            title: r.get(1)?,
            created_at: r.get(2)?,
            updated_at: r.get(3)?,
            message_count: r.get(4)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(rows)
}

// ——————————————————————————————————————————————
// IPC: 获取会话消息
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn get_chat_messages(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ChatMessageRecord>, String> {
    ensure_chat_tables(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, session_id, role, content, tool_name, tool_result, widget_type, widget_data, created_at
         FROM chat_messages WHERE session_id = ?1 ORDER BY id ASC"
    ).map_err(|e| e.to_string())?;

    let rows: Vec<ChatMessageRecord> = stmt.query_map([&session_id], |r| {
        Ok(ChatMessageRecord {
            id: r.get(0)?,
            session_id: r.get(1)?,
            role: r.get(2)?,
            content: r.get(3)?,
            tool_name: r.get(4)?,
            tool_result: r.get(5)?,
            widget_type: r.get(6)?,
            widget_data: r.get(7)?,
            created_at: r.get(8)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(rows)
}

// ——————————————————————————————————————————————
// IPC: 保存消息
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn save_chat_message(
    session_id: String,
    role: String,
    content: String,
    tool_name: Option<String>,
    tool_result: Option<String>,
    widget_type: Option<String>,
    widget_data: Option<String>,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    ensure_chat_tables(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO chat_messages (session_id, role, content, tool_name, tool_result, widget_type, widget_data)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![session_id, role, content, tool_name, tool_result, widget_type, widget_data],
    ).map_err(|e| e.to_string())?;
    let id = db.last_insert_rowid();

    // 更新会话 updated_at
    db.execute(
        "UPDATE chat_sessions SET updated_at = datetime('now','localtime') WHERE id = ?1",
        [&session_id],
    ).map_err(|e| e.to_string())?;

    Ok(id)
}

// ——————————————————————————————————————————————
// IPC: 删除会话
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn delete_chat_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    ensure_chat_tables(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM chat_messages WHERE session_id = ?1", [&session_id])
        .map_err(|e| e.to_string())?;
    db.execute("DELETE FROM chat_sessions WHERE id = ?1", [&session_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ——————————————————————————————————————————————
// IPC: 重命名会话
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn rename_chat_session(
    session_id: String,
    title: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    ensure_chat_tables(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE chat_sessions SET title = ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
        rusqlite::params![title, session_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ——————————————————————————————————————————————
// IPC: 清空会话消息
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn clear_chat_messages(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    ensure_chat_tables(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM chat_messages WHERE session_id = ?1", [&session_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
