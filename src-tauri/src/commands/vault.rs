use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;
use rand::RngCore;
use std::path::Path;
use std::io::{Read, Write};

// ——————————————————————————————————————————————
// 数据结构
// ——————————————————————————————————————————————

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultEntry {
    pub id: i64,
    pub original_path: String,
    pub original_name: String,
    pub size: i64,
    pub encrypted_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PasswordStrength {
    pub score: u8,      // 0-4
    pub label: String,  // 弱/中/强/非常强
    pub tips: Vec<String>,
}

// ——————————————————————————————————————————————
// 密码强度检查
// ——————————————————————————————————————————————

/// IPC: 检查密码强度
#[tauri::command]
pub async fn check_password_strength(password: String) -> Result<PasswordStrength, String> {
    let mut score: u8 = 0;
    let mut tips: Vec<String> = Vec::new();
    let len = password.len();

    if len >= 8 { score += 1; } else { tips.push("至少8个字符".into()); }
    if len >= 12 { score += 1; }
    if password.chars().any(|c| c.is_uppercase()) && password.chars().any(|c| c.is_lowercase()) {
        score += 1;
    } else {
        tips.push("混合大小写字母".into());
    }
    if password.chars().any(|c| c.is_ascii_digit()) {
        score += 1;
    } else {
        tips.push("包含数字".into());
    }
    if password.chars().any(|c| !c.is_alphanumeric()) {
        score += 1;
    } else {
        tips.push("包含特殊字符".into());
    }

    let label = match score {
        0..=1 => "弱",
        2 => "中",
        3 => "强",
        _ => "非常强",
    }.to_string();

    Ok(PasswordStrength { score: score.min(4), label, tips })
}

// ——————————————————————————————————————————————
// KEK/DEK 双层密钥 + Argon2id 密钥派生
// ——————————————————————————————————————————————

/// 使用 Argon2id 从密码+盐派生 32 字节 KEK（Key Encryption Key）
fn derive_kek(password: &str, salt: &[u8; 16]) -> Result<[u8; 32], String> {
    use argon2::{Argon2, Algorithm, Version, Params};
    let params = Params::new(65536, 3, 1, Some(32))
        .map_err(|e| format!("Argon2 参数错误: {}", e))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut kek = [0u8; 32];
    argon2.hash_password_into(password.as_bytes(), salt, &mut kek)
        .map_err(|e| format!("密钥派生失败: {}", e))?;
    Ok(kek)
}

/// 生成随机 DEK（Data Encryption Key）
fn generate_dek() -> [u8; 32] {
    let mut dek = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut dek);
    dek
}

/// 用 KEK 加密 DEK（AES-256-GCM wrapping）
fn wrap_dek(kek: &[u8; 32], dek: &[u8; 32]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(kek).map_err(|e| e.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let wrapped = cipher.encrypt(nonce, dek.as_ref())
        .map_err(|_| "DEK 加密失败".to_string())?;
    // nonce(12) + wrapped_dek
    let mut out = Vec::with_capacity(12 + wrapped.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&wrapped);
    Ok(out)
}

/// 用 KEK 解密 DEK
fn unwrap_dek(kek: &[u8; 32], wrapped: &[u8]) -> Result<[u8; 32], String> {
    if wrapped.len() < 12 + 32 {
        return Err("加密密钥数据损坏".into());
    }
    let cipher = Aes256Gcm::new_from_slice(kek).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&wrapped[..12]);
    let dek_bytes = cipher.decrypt(nonce, &wrapped[12..])
        .map_err(|_| "密码错误".to_string())?;
    if dek_bytes.len() != 32 {
        return Err("DEK 长度错误".into());
    }
    let mut dek = [0u8; 32];
    dek.copy_from_slice(&dek_bytes);
    Ok(dek)
}

// ——————————————————————————————————————————————
// 流式加密/解密（4MB 分块，支持大文件）
// ——————————————————————————————————————————————

const CHUNK_SIZE: usize = 4 * 1024 * 1024; // 4MB

