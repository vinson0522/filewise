use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;
use crate::security::PathGuard;
use crate::engine::scanner::scan_batched;
use crate::engine::watcher::start_watcher;
use chrono::Utc;

/// 根据扩展名推断文件分类
fn infer_category(ext: Option<&str>) -> &'static str {
    match ext.unwrap_or("").to_lowercase().as_str() {
        "doc" | "docx" | "pdf" | "txt" | "md" | "rtf" | "odt" => "文档",
        "xls" | "xlsx" | "csv" | "ods"                          => "表格",
        "ppt" | "pptx" | "odp" | "key"                          => "演示文稿",
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp"
            | "svg" | "tiff" | "ico" | "heic"                   => "图片",
        "mp4" | "avi" | "mov" | "mkv" | "wmv" | "flv" | "mts"   => "视频",
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "wma"  => "音频",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz"      => "压缩包",
        "js" | "ts" | "jsx" | "tsx" | "py" | "rs" | "go"
            | "java" | "cpp" | "c" | "h" | "cs" | "rb"
            | "php" | "swift" | "kt" | "vue" | "html" | "css"  => "代码",
        "db" | "sqlite" | "sql"                                  => "数据库",
        "exe" | "msi" | "dmg" | "deb" | "rpm" | "apk"           => "安装包",
        _                                                         => "其他",
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IndexStats {
    pub total_files: i64,
    pub total_size: i64,
    pub last_indexed: Option<i64>,
}

/// IPC: 获取索引统计信息（从数据库读取真实数据）
#[tauri::command]
pub async fn get_index_stats(state: State<'_, AppState>) -> Result<IndexStats, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let (total_files, total_size): (i64, i64) = db.query_row(
        "SELECT COUNT(*), COALESCE(SUM(size), 0) FROM file_index",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;

    let last_indexed: Option<i64> = db.query_row(
        "SELECT MAX(indexed_at) FROM file_index",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    Ok(IndexStats { total_files, total_size, last_indexed })
}

/// IPC: 扫描目录并写入索引（异步深度扫描）
#[tauri::command]
pub async fn scan_and_index(
    path: String,
    state: State<'_, AppState>,
) -> Result<IndexStats, String> {
    let guard = PathGuard::new();
    let p = std::path::PathBuf::from(&path);
    guard.validate(&p).map_err(|e| e.to_string())?;

    let now = Utc::now().timestamp();

    // 扫描并分批写入数据库
    let state_ref = state.inner();
    scan_batched(&p, 20, |batch| {
        if let Ok(db) = state_ref.db.lock() {
            for entry in &batch {
                let category = infer_category(entry.extension.as_deref());
                let _ = db.execute(
                    "INSERT INTO file_index (path, name, extension, size, modified_at, indexed_at, category)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                     ON CONFLICT(path) DO UPDATE SET
                       size=excluded.size, modified_at=excluded.modified_at,
                       indexed_at=excluded.indexed_at, category=excluded.category",
                    rusqlite::params![
                        entry.path, entry.name,
                        entry.extension.as_deref().unwrap_or(""),
                        entry.size as i64, entry.modified_at, now,
                        category,
                    ],
                );
            }
        }
    }).map_err(|e| e.to_string())?;

    // 写入审计日志
    if let Ok(db) = state.db.lock() {
        let _ = db.execute(
            "INSERT INTO audit_log (ts, action, path, detail, result) VALUES (?1, 'index', ?2, ?3, 'success')",
            rusqlite::params![now, path, format!("建立索引完成")],
        );
    }

    // 返回最新统计
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let (total_files, total_size): (i64, i64) = db.query_row(
        "SELECT COUNT(*), COALESCE(SUM(size), 0) FROM file_index",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;

    Ok(IndexStats { total_files, total_size, last_indexed: Some(now) })
}

/// IPC: 搜索文件（支持名称模糊 + 分类/大小/日期高级筛选）
#[tauri::command]
pub async fn search_files(
    query: String,
    limit: Option<i64>,
    category: Option<String>,
    size_min: Option<i64>,
    size_max: Option<i64>,
    days_ago: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    let limit = limit.unwrap_or(100);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // 动态构建 WHERE 子句
    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut idx = 1usize;

    if !query.trim().is_empty() {
        let pattern = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
        conditions.push(format!("(name LIKE ?{} ESCAPE '\\' OR path LIKE ?{} ESCAPE '\\')", idx, idx));
        params.push(Box::new(pattern));
        idx += 1;
    }
    if let Some(cat) = category.filter(|c| c != "all" && !c.is_empty()) {
        conditions.push(format!("category = ?{}", idx));
        params.push(Box::new(cat));
        idx += 1;
    }
    if let Some(min) = size_min { conditions.push(format!("size >= ?{}", idx)); params.push(Box::new(min)); idx += 1; }
    if let Some(max) = size_max { conditions.push(format!("size <= ?{}", idx)); params.push(Box::new(max)); idx += 1; }
    if let Some(days) = days_ago {
        let cutoff = chrono::Utc::now().timestamp() - days * 86400;
        conditions.push(format!("modified_at >= ?{}", idx));
        params.push(Box::new(cutoff));
        idx += 1;
    }

    let where_clause = if conditions.is_empty() {
        "1=1".to_string()
    } else {
        conditions.join(" AND ")
    };
    let sql = format!(
        "SELECT path, name, size, modified_at, category FROM file_index
         WHERE {} ORDER BY modified_at DESC LIMIT ?{}",
        where_clause, idx
    );
    params.push(Box::new(limit));

    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let results = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(SearchResult {
            path: row.get(0)?,
            name: row.get(1)?,
            size: row.get::<_, i64>(2)? as u64,
            modified_at: row.get(3)?,
            category: row.get(4)?,
            score: 1.0,
        })
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(results)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_at: Option<i64>,
    pub category: Option<String>,
    pub score: f32,
}

/// IPC: 启动文件监听（自动增量更新索引）
#[tauri::command]
pub async fn watch_directory(
    path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let guard = PathGuard::new();
    let p = std::path::PathBuf::from(&path);
    guard.validate(&p).map_err(|e| e.to_string())?;
    if !p.exists() {
        return Err(format!("路径不存在: {}", path));
    }

    let db_arc = state.db_arc.clone();
    let handle = start_watcher(vec![path.clone()], db_arc)
        .map_err(|e| e.to_string())?;

    let mut watcher_lock = state.watcher.lock().map_err(|e| e.to_string())?;
    *watcher_lock = Some(handle);

    Ok(format!("已开始监听: {}", path))
}

/// IPC: 停止文件监听
#[tauri::command]
pub async fn stop_watcher(state: State<'_, AppState>) -> Result<String, String> {
    let mut watcher_lock = state.watcher.lock().map_err(|e| e.to_string())?;
    let count = watcher_lock.as_ref().map(|h| h.watched_paths.len()).unwrap_or(0);
    *watcher_lock = None; // drop → notify watcher 自动停止
    Ok(format!("已停止监听，共 {} 个路径", count))
}

/// IPC: 查询当前监听状态
#[tauri::command]
pub async fn get_watcher_status(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let watcher_lock = state.watcher.lock().map_err(|e| e.to_string())?;
    Ok(watcher_lock.as_ref()
        .map(|h| h.watched_paths.clone())
        .unwrap_or_default())
}
