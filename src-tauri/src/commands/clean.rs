use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CleanTarget {
    pub name: String,
    pub description: String,
    pub path: String,
    pub size: u64,
    pub file_count: u64,
    pub level: String,   // "safe" | "warn"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CleanResult {
    pub freed_bytes: u64,
    pub deleted_count: u64,
    pub failed: Vec<String>,
}

/// IPC: 扫描 Windows 系统可清理项（返回各类临时文件的大小统计）
#[tauri::command]
pub async fn scan_clean_targets() -> Result<Vec<CleanTarget>, String> {
    let mut targets: Vec<CleanTarget> = Vec::new();

    // 1. 用户临时文件夹 %TEMP%
    if let Ok(temp) = std::env::var("TEMP") {
        let p = PathBuf::from(&temp);
        if p.exists() {
            let (size, count) = scan_dir_stats(&p);
            targets.push(CleanTarget {
                name: "用户临时文件".into(),
                description: format!("Windows 临时目录 ({})", temp),
                path: temp,
                size, file_count: count,
                level: "safe".into(),
            });
        }
    }

    // 2. 系统临时文件夹 C:\Windows\Temp
    let win_temp = PathBuf::from(r"C:\Windows\Temp");
    if win_temp.exists() {
        let (size, count) = scan_dir_stats(&win_temp);
        targets.push(CleanTarget {
            name: "系统临时文件".into(),
            description: "C:\\Windows\\Temp 系统临时目录".into(),
            path: win_temp.to_string_lossy().into(),
            size, file_count: count,
            level: "safe".into(),
        });
    }

    // 3. 缩略图缓存 %LOCALAPPDATA%\Microsoft\Windows\Explorer
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let thumb = PathBuf::from(&local)
            .join("Microsoft").join("Windows").join("Explorer");
        if thumb.exists() {
            let (size, count) = count_files_by_pattern(&thumb, "thumbcache_");
            if count > 0 {
                targets.push(CleanTarget {
                    name: "缩略图缓存".into(),
                    description: "Windows 图片缩略图缓存数据库".into(),
                    path: thumb.to_string_lossy().into(),
                    size, file_count: count,
                    level: "safe".into(),
                });
            }
        }
    }

    // 4. Chrome 缓存
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let chrome_cache = PathBuf::from(&local)
            .join("Google").join("Chrome").join("User Data")
            .join("Default").join("Cache");
        if chrome_cache.exists() {
            let (size, count) = scan_dir_stats(&chrome_cache);
            if count > 0 {
                targets.push(CleanTarget {
                    name: "Chrome 缓存".into(),
                    description: "Google Chrome 浏览器缓存".into(),
                    path: chrome_cache.to_string_lossy().into(),
                    size, file_count: count,
                    level: "safe".into(),
                });
            }
        }
    }

    // 5. Edge 缓存
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let edge_cache = PathBuf::from(&local)
            .join("Microsoft").join("Edge").join("User Data")
            .join("Default").join("Cache");
        if edge_cache.exists() {
            let (size, count) = scan_dir_stats(&edge_cache);
            if count > 0 {
                targets.push(CleanTarget {
                    name: "Edge 缓存".into(),
                    description: "Microsoft Edge 浏览器缓存".into(),
                    path: edge_cache.to_string_lossy().into(),
                    size, file_count: count,
                    level: "safe".into(),
                });
            }
        }
    }

    // 6. 回收站（统计各磁盘回收站大小）
    let recycle_size = scan_recycle_bin();
    if recycle_size > 0 {
        targets.push(CleanTarget {
            name: "回收站".into(),
            description: "已删除但可恢复的文件".into(),
            path: "$RECYCLE.BIN".into(),
            size: recycle_size,
            file_count: 0,
            level: "warn".into(),
        });
    }

    // 7. Windows 更新缓存 C:\Windows\SoftwareDistribution\Download
    let wu_cache = PathBuf::from(r"C:\Windows\SoftwareDistribution\Download");
    if wu_cache.exists() {
        let (size, count) = scan_dir_stats(&wu_cache);
        if count > 0 {
            targets.push(CleanTarget {
                name: "Windows 更新缓存".into(),
                description: "Windows Update 已下载的更新包".into(),
                path: wu_cache.to_string_lossy().into(),
                size, file_count: count,
                level: "safe".into(),
            });
        }
    }

    // 8. 开发缓存（node_modules / .gradle / __pycache__ / .tox 等）
    if let Ok(home) = std::env::var("USERPROFILE") {
        let search_roots = [
            PathBuf::from(&home).join("Desktop"),
            PathBuf::from(&home).join("Documents"),
            PathBuf::from(&home).join("Downloads"),
            PathBuf::from("D:\\"),
        ];
        let dev_patterns = [
            ("node_modules",   "Node.js 依赖缓存",   "warn"),
            (".gradle",        "Gradle 构建缓存",     "safe"),
            ("__pycache__",    "Python 字节码缓存",   "safe"),
            (".tox",           "Python tox 缓存",     "safe"),
            (".pytest_cache",  "pytest 缓存",         "safe"),
            ("target",         "Rust/Maven 编译输出", "warn"),
        ];
        for root in &search_roots {
            if !root.exists() { continue; }
            for entry in WalkDir::new(root).max_depth(4).into_iter().filter_map(|e| e.ok()) {
                let fname = entry.file_name().to_string_lossy().to_string();
                for (pattern, desc, level) in &dev_patterns {
                    if fname == *pattern && entry.file_type().is_dir() {
                        let (size, count) = scan_dir_stats(entry.path());
                        if size > 10 * 1024 * 1024 { // 仅报告 >10MB
                            targets.push(CleanTarget {
                                name: format!("{} ({})", pattern, entry.path().parent()
                                    .map(|p| p.file_name().unwrap_or_default().to_string_lossy().to_string())
                                    .unwrap_or_default()),
                                description: desc.to_string(),
                                path: entry.path().to_string_lossy().into(),
                                size, file_count: count,
                                level: level.to_string(),
                            });
                        }
                        break;
                    }
                }
            }
        }
    }

    // 9. 空文件夹扫描（用户目录内）
    if let Ok(home) = std::env::var("USERPROFILE") {
        let mut empty_count = 0u64;
        let search_roots = [
            PathBuf::from(&home).join("Desktop"),
            PathBuf::from(&home).join("Documents"),
            PathBuf::from(&home).join("Downloads"),
        ];
        for root in &search_roots {
            if !root.exists() { continue; }
            for entry in WalkDir::new(root).min_depth(1).max_depth(5)
                .into_iter().filter_map(|e| e.ok())
            {
                if entry.file_type().is_dir() {
                    if let Ok(mut rd) = std::fs::read_dir(entry.path()) {
                        if rd.next().is_none() {
                            empty_count += 1;
                        }
                    }
                }
            }
        }
        if empty_count > 0 {
            targets.push(CleanTarget {
                name: "空文件夹".into(),
                description: format!("检测到 {} 个空目录，可安全删除", empty_count),
                path: "__empty_dirs__".into(),
                size: 0,
                file_count: empty_count,
                level: "safe".into(),
            });
        }
    }

    // 按大小降序
    targets.sort_by(|a, b| b.size.cmp(&a.size));
    Ok(targets)
}