/// 流式加密文件：每个 chunk 独立 nonce + AES-256-GCM
/// 输出格式: [chunk_count(u32 LE)] + [nonce(12) + ciphertext]*N
fn encrypt_file_streaming(dek: &[u8; 32], src_path: &Path, dst_path: &Path) -> Result<i64, String> {
    let cipher = Aes256Gcm::new_from_slice(dek).map_err(|e| e.to_string())?;
    let mut reader = std::fs::File::open(src_path).map_err(|e| format!("读取文件失败: {}", e))?;
    let mut writer = std::fs::File::create(dst_path).map_err(|e| format!("创建加密文件失败: {}", e))?;
    let file_size = reader.metadata().map(|m| m.len()).unwrap_or(0) as i64;

    // Placeholder for chunk count (will write later)
    writer.write_all(&[0u8; 4]).map_err(|e| e.to_string())?;

    let mut buf = vec![0u8; CHUNK_SIZE];
    let mut chunk_count: u32 = 0;

    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { break; }

        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher.encrypt(nonce, &buf[..n])
            .map_err(|_| "分块加密失败".to_string())?;

        writer.write_all(&nonce_bytes).map_err(|e| e.to_string())?;
        let ct_len = (ciphertext.len() as u32).to_le_bytes();
        writer.write_all(&ct_len).map_err(|e| e.to_string())?;
        writer.write_all(&ciphertext).map_err(|e| e.to_string())?;
        chunk_count += 1;
    }

    // Write chunk count at the beginning
    use std::io::Seek;
    writer.seek(std::io::SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    writer.write_all(&chunk_count.to_le_bytes()).map_err(|e| e.to_string())?;

    Ok(file_size)
}

/// 流式解密
fn decrypt_file_streaming(dek: &[u8; 32], src_path: &Path, dst_path: &Path) -> Result<(), String> {
    let cipher = Aes256Gcm::new_from_slice(dek).map_err(|e| e.to_string())?;
    let mut reader = std::fs::File::open(src_path).map_err(|e| format!("读取加密文件失败: {}", e))?;
    let mut writer = std::fs::File::create(dst_path).map_err(|e| format!("创建解密文件失败: {}", e))?;

    // Read chunk count
    let mut count_buf = [0u8; 4];
    reader.read_exact(&mut count_buf).map_err(|e| format!("文件格式错误: {}", e))?;
    let chunk_count = u32::from_le_bytes(count_buf);

    for _ in 0..chunk_count {
        // Read nonce
        let mut nonce_bytes = [0u8; 12];
        reader.read_exact(&mut nonce_bytes).map_err(|e| format!("读取 nonce 失败: {}", e))?;
        let nonce = Nonce::from_slice(&nonce_bytes);

        // Read ciphertext length + data
        let mut len_buf = [0u8; 4];
        reader.read_exact(&mut len_buf).map_err(|e| format!("读取长度失败: {}", e))?;
        let ct_len = u32::from_le_bytes(len_buf) as usize;

        let mut ct_buf = vec![0u8; ct_len];
        reader.read_exact(&mut ct_buf).map_err(|e| format!("读取密文失败: {}", e))?;

        let plaintext = cipher.decrypt(nonce, ct_buf.as_ref())
            .map_err(|_| "密码错误或文件损坏".to_string())?;
        writer.write_all(&plaintext).map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ——————————————————————————————————————————————
// 数据库
// ——————————————————————————————————————————————

fn ensure_vault_table(state: &AppState) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS vault (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_path TEXT NOT NULL,
            original_name TEXT NOT NULL,
            size INTEGER NOT NULL DEFAULT 0,
            vault_file TEXT NOT NULL,
            salt TEXT NOT NULL DEFAULT '',
            wrapped_dek TEXT NOT NULL DEFAULT '',
            file_hash TEXT NOT NULL DEFAULT '',
            encrypted_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );"
    ).map_err(|e| e.to_string())?;
    // Migrate: add columns if missing (for old vault tables)
    for col in ["salt", "wrapped_dek", "file_hash"] {
        let _ = db.execute(&format!(
            "ALTER TABLE vault ADD COLUMN {} TEXT NOT NULL DEFAULT ''", col
        ), []);
    }
    Ok(())
}

