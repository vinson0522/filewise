use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use anyhow::Result;
use crate::engine::watcher::WatcherHandle;

/// 全局应用状态，注入 Tauri managed state
pub struct AppState {
    /// SQLite 数据库连接（Mutex 保证线程安全）
    pub db: Mutex<Connection>,
    /// 用于 FileWatcher 的共享连接句柄
    pub db_arc: Arc<Mutex<rusqlite::Connection>>,
    /// 应用数据目录（用于存放索引、隔离区等）
    pub data_dir: PathBuf,
    /// 文件监听器句柄（保持活跃直到 stop）
    pub watcher: Mutex<Option<WatcherHandle>>,
}

impl AppState {
    /// 初始化：创建数据目录 + 数据库 + schema
    pub fn init(data_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&data_dir)?;

        let db_path = data_dir.join("filewise.db");
        let conn = Connection::open(&db_path)?;

        // 性能优化
        conn.execute_batch("
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA synchronous = NORMAL;
            PRAGMA cache_size = -8000;
        ")?;

        Self::init_schema(&conn)?;

        log::info!("数据库已初始化: {}", db_path.display());

        // 建立用于 FileWatcher 的共享连接
        let db_arc = {
            let conn2 = rusqlite::Connection::open(&db_path)?;
            conn2.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;").ok();
            Arc::new(Mutex::new(conn2))
        };

        Ok(AppState {
            db: Mutex::new(conn),
            db_arc,
            data_dir,
            watcher: Mutex::new(None),
        })
    }

    fn init_schema(conn: &Connection) -> Result<()> {
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS file_index (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                path        TEXT NOT NULL UNIQUE,
                name        TEXT NOT NULL,
                extension   TEXT,
                size        INTEGER NOT NULL DEFAULT 0,
                modified_at INTEGER,
                accessed_at INTEGER,
                hash        TEXT,
                category    TEXT,
                tags        TEXT,
                confidence  REAL DEFAULT 0.0,
                is_sensitive INTEGER DEFAULT 0,
                indexed_at  INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS snapshots (
                id          TEXT PRIMARY KEY,
                created_at  INTEGER NOT NULL,
                description TEXT,
                operations  TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'active'
            );

            CREATE TABLE IF NOT EXISTS quarantine (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                original_path   TEXT NOT NULL,
                quarantine_path TEXT NOT NULL,
                deleted_at      INTEGER NOT NULL,
                expires_at      INTEGER NOT NULL,
                file_hash       TEXT,
                size            INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                ts      INTEGER NOT NULL,
                action  TEXT NOT NULL,
                path    TEXT,
                detail  TEXT,
                result  TEXT NOT NULL DEFAULT 'success'
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_file_path     ON file_index(path);
            CREATE INDEX IF NOT EXISTS idx_file_category ON file_index(category);
            CREATE INDEX IF NOT EXISTS idx_file_ext      ON file_index(extension);
            CREATE INDEX IF NOT EXISTS idx_file_size     ON file_index(size);
            CREATE INDEX IF NOT EXISTS idx_audit_ts      ON audit_log(ts);

            CREATE TRIGGER IF NOT EXISTS protect_audit_delete
            BEFORE DELETE ON audit_log
            BEGIN SELECT RAISE(ABORT, 'Audit log is immutable'); END;

            CREATE TRIGGER IF NOT EXISTS protect_audit_update
            BEFORE UPDATE ON audit_log
            BEGIN SELECT RAISE(ABORT, 'Audit log is immutable'); END;
        ")?;
        Ok(())
    }
}
