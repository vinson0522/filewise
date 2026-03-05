use serde::{Deserialize, Serialize};
use tauri::State;
use rusqlite::OptionalExtension;
use crate::state::AppState;

// ——————————————————————————————————————————————
// 版本更新检查（GitHub Release API）
// ——————————————————————————————————————————————

/// 当前应用版本（与 Cargo.toml / tauri.conf.json 保持一致）
const CURRENT_VERSION: &str = "1.4.0";

/// GitHub 仓库地址，修改为你的实际仓库
const GITHUB_REPO: &str = "vinson0522/filewise";

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_notes: String,
    pub download_url: String,
    pub published_at: String,
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
}

/// IPC: 检查 GitHub 上是否有新版本
#[tauri::command]
pub async fn check_update() -> Result<UpdateInfo, String> {
    let url = format!("https://api.github.com/repos/{}/releases/latest", GITHUB_REPO);

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .no_proxy()
        .user_agent("FileWise-Update-Checker")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("检查更新失败: {}", e))?;

    if !resp.status().is_success() {
        return Ok(UpdateInfo {
            has_update: false,
            current_version: CURRENT_VERSION.to_string(),
            latest_version: CURRENT_VERSION.to_string(),
            release_notes: String::new(),
            download_url: String::new(),
            published_at: String::new(),
        });
    }

    let release: GitHubRelease = resp.json().await
        .map_err(|e| format!("解析更新信息失败: {}", e))?;

    let latest = release.tag_name.trim_start_matches('v').to_string();
    let has_update = version_gt(&latest, CURRENT_VERSION);

    Ok(UpdateInfo {
        has_update,
        current_version: CURRENT_VERSION.to_string(),
        latest_version: latest,
        release_notes: release.body.unwrap_or_default(),
        download_url: release.html_url,
        published_at: release.published_at.unwrap_or_default(),
    })
}

/// 简单版本号比较: "1.5.0" > "1.4.0"
fn version_gt(a: &str, b: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.split('.').filter_map(|p| p.parse().ok()).collect()
    };
    let va = parse(a);
    let vb = parse(b);
    for i in 0..va.len().max(vb.len()) {
        let x = va.get(i).copied().unwrap_or(0);
        let y = vb.get(i).copied().unwrap_or(0);
        if x > y { return true; }
        if x < y { return false; }
    }
    false
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: i64,
    pub ts: i64,
    pub action: String,
    pub path: String,
    pub detail: String,
    pub result: String,
}

// ——————————————————————————————————————————————
// 健康评分
// ——————————————————————————————————————————————

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthReport {
    pub score: u8,               // 0-100
    pub freeable_bytes: u64,     // 估算可释放字节数
    pub issues: Vec<String>,     // 具体问题描述
}