// ——————————————————————————————————————————————
// IPC 命令
// ——————————————————————————————————————————————

/// IPC: 加密文件到保险箱（Argon2id + KEK/DEK + 流式加密）
#[tauri::command]
pub async fn vault_encrypt(
    path: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    ensure_vault_table(&state)?;

    // 密码强度门槛
    if password.len() < 6 {
        return Err("密码太短，至少需要6个字符".into());
    }

    let src = Path::new(&path);
    if !src.exists() {
        return Err("文件不存在".into());
    }

    let file_name = src.file_name().unwrap_or_default().to_string_lossy().to_string();

    // 1. 计算源文件 BLAKE3 哈希（完整性校验用）
    let file_hash = crate::engine::hasher::blake3_file_sync(&path).unwrap_or_default();

    // 2. 生成随机盐 + 派生 KEK
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let kek = derive_kek(&password, &salt)?;

    // 3. 生成随机 DEK + 用 KEK 加密 DEK
    let dek = generate_dek();
    let wrapped_dek = wrap_dek(&kek, &dek)?;

    // 4. 流式加密文件
    let vault_dir = Path::new(&state.data_dir).join("vault");
    std::fs::create_dir_all(&vault_dir).map_err(|e| e.to_string())?;
    let vault_id = uuid::Uuid::new_v4().to_string();
    let vault_file = vault_dir.join(format!("{}.enc", vault_id));

    let file_size = encrypt_file_streaming(&dek, src, &vault_file)?;

    // 5. 存入数据库
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO vault (original_path, original_name, size, vault_file, salt, wrapped_dek, file_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            path, file_name, file_size,
            vault_file.to_string_lossy().to_string(),
            hex::encode(salt),
            hex::encode(&wrapped_dek),
            file_hash,
        ],
    ).map_err(|e| e.to_string())?;

    // 6. 删除原文件
    std::fs::remove_file(src).map_err(|e| format!("删除原文件失败: {}", e))?;

    Ok(format!("已加密并存入保险箱: {}", file_name))
}

/// IPC: 从保险箱解密文件（KEK/DEK + 流式解密 + 完整性校验）
#[tauri::command]
pub async fn vault_decrypt(
    id: i64,
    password: String,
    restore_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    ensure_vault_table(&state)?;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let (original_path, vault_file, salt_hex, wrapped_dek_hex, file_hash): (String, String, String, String, String) = db.query_row(
        "SELECT original_path, vault_file, salt, wrapped_dek, file_hash FROM vault WHERE id = ?1",
        [id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    ).map_err(|_| "保险箱记录不存在".to_string())?;
    drop(db);

    // 1. 从密码+盐派生 KEK
    let salt_bytes = hex::decode(&salt_hex).map_err(|_| "盐数据损坏".to_string())?;
    if salt_bytes.len() != 16 {
        return Err("盐长度错误".into());
    }
    let mut salt = [0u8; 16];
    salt.copy_from_slice(&salt_bytes);
    let kek = derive_kek(&password, &salt)?;

    // 2. 用 KEK 解密 DEK
    let wrapped = hex::decode(&wrapped_dek_hex).map_err(|_| "加密密钥数据损坏".to_string())?;
    let dek = unwrap_dek(&kek, &wrapped)?;

    // 3. 流式解密
    let dest = restore_path.unwrap_or(original_path.clone());
    if let Some(parent) = Path::new(&dest).parent() {
        std::fs::create_dir_all(parent).ok();
    }
    decrypt_file_streaming(&dek, Path::new(&vault_file), Path::new(&dest))?;

    // 4. 完整性校验（如果有存储的哈希）
    if !file_hash.is_empty() {
        let restored_hash = crate::engine::hasher::blake3_file_sync(&dest).unwrap_or_default();
        if restored_hash != file_hash {
            std::fs::remove_file(&dest).ok(); // 删除损坏的文件
            return Err("完整性校验失败：解密后的文件哈希不匹配，文件可能已损坏".into());
        }
    }

    // 5. 清理保险箱
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
