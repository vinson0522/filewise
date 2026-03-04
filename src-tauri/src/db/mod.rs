use anyhow::Result;
use rusqlite::{Connection, params};
use std::path::Path;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        let db = Self { conn };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<()> {
        self.conn.execute_batch("
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS file_index (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                path        TEXT NOT NULL UNIQUE,
                name        TEXT NOT NULL,
                extension   TEXT,
                size        INTEGER,
                modified_at INTEGER,
                accessed_at INTEGER,
                hash        TEXT,
                category    TEXT,
                tags        TEXT,
                confidence  REAL DEFAULT 0,
                is_sensitive INTEGER DEFAULT 0,
                indexed_at  INTEGER
            );

            CREATE TABLE IF NOT EXISTS snapshots (
                id          TEXT PRIMARY KEY,
                created_at  INTEGER NOT NULL,
                description TEXT,
                operations  TEXT NOT NULL,
                status      TEXT DEFAULT 'active'
            );

            CREATE TABLE IF NOT EXISTS quarantine (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                original_path   TEXT NOT NULL,
                quarantine_path TEXT NOT NULL,
                deleted_at      INTEGER NOT NULL,
                expires_at      INTEGER NOT NULL,
                file_hash       TEXT,
                size            INTEGER
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                ts      INTEGER NOT NULL,
                action  TEXT NOT NULL,
                path    TEXT,
                detail  TEXT,
                result  TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_file_path     ON file_index(path);
            CREATE INDEX IF NOT EXISTS idx_file_hash     ON file_index(hash);
            CREATE INDEX IF NOT EXISTS idx_file_category ON file_index(category);
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

    pub fn write_audit(&self, action: &str, path: Option<&str>, detail: Option<&str>, result: &str) -> Result<()> {
        let ts = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT INTO audit_log (ts, action, path, detail, result) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![ts, action, path, detail, result],
        )?;
        Ok(())
    }

    pub fn upsert_file_index(
        &self, path: &str, name: &str, extension: Option<&str>,
        size: Option<i64>, modified_at: Option<i64>,
    ) -> Result<()> {
        let ts = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT INTO file_index (path, name, extension, size, modified_at, indexed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(path) DO UPDATE SET
               name=excluded.name, extension=excluded.extension,
               size=excluded.size, modified_at=excluded.modified_at,
               indexed_at=excluded.indexed_at",
            params![path, name, extension, size, modified_at, ts],
        )?;
        Ok(())
    }
}
