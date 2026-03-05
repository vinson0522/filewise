use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;
use std::path::Path;
use regex::Regex;
use std::io::Read;

// ——————————————————————————————————————————————
// Public helper: check protection synchronously (used by file_ops, clean, etc.)
// ——————————————————————————————————————————————

/// Check if a path falls under any protected directory. Callable from other modules.
pub fn check_path_protected(db: &rusqlite::Connection, path: &str) -> Result<(), String> {
    // Ensure table exists
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS protected_dirs (
            path TEXT PRIMARY KEY,
            added_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );"
    ).ok();

    let mut stmt = db.prepare("SELECT path FROM protected_dirs")
        .map_err(|e| e.to_string())?;
    let dirs: Vec<String> = stmt.query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let normalized = path.replace('/', "\\").to_lowercase();
    for dir in &dirs {
        let norm_dir = dir.replace('/', "\\").to_lowercase();
        if normalized.starts_with(&norm_dir) {
            return Err(format!("操作被拒绝：路径 {} 位于受保护目录 {} 下", path, dir));
        }
    }
    Ok(())
}

// ——————————————————————————————————————————————
// S2: 敏感文件扫描
// ——————————————————————————————————————————————

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SensitiveMatch {
    pub file_path: String,
    pub file_name: String,
    pub match_type: String,   // "身份证号" | "银行卡号" | "密码/密钥"
    pub match_count: usize,
    pub sample: String,       // 脱敏后的示例
}

fn mask(s: &str) -> String {
    if s.len() <= 6 {
        return "*".repeat(s.len());
    }
    let show = 3.min(s.len() / 4);
    format!("{}{}{}",
        &s[..show],
        "*".repeat(s.len() - show * 2),
        &s[s.len() - show..])
}

/// IPC: 扫描目录中的敏感文件
#[tauri::command]
pub async fn scan_sensitive_files(
    path: String,
) -> Result<Vec<SensitiveMatch>, String> {
    let re_id = Regex::new(r"\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b")
        .map_err(|e| e.to_string())?;
    let re_bank = Regex::new(r"\b(?:62|4\d|5[1-5]|35)\d{14,17}\b")
        .map_err(|e| e.to_string())?;
    let re_pwd = Regex::new(r"(?i)(?:password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)\s*[:=]\s*(\S+)")
        .map_err(|e| e.to_string())?;

    // Placeholder values that should not trigger alerts
    let placeholder_values = [
        "xxx", "your_", "example", "placeholder", "changeme", "none", "null",
        "todo", "fixme", "replace", "{", "$(", "\"\"", "''", "undefined",
        "process.env", "os.environ", "env(", "config.", "settings.",
    ];

    // Documentation file extensions — skip password/key checks for these
    let doc_exts = ["md", "txt", "html", "htm", "rst", "adoc"];

    let text_exts = [
        "txt", "csv", "json", "xml", "yaml", "yml", "toml", "ini", "conf", "cfg",
        "log", "md", "env", "properties", "sql", "py", "js", "ts", "java", "rs",
        "go", "php", "rb", "sh", "bat", "ps1", "html", "htm", "css",
    ];

    let mut results = Vec::new();
    let root = Path::new(&path);
    if !root.exists() {
        return Err("目录不存在".into());
    }

    for entry in walkdir::WalkDir::new(root)
        .max_depth(5)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() { continue; }
        let p = entry.path();
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if !text_exts.contains(&ext.as_str()) { continue; }

        // Skip files > 10MB
        if entry.metadata().map(|m| m.len()).unwrap_or(0) > 10 * 1024 * 1024 { continue; }

        let mut content = String::new();
        if let Ok(mut f) = std::fs::File::open(p) {
            if f.read_to_string(&mut content).is_err() { continue; }
        }

        let file_path = p.to_string_lossy().to_string();
        let file_name = p.file_name().unwrap_or_default().to_string_lossy().to_string();

        // Check ID numbers
        let id_matches: Vec<_> = re_id.find_iter(&content).collect();
        if !id_matches.is_empty() {
            results.push(SensitiveMatch {
                file_path: file_path.clone(),
                file_name: file_name.clone(),
                match_type: "身份证号".into(),
                match_count: id_matches.len(),
                sample: mask(id_matches[0].as_str()),
            });
        }

        // Check bank card numbers
        let bank_matches: Vec<_> = re_bank.find_iter(&content).collect();
        if !bank_matches.is_empty() {
            results.push(SensitiveMatch {
                file_path: file_path.clone(),
                file_name: file_name.clone(),
                match_type: "银行卡号".into(),
                match_count: bank_matches.len(),
                sample: mask(bank_matches[0].as_str()),
            });
        }

        // Check passwords/keys (skip documentation files to reduce false positives)
        if !doc_exts.contains(&ext.as_str()) {
            let real_pwd_matches: Vec<_> = re_pwd.captures_iter(&content)
                .filter(|cap| {
                    if let Some(val) = cap.get(1) {
                        let v = val.as_str().to_lowercase();
                        // Must be at least 6 chars to be a real secret
                        if v.len() < 6 { return false; }
                        // Skip placeholder/template values
                        if placeholder_values.iter().any(|p| v.starts_with(p)) { return false; }
                        // Skip quoted empty or generic values
                        if v.starts_with('"') || v.starts_with('\'') { return false; }
                        true
                    } else {
                        false
                    }
                })
                .collect();
            if !real_pwd_matches.is_empty() {
                results.push(SensitiveMatch {
                    file_path: file_path.clone(),
                    file_name: file_name.clone(),
                    match_type: "密码/密钥".into(),
                    match_count: real_pwd_matches.len(),
                    sample: mask(real_pwd_matches[0].get(0).unwrap().as_str()),
                });
            }
        }
    }

    Ok(results)
}