/// 快速统计目录大小（限深度2，避免太慢）
fn dir_size_quick(path: &std::path::Path, max_depth: usize) -> u64 {
    if !path.exists() { return 0; }
    walkdir::WalkDir::new(path)
        .max_depth(max_depth)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

/// IPC: 计算磁盘健康评分（多维度综合评估）
#[tauri::command]
pub async fn get_health_score(state: State<'_, AppState>) -> Result<HealthReport, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut score: i32 = 100;
    let mut issues: Vec<String> = Vec::new();
    let mut freeable_bytes: u64 = 0;

    // 1. 磁盘使用率检查（每个磁盘最多扣15分）
    if let Ok(sys_info) = get_disk_info_inner() {
        for disk in &sys_info {
            if disk.total_space == 0 { continue; }
            let pct = disk.used_space as f64 / disk.total_space as f64 * 100.0;
            if pct > 95.0 {
                score -= 15; issues.push(format!("{} 使用率 {:.0}%，空间严重不足", disk.mount_point, pct));
            } else if pct > 85.0 {
                score -= 10; issues.push(format!("{} 使用率 {:.0}%，空间偏紧", disk.mount_point, pct));
            } else if pct > 70.0 {
                score -= 5; issues.push(format!("{} 使用率 {:.0}%", disk.mount_point, pct));
            }
        }
    }

    // 2. 临时文件（降低阈值，50MB 起扣）
    if let Ok(temp) = std::env::var("TEMP") {
        let size = dir_size_quick(&std::path::PathBuf::from(&temp), 3);
        freeable_bytes += size;
        let mb = size / (1024 * 1024);
        if mb > 1024 {
            score -= 12; issues.push(format!("临时文件 {:.1} GB，建议清理", size as f64 / 1073741824.0));
        } else if mb > 200 {
            score -= 8; issues.push(format!("临时文件 {} MB，建议清理", mb));
        } else if mb > 50 {
            score -= 3; issues.push(format!("临时文件 {} MB", mb));
        }
    }

    // 3. 桌面文件数量检查（桌面堆积是常见问题）
    if let Some(desktop) = dirs::desktop_dir() {
        let count = std::fs::read_dir(&desktop)
            .map(|rd| rd.filter_map(|e| e.ok()).count())
            .unwrap_or(0);
        if count > 100 {
            score -= 8; issues.push(format!("桌面有 {} 个文件/文件夹，建议整理", count));
        } else if count > 50 {
            score -= 4; issues.push(format!("桌面有 {} 个文件/文件夹", count));
        }
    }

    // 4. 下载文件夹大小
    if let Some(downloads) = dirs::download_dir() {
        let size = dir_size_quick(&downloads, 2);
        let gb = size as f64 / 1073741824.0;
        if gb > 10.0 {
            score -= 8; issues.push(format!("下载文件夹 {:.1} GB，建议清理", gb));
            freeable_bytes += size / 2; // 估算一半可清理
        } else if gb > 3.0 {
            score -= 4; issues.push(format!("下载文件夹 {:.1} GB", gb));
        }
    }

    // 5. 索引状态（未建索引是主要扣分项）
    if let Ok(last_indexed) = db.query_row(
        "SELECT MAX(indexed_at) FROM file_index", [], |r| r.get::<_, Option<i64>>(0),
    ) {
        match last_indexed {
            None => { score -= 15; issues.push("尚未建立文件索引，搜索功能不可用".into()); }
            Some(ts) => {
                let days = (chrono::Utc::now().timestamp() - ts) / 86400;
                if days > 30 {
                    score -= 10; issues.push(format!("索引已 {} 天未更新，数据可能不准确", days));
                } else if days > 7 {
                    score -= 5; issues.push(format!("索引 {} 天前更新", days));
                }
            }
        }
    }

    // 6. 重复文件
    let dup_count: i64 = db.query_row(
        "SELECT COUNT(*) FROM file_index WHERE hash IS NOT NULL
         AND hash IN (SELECT hash FROM file_index WHERE hash!='' GROUP BY hash HAVING COUNT(*)>1)",
        [], |r| r.get(0),
    ).unwrap_or(0);
    if dup_count > 500 {
        score -= 10; issues.push(format!("{} 个重复文件，浪费空间", dup_count));
    } else if dup_count > 50 {
        score -= 5; issues.push(format!("{} 个重复文件", dup_count));
    }

    // 7. 监控目录是否配置
    let watch_count: i64 = db.query_row(
        "SELECT COUNT(*) FROM settings WHERE key = 'watch_dirs' AND value != '[]' AND value != ''",
        [], |r| r.get(0),
    ).unwrap_or(0);
    if watch_count == 0 {
        score -= 5; issues.push("未配置文件监控目录".into());
    }

    // 8. 最近是否做过清理（30天内无清理记录扣分）
    let recent_clean: i64 = db.query_row(
        "SELECT COUNT(*) FROM audit_log WHERE action LIKE '%clean%' AND ts > ?1",
        [chrono::Utc::now().timestamp() - 30 * 86400],
        |r| r.get(0),
    ).unwrap_or(0);
    if recent_clean == 0 {
        score -= 5; issues.push("近30天未执行过清理".into());
    }

    let final_score = score.clamp(0, 100) as u8;
    if issues.is_empty() { issues.push("系统状况良好，继续保持！".into()); }

    Ok(HealthReport { score: final_score, freeable_bytes, issues })
}

fn get_disk_info_inner() -> Result<Vec<crate::commands::file_ops::DiskInfo>, String> {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();
    Ok(disks.iter().map(|d| crate::commands::file_ops::DiskInfo {
        mount_point: d.mount_point().to_string_lossy().into_owned(),
        name: d.name().to_string_lossy().into_owned(),
        total_space: d.total_space(),
        used_space: d.total_space().saturating_sub(d.available_space()),
        available_space: d.available_space(),
        fs_type: d.file_system().to_string_lossy().into_owned(),
    }).collect())
}

/// IPC: 获取审计日志（最近 200 条）
#[tauri::command]
pub async fn list_audit_log(state: State<'_, AppState>) -> Result<Vec<AuditEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, ts, action, COALESCE(path,''), COALESCE(detail,''), result
         FROM audit_log ORDER BY ts DESC LIMIT 200"
    ).map_err(|e| e.to_string())?;

    let entries = stmt.query_map([], |row| {
        Ok(AuditEntry {
            id: row.get(0)?,
            ts: row.get(1)?,
            action: row.get(2)?,
            path: row.get(3)?,
            detail: row.get(4)?,
            result: row.get(5)?,
        })
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(entries)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub local_ai: bool,
    pub auto_organize: bool,
    pub snapshot_before_op: bool,
    pub auto_start: bool,
    pub minimize_to_tray: bool,
    pub excluded_paths: Vec<String>,
    pub watch_dirs: Vec<String>,
    pub large_file_threshold_mb: u64,
    pub ai_model: String,
    #[serde(default)]
    pub index_dir: String,
    #[serde(default)]
    pub quarantine_dir: String,
    #[serde(default)]
    pub cloud_ai_provider: String,
    #[serde(default)]
    pub cloud_ai_model: String,
    #[serde(default)]
    pub cloud_ai_api_key: String,
    #[serde(default)]
    pub cloud_ai_base_url: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            local_ai: true,
            auto_organize: false,
            snapshot_before_op: true,
            auto_start: false,
            minimize_to_tray: true,
            excluded_paths: vec![
                "C:\\Windows".into(),
                "C:\\Program Files".into(),
                "C:\\Program Files (x86)".into(),
            ],
            watch_dirs: {
                let home = std::env::var("USERPROFILE").unwrap_or_default();
                vec![
                    format!("{}\\Desktop", home),
                    format!("{}\\Downloads", home),
                ]
            },
            large_file_threshold_mb: 100,
            ai_model: "qwen2.5:7b".into(),
            index_dir: String::new(),
            quarantine_dir: String::new(),
            cloud_ai_provider: String::new(),
            cloud_ai_model: String::new(),
            cloud_ai_api_key: String::new(),
            cloud_ai_base_url: String::new(),
        }
    }
}

