use anyhow::Result;
use std::path::Path;
use std::io::{BufReader, Read};

const CHUNK_SIZE: usize = 4 * 1024 * 1024; // 4MB 分块，防止大文件 OOM

/// 计算文件的 BLAKE3 哈希值（流式分块，适合任意大小文件）
pub async fn blake3_file(path: &Path) -> Result<String> {
    let path = path.to_owned();
    let hash = tokio::task::spawn_blocking(move || -> Result<String> {
        let file = std::fs::File::open(&path)?;
        let mut reader = BufReader::with_capacity(CHUNK_SIZE, file);
        let mut hasher = blake3::Hasher::new();
        let mut buf = vec![0u8; CHUNK_SIZE];
        loop {
            let n = reader.read(&mut buf)?;
            if n == 0 { break; }
            hasher.update(&buf[..n]);
        }
        Ok(hasher.finalize().to_hex().to_string())
    })
    .await??;
    Ok(hash)
}

/// 验证文件移动前后完整性
pub async fn verify_move_integrity(src_hash: &str, dest: &Path) -> Result<bool> {
    let dest_hash = blake3_file(dest).await?;
    Ok(src_hash == dest_hash)
}

/// 同步版本（用于 scan_duplicates 中的批量哈希计算）
pub fn blake3_file_sync(path: &str) -> Result<String> {
    let file = std::fs::File::open(path)?;
    let mut reader = BufReader::with_capacity(CHUNK_SIZE, file);
    let mut hasher = blake3::Hasher::new();
    let mut buf = vec![0u8; CHUNK_SIZE];
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}