// ——————————————————————————————————————————————
// S3: 审计日志导出
// ——————————————————————————————————————————————

/// IPC: 导出审计日志为 CSV
#[tauri::command]
pub async fn export_audit_csv(
    save_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, ts, action, path, detail, result FROM audit_log ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;

    let rows: Vec<(i64, i64, String, String, String, String)> = stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    let mut wtr = csv::Writer::from_path(&save_path)
        .map_err(|e| format!("创建CSV失败: {}", e))?;

    wtr.write_record(["ID", "时间戳", "操作", "路径", "详情", "结果"])
        .map_err(|e| e.to_string())?;

    for (id, ts, action, path, detail, result) in &rows {
        let time_str = chrono::DateTime::from_timestamp(*ts, 0)
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_else(|| ts.to_string());
        wtr.write_record([
            &id.to_string(), &time_str, action, path, detail, result
        ]).map_err(|e| e.to_string())?;
    }

    wtr.flush().map_err(|e| e.to_string())?;
    Ok(format!("已导出 {} 条记录到 {}", rows.len(), save_path))
}

/// IPC: 导出审计日志为 JSON
#[tauri::command]
pub async fn export_audit_json(
    save_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, ts, action, path, detail, result FROM audit_log ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;

    let rows: Vec<serde_json::Value> = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let ts: i64 = row.get(1)?;
        let action: String = row.get(2)?;
        let path: String = row.get(3)?;
        let detail: String = row.get(4)?;
        let result: String = row.get(5)?;
        Ok(serde_json::json!({
            "id": id, "timestamp": ts, "action": action,
            "path": path, "detail": detail, "result": result
        }))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    let json = serde_json::to_string_pretty(&rows).map_err(|e| e.to_string())?;
    std::fs::write(&save_path, json).map_err(|e| format!("写入失败: {}", e))?;
    Ok(format!("已导出 {} 条记录到 {}", rows.len(), save_path))
}

// ——————————————————————————————————————————————
// S4: 文件完整性校验（BLAKE3 基线）
// ——————————————————————————————————————————————

#[derive(Debug, Serialize, Deserialize)]
pub struct IntegrityEntry {
    pub path: String,
    pub name: String,
    pub status: String, // "ok" | "modified" | "missing" | "new"
    pub baseline_hash: String,
    pub current_hash: String,
}

fn ensure_integrity_table(state: &AppState) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS integrity_baseline (
            path TEXT PRIMARY KEY,
            hash TEXT NOT NULL,
            size INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );"
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| format!("打开文件失败: {}", e))?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = vec![0u8; 4 * 1024 * 1024]; // 4MB chunks
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