/// IPC: 读取所有设置（从数据库，缺失则返回默认值）
#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let json: Option<String> = db.query_row(
        "SELECT value FROM settings WHERE key = 'app_settings'",
        [],
        |row| row.get(0),
    ).ok();

    match json {
        Some(j) => serde_json::from_str::<AppSettings>(&j)
            .map_err(|e| format!("设置解析失败: {}", e)),
        None => Ok(AppSettings::default()),
    }
}

/// IPC: 保存所有设置到数据库
#[tauri::command]
pub async fn save_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let json = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO settings (key, value) VALUES ('app_settings', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![json],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ——————————————————————————————————————————————
// 本地认证（密码锁）
// ——————————————————————————————————————————————

fn hash_password(password: &str) -> String {
    let hash = blake3::hash(password.as_bytes());
    hash.to_hex().to_string()
}

/// IPC: 检查是否已设置密码
#[tauri::command]
pub async fn has_password(state: State<'_, AppState>) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let exists: bool = db.query_row(
        "SELECT COUNT(*) > 0 FROM settings WHERE key = 'app_password'",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    Ok(exists)
}

/// IPC: 设置或修改密码（传空字符串则清除密码）
#[tauri::command]
pub async fn set_password(
    password: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    if password.is_empty() {
        db.execute("DELETE FROM settings WHERE key = 'app_password'", [])
            .map_err(|e| e.to_string())?;
    } else {
        let hashed = hash_password(&password);
        db.execute(
            "INSERT INTO settings (key, value) VALUES ('app_password', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![hashed],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// IPC: 验证密码
#[tauri::command]
pub async fn verify_password(
    password: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let stored: Option<String> = db.query_row(
        "SELECT value FROM settings WHERE key = 'app_password'",
        [],
        |row| row.get(0),
    ).optional().map_err(|e| e.to_string())?;

    match stored {
        Some(hash) => Ok(hash == hash_password(&password)),
        None => Ok(true), // 未设密码视为验证通过
    }
}