/// IPC: 执行清理（删除指定路径下的文件，跳过只读/锁定文件）
#[tauri::command]
pub async fn execute_clean(paths: Vec<String>) -> Result<CleanResult, String> {
    let mut freed_bytes = 0u64;
    let mut deleted_count = 0u64;
    let mut failed: Vec<String> = Vec::new();

    for dir_path in &paths {
        // 回收站特殊处理
        if dir_path == "$RECYCLE.BIN" {
            match empty_recycle_bin() {
                Ok(bytes) => { freed_bytes += bytes; }
                Err(e) => { failed.push(format!("回收站清理失败: {}", e)); }
            }
            continue;
        }

        // 空文件夹批量清理
        if dir_path == "__empty_dirs__" {
            if let Ok(home) = std::env::var("USERPROFILE") {
                let roots = [
                    PathBuf::from(&home).join("Desktop"),
                    PathBuf::from(&home).join("Documents"),
                    PathBuf::from(&home).join("Downloads"),
                ];
                for root in &roots {
                    if !root.exists() { continue; }
                    // 从最深层往上扫删
                    let entries: Vec<_> = WalkDir::new(root).min_depth(1).max_depth(8)
                        .into_iter().filter_map(|e| e.ok())
                        .filter(|e| e.file_type().is_dir())
                        .collect();
                    for entry in entries.iter().rev() {
                        if let Ok(mut rd) = std::fs::read_dir(entry.path()) {
                            if rd.next().is_none() {
                                if std::fs::remove_dir(entry.path()).is_ok() {
                                    deleted_count += 1;
                                }
                            }
                        }
                    }
                }
            }
            continue;
        }

        let p = Path::new(dir_path);
        if !p.exists() { continue; }

        for entry in WalkDir::new(p).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_dir() { continue; }
            let file_path = entry.path();
            match entry.metadata() {
                Ok(meta) => {
                    let size = meta.len();
                    match std::fs::remove_file(file_path) {
                        Ok(_) => {
                            freed_bytes += size;
                            deleted_count += 1;
                        }
                        Err(e) => {
                            // 被锁定/只读文件静默跳过，记录到 failed
                            failed.push(format!("{}: {}", file_path.display(), e));
                        }
                    }
                }
                Err(_) => continue,
            }
        }

        // 删除空目录（可选，非强制）
        let _ = remove_empty_dirs(p);
    }

    Ok(CleanResult { freed_bytes, deleted_count, failed })
}

