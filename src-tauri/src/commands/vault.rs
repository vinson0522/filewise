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

// ——————————————————————————————————————————————
// 便携导出/导入 (.fwvault 格式)
// 格式: MAGIC(8) + VERSION(4) + META_LEN(4) + META_JSON(N) + ENC_DATA(...)
// ——————————————————————————————————————————————

const FWVAULT_MAGIC: &[u8; 8] = b"FWVAULT\0";
const FWVAULT_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
struct FwVaultMeta {
    original_name: String,
    salt_hex: String,
    wrapped_dek_hex: String,
    file_hash: String,
    size: i64,
}

/// IPC: 导出保险箱文件为便携 .fwvault 文件（可发送给他人）
#[tauri::command]
pub async fn vault_export(
    id: i64,
    export_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    ensure_vault_table(&state)?;

    let (original_name, vault_file, salt_hex, wrapped_dek_hex, file_hash, size): (String, String, String, String, String, i64) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT original_name, vault_file, salt, wrapped_dek, file_hash, size FROM vault WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        ).map_err(|_| "保险箱记录不存在".to_string())?
    };

    // 读取加密文件数据
    let enc_data = std::fs::read(&vault_file)
        .map_err(|e| format!("读取加密文件失败: {}", e))?;

    // 构建元数据
    let meta = FwVaultMeta {
        original_name: original_name.clone(),
        salt_hex,
        wrapped_dek_hex,
        file_hash,
        size,
    };
    let meta_json = serde_json::to_vec(&meta)
        .map_err(|e| format!("序列化元数据失败: {}", e))?;

    // 确定导出路径
    let out_path = if export_path.ends_with(".fwvault") {
        export_path.clone()
    } else {
        let dir = Path::new(&export_path);
        if dir.is_dir() {
            dir.join(format!("{}.fwvault", original_name)).to_string_lossy().to_string()
        } else {
            format!("{}.fwvault", export_path)
        }
    };

    // 写入 .fwvault 文件
    let mut writer = std::fs::File::create(&out_path)
        .map_err(|e| format!("创建导出文件失败: {}", e))?;

    writer.write_all(FWVAULT_MAGIC).map_err(|e| e.to_string())?;
    writer.write_all(&FWVAULT_VERSION.to_le_bytes()).map_err(|e| e.to_string())?;
    writer.write_all(&(meta_json.len() as u32).to_le_bytes()).map_err(|e| e.to_string())?;
    writer.write_all(&meta_json).map_err(|e| e.to_string())?;
    writer.write_all(&enc_data).map_err(|e| e.to_string())?;

    Ok(out_path)
}

/// IPC: 导入 .fwvault 文件并解密（接收他人发送的加密文件）
#[tauri::command]
pub async fn vault_import(
    fwvault_path: String,
    password: String,
    target_dir: Option<String>,
) -> Result<String, String> {
    let mut reader = std::fs::File::open(&fwvault_path)
        .map_err(|e| format!("打开文件失败: {}", e))?;

    // 1. 校验 Magic
    let mut magic = [0u8; 8];
    reader.read_exact(&mut magic)
        .map_err(|_| "文件格式错误：不是有效的 .fwvault 文件".to_string())?;
    if &magic != FWVAULT_MAGIC {
        return Err("文件格式错误：不是有效的 .fwvault 文件".into());
    }

    // 2. 读取版本
    let mut ver_buf = [0u8; 4];
    reader.read_exact(&mut ver_buf).map_err(|_| "文件损坏：无法读取版本".to_string())?;
    let version = u32::from_le_bytes(ver_buf);
    if version != FWVAULT_VERSION {
        return Err(format!("不支持的 fwvault 版本: {}", version));
    }

    // 3. 读取元数据
    let mut meta_len_buf = [0u8; 4];
    reader.read_exact(&mut meta_len_buf).map_err(|_| "文件损坏：无法读取元数据长度".to_string())?;
    let meta_len = u32::from_le_bytes(meta_len_buf) as usize;
    if meta_len > 1024 * 1024 {
        return Err("元数据过大，文件可能损坏".into());
    }

    let mut meta_buf = vec![0u8; meta_len];
    reader.read_exact(&mut meta_buf).map_err(|_| "文件损坏：无法读取元数据".to_string())?;
    let meta: FwVaultMeta = serde_json::from_slice(&meta_buf)
        .map_err(|e| format!("元数据解析失败: {}", e))?;

    // 4. 读取加密数据
    let mut enc_data = Vec::new();
    reader.read_to_end(&mut enc_data)
        .map_err(|e| format!("读取加密数据失败: {}", e))?;

    // 5. 写入临时 .enc 文件
    let temp_dir = std::env::temp_dir().join("filewise_import");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let temp_enc = temp_dir.join(format!("{}.enc", uuid::Uuid::new_v4()));
    std::fs::write(&temp_enc, &enc_data)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;

    // 6. 从密码+盐派生 KEK
    let salt_bytes = hex::decode(&meta.salt_hex)
        .map_err(|_| "盐值格式错误".to_string())?;
    if salt_bytes.len() != 16 {
        std::fs::remove_file(&temp_enc).ok();
        return Err("盐值长度错误".into());
    }
    let mut salt = [0u8; 16];
    salt.copy_from_slice(&salt_bytes);
    let kek = derive_kek(&password, &salt).map_err(|e| {
        std::fs::remove_file(&temp_enc).ok();
        e
    })?;

    // 7. 用 KEK 解密 DEK
    let wrapped_dek_bytes = hex::decode(&meta.wrapped_dek_hex)
        .map_err(|_| {
            std::fs::remove_file(&temp_enc).ok();
            "加密密钥格式错误".to_string()
        })?;
    let dek = unwrap_dek(&kek, &wrapped_dek_bytes).map_err(|e| {
        std::fs::remove_file(&temp_enc).ok();
        e
    })?;

    // 8. 解密文件
    let dest_dir = target_dir.unwrap_or_else(|| {
        dirs::download_dir()
            .unwrap_or_else(|| std::env::temp_dir())
            .to_string_lossy().to_string()
    });
    std::fs::create_dir_all(&dest_dir).ok();
    let dest_file = Path::new(&dest_dir).join(&meta.original_name);
    let dest_str = dest_file.to_string_lossy().to_string();

    decrypt_file_streaming(&dek, &temp_enc, &dest_file).map_err(|e| {
        std::fs::remove_file(&temp_enc).ok();
        e
    })?;

    // 9. 完整性校验
    if !meta.file_hash.is_empty() {
        let hash = crate::engine::hasher::blake3_file_sync(&dest_str).unwrap_or_default();
        if hash != meta.file_hash {
            std::fs::remove_file(&dest_file).ok();
            std::fs::remove_file(&temp_enc).ok();
            return Err("完整性校验失败：文件可能被篡改".into());
        }
    }

    // 10. 清理临时文件
    std::fs::remove_file(&temp_enc).ok();

    Ok(format!("已成功解密并保存到: {}", dest_str))
}