/// IPC: 为目录创建完整性基线
#[tauri::command]
pub async fn create_integrity_baseline(
    path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    ensure_integrity_table(&state)?;

    let root = Path::new(&path);
    if !root.exists() { return Err("目录不存在".into()); }

    let mut count = 0u32;
    let db = state.db.lock().map_err(|e| e.to_string())?;

    for entry in walkdir::WalkDir::new(root)
        .max_depth(5)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() { continue; }
        let p = entry.path();
        // Skip files > 100MB for performance
        if entry.metadata().map(|m| m.len()).unwrap_or(0) > 100 * 1024 * 1024 { continue; }

        let file_path = p.to_string_lossy().to_string();
        if let Ok(h) = hash_file(p) {
            let size = entry.metadata().map(|m| m.len() as i64).unwrap_or(0);
            db.execute(
                "INSERT INTO integrity_baseline (path, hash, size) VALUES (?1, ?2, ?3)
                 ON CONFLICT(path) DO UPDATE SET hash = excluded.hash, size = excluded.size,
                 created_at = datetime('now','localtime')",
                rusqlite::params![file_path, h, size],
            ).ok();
            count += 1;
        }
    }

    Ok(format!("已为 {} 个文件创建完整性基线", count))
}

/// IPC: 校验文件完整性（与基线比对）
#[tauri::command]
pub async fn check_integrity(
    path: String,
    state: State<'_, AppState>,
) -> Result<Vec<IntegrityEntry>, String> {
    ensure_integrity_table(&state)?;

    let root = Path::new(&path);
    if !root.exists() { return Err("目录不存在".into()); }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let prefix = format!("{}%", path.replace('\\', "\\"));

    // Get all baseline entries for this path
    let mut stmt = db.prepare(
        "SELECT path, hash FROM integrity_baseline WHERE path LIKE ?1"
    ).map_err(|e| e.to_string())?;

    let baselines: Vec<(String, String)> = stmt.query_map([&prefix], |row| {
        Ok((row.get(0)?, row.get(1)?))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    drop(stmt);
    drop(db);

    let mut results = Vec::new();

    for (file_path, baseline_hash) in &baselines {
        let p = Path::new(file_path);
        let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();

        if !p.exists() {
            results.push(IntegrityEntry {
                path: file_path.clone(), name,
                status: "missing".into(),
                baseline_hash: baseline_hash.clone(),
                current_hash: String::new(),
            });
            continue;
        }

        match hash_file(p) {
            Ok(current) => {
                let status = if current == *baseline_hash { "ok" } else { "modified" };
                results.push(IntegrityEntry {
                    path: file_path.clone(), name,
                    status: status.into(),
                    baseline_hash: baseline_hash.clone(),
                    current_hash: current,
                });
            }
            Err(_) => {
                results.push(IntegrityEntry {
                    path: file_path.clone(), name,
                    status: "error".into(),
                    baseline_hash: baseline_hash.clone(),
                    current_hash: String::new(),
                });
            }
        }
    }

    Ok(results)
}

// ——————————————————————————————————————————————
// S5: 目录保护（防误删）
// ——————————————————————————————————————————————

fn ensure_protected_table(state: &AppState) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS protected_dirs (
            path TEXT PRIMARY KEY,
            added_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );"
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// IPC: 添加受保护目录
#[tauri::command]
pub async fn add_protected_dir(
    path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    ensure_protected_table(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT OR IGNORE INTO protected_dirs (path) VALUES (?1)",
        [&path],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// IPC: 移除受保护目录
#[tauri::command]
pub async fn remove_protected_dir(
    path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    ensure_protected_table(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM protected_dirs WHERE path = ?1", [&path])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// IPC: 列出所有受保护目录
#[tauri::command]
pub async fn list_protected_dirs(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    ensure_protected_table(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare("SELECT path FROM protected_dirs ORDER BY path")
        .map_err(|e| e.to_string())?;
    let dirs: Vec<String> = stmt.query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(dirs)
}

/// IPC: 检查路径是否在受保护目录下
#[tauri::command]
pub async fn is_path_protected(
    path: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    ensure_protected_table(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare("SELECT path FROM protected_dirs")
        .map_err(|e| e.to_string())?;
    let dirs: Vec<String> = stmt.query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let normalized = path.replace('/', "\\").to_lowercase();
    for dir in &dirs {
        let norm_dir = dir.replace('/', "\\").to_lowercase();
        if normalized.starts_with(&norm_dir) {
            return Ok(true);
        }
    }
    Ok(false)
}
