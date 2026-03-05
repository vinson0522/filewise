use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;
use rand::RngCore;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultEntry {
    pub id: i64,
    pub original_path: String,
    pub original_name: String,
    pub size: i64,
    pub encrypted_at: String,
}

/// 从密码派生 32 字节密钥（BLAKE3）
fn derive_key(password: &str) -> [u8; 32] {
    let hash = blake3::hash(password.as_bytes());
    *hash.as_bytes()
}

/// 初始化 vault 表
fn ensure_vault_table(state: &AppState) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS vault (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_path TEXT NOT NULL,
            original_name TEXT NOT NULL,
            size INTEGER NOT NULL DEFAULT 0,
            vault_file TEXT NOT NULL,
            encrypted_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );"
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// IPC: 加密文件到保险箱
#[tauri::command]
pub async fn vault_encrypt(
    path: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    ensure_vault_table(&state)?;

    let src = Path::new(&path);
    if !src.exists() {
        return Err("文件不存在".into());
    }

    let plaintext = std::fs::read(src).map_err(|e| format!("读取文件失败: {}", e))?;
    let file_size = plaintext.len() as i64;
    let file_name = src.file_name().unwrap_or_default().to_string_lossy().to_string();

    // AES-256-GCM encrypt
    let key = derive_key(&password);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher.encrypt(nonce, plaintext.as_ref())
        .map_err(|_| "加密失败".to_string())?;

    // Save: nonce(12) + ciphertext
    let vault_dir = Path::new(&state.data_dir).join("vault");
    std::fs::create_dir_all(&vault_dir).map_err(|e| e.to_string())?;

    let vault_id = uuid::Uuid::new_v4().to_string();
    let vault_file = vault_dir.join(format!("{}.enc", vault_id));

    let mut output = Vec::with_capacity(12 + ciphertext.len());
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);
    std::fs::write(&vault_file, &output).map_err(|e| format!("写入加密文件失败: {}", e))?;

    // Record in DB
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO vault (original_path, original_name, size, vault_file) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![path, file_name, file_size, vault_file.to_string_lossy().to_string()],
    ).map_err(|e| e.to_string())?;

    // Delete original
    std::fs::remove_file(src).map_err(|e| format!("删除原文件失败: {}", e))?;

    Ok(format!("已加密并存入保险箱: {}", file_name))
}

/// IPC: 从保险箱解密文件
#[tauri::command]
pub async fn vault_decrypt(
    id: i64,
    password: String,
    restore_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    ensure_vault_table(&state)?;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let (original_path, vault_file): (String, String) = db.query_row(
        "SELECT original_path, vault_file FROM vault WHERE id = ?1",
        [id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "保险箱记录不存在".to_string())?;
    drop(db);

    let encrypted = std::fs::read(&vault_file).map_err(|e| format!("读取加密文件失败: {}", e))?;
    if encrypted.len() < 12 {
        return Err("加密文件损坏".into());
    }

    let key = derive_key(&password);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&encrypted[..12]);
    let plaintext = cipher.decrypt(nonce, &encrypted[12..])
        .map_err(|_| "密码错误或文件损坏".to_string())?;

    let dest = restore_path.unwrap_or(original_path.clone());
    if let Some(parent) = Path::new(&dest).parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&dest, &plaintext).map_err(|e| format!("写入解密文件失败: {}", e))?;

    // Clean up vault
    std::fs::remove_file(&vault_file).ok();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM vault WHERE id = ?1", [id]).ok();

    Ok(format!("已解密恢复到: {}", dest))
}

/// IPC: 列出保险箱中所有文件
#[tauri::command]
pub async fn vault_list(state: State<'_, AppState>) -> Result<Vec<VaultEntry>, String> {
    ensure_vault_table(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, original_path, original_name, size, encrypted_at FROM vault ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;

    let entries = stmt.query_map([], |row| {
        Ok(VaultEntry {
            id: row.get(0)?,
            original_path: row.get(1)?,
            original_name: row.get(2)?,
            size: row.get(3)?,
            encrypted_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(entries)
}

/// IPC: 从保险箱永久删除
#[tauri::command]
pub async fn vault_remove(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    ensure_vault_table(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let vault_file: String = db.query_row(
        "SELECT vault_file FROM vault WHERE id = ?1", [id], |row| row.get(0),
    ).map_err(|_| "记录不存在".to_string())?;

    std::fs::remove_file(&vault_file).ok();
    db.execute("DELETE FROM vault WHERE id = ?1", [id]).ok();
    Ok(())
}
