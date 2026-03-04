// 文件系统监听模块（增量索引）
// 通过 notify crate 监听文件变更事件，触发增量索引更新

use notify::{RecommendedWatcher, RecursiveMode, Watcher, Config, Event, EventKind};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// 已建立的监听器句柄（跨线程共享）
pub struct WatcherHandle {
    _watcher: RecommendedWatcher,
    pub watched_paths: Vec<String>,
}

/// 启动文件监听，变更事件写入 SQLite 增量索引
/// 返回句柄，句柄 drop 时自动停止监听
pub fn start_watcher(
    paths: Vec<String>,
    db: Arc<Mutex<rusqlite::Connection>>,
) -> anyhow::Result<WatcherHandle> {
    let db_clone = Arc::clone(&db);

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let event = match res {
            Ok(e) => e,
            Err(_) => return,
        };

        let ts = chrono::Utc::now().timestamp();

        match event.kind {
            // 新建或修改文件 → 写入 / 更新索引
            EventKind::Create(_) | EventKind::Modify(_) => {
                for path in &event.paths {
                    let p: &std::path::Path = path.as_path();
                    if p.is_file() {
                        let name = p.file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default();
                        let ext = p.extension()
                            .map(|e| e.to_string_lossy().to_string());
                        let size = p.metadata().map(|m| m.len() as i64).ok();
                        let path_str = p.to_string_lossy().to_string();

                        if let Ok(db) = db_clone.lock() {
                            let _ = db.execute(
                                "INSERT INTO file_index (path, name, extension, size, modified_at, indexed_at)
                                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                                 ON CONFLICT(path) DO UPDATE SET
                                   name=excluded.name, extension=excluded.extension,
                                   size=excluded.size, modified_at=excluded.modified_at,
                                   indexed_at=excluded.indexed_at",
                                rusqlite::params![
                                    path_str, name,
                                    ext.as_deref(),
                                    size, ts, ts
                                ],
                            );
                        }
                    }
                }
            }
            // 删除文件 → 从索引移除
            EventKind::Remove(_) => {
                for path in &event.paths {
                    let path_str = path.to_string_lossy().to_string();
                    if let Ok(db) = db_clone.lock() {
                        let _ = db.execute(
                            "DELETE FROM file_index WHERE path = ?1",
                            rusqlite::params![path_str],
                        );
                    }
                }
            }
            _ => {}
        }
    })?;

    // 注册所有路径
    let config = Config::default().with_poll_interval(Duration::from_secs(2));
    watcher.configure(config).ok();

    for path_str in &paths {
        let p = PathBuf::from(path_str);
        if p.exists() {
            watcher.watch(&p, RecursiveMode::Recursive).ok();
        }
    }

    log::info!("[FileWatcher] 监听 {} 个路径", paths.len());

    Ok(WatcherHandle {
        _watcher: watcher,
        watched_paths: paths,
    })
}