// ===================== 辅助函数 =====================

/// 统计目录下所有文件的总大小和数量（最多扫描 5 层）
fn scan_dir_stats(path: &Path) -> (u64, u64) {
    let mut total_size = 0u64;
    let mut count = 0u64;
    for entry in WalkDir::new(path).max_depth(5).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Ok(meta) = entry.metadata() {
                total_size += meta.len();
                count += 1;
            }
        }
    }
    (total_size, count)
}

/// 统计目录下以特定前缀开头的文件
fn count_files_by_pattern(path: &Path, prefix: &str) -> (u64, u64) {
    let mut total_size = 0u64;
    let mut count = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(prefix) {
                if let Ok(meta) = entry.metadata() {
                    total_size += meta.len();
                    count += 1;
                }
            }
        }
    }
    (total_size, count)
}

/// 统计各磁盘回收站大小（遍历 C/D/E 等盘的 $RECYCLE.BIN）
fn scan_recycle_bin() -> u64 {
    let mut total = 0u64;
    for drive in ['C', 'D', 'E', 'F', 'G', 'H'] {
        let recycle = PathBuf::from(format!("{}:\\$RECYCLE.BIN", drive));
        if recycle.exists() {
            let (size, _) = scan_dir_stats(&recycle);
            total += size;
        }
    }
    total
}

/// 清空回收站（Windows API：通过 SHEmptyRecycleBin）
fn empty_recycle_bin() -> Result<u64, String> {
    // 先统计大小
    let size = scan_recycle_bin();
    // 使用 PowerShell 清空回收站（无需 WinAPI 绑定）
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command",
               "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"])
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(size)
    } else {
        Err("回收站清空命令失败".into())
    }
}

/// 递归删除空目录
fn remove_empty_dirs(path: &Path) -> std::io::Result<()> {
    if !path.is_dir() { return Ok(()); }
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        if entry.path().is_dir() {
            let _ = remove_empty_dirs(&entry.path());
        }
    }
    // 如果目录已空，删除它
    if std::fs::read_dir(path)?.next().is_none() {
        let _ = std::fs::remove_dir(path);
    }
    Ok(())
}
