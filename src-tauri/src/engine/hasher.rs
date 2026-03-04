use anyhow::Result;
use std::path::Path;

/// 计算文件的 BLAKE3 哈希值（用于完整性校验和去重）
pub async fn blake3_file(path: &Path) -> Result<String> {
    let path = path.to_owned();
    // 在阻塞线程池中执行，避免阻塞 async 运行时
    let hash = tokio::task::spawn_blocking(move || -> Result<String> {
        let data = std::fs::read(&path)?;
        let hash = blake3::hash(&data);
        Ok(hash.to_hex().to_string())
    })
    .await??;
    Ok(hash)
}

/// 验证文件移动前后完整性
pub async fn verify_move_integrity(src_hash: &str, dest: &Path) -> Result<bool> {
    let dest_hash = blake3_file(dest).await?;
    Ok(src_hash == dest_hash)
}
