use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;

// ——————————————————————————————————————————————
// 版本更新检查（GitHub Release API）
// ——————————————————————————————————————————————

/// 当前应用版本（与 Cargo.toml / tauri.conf.json 保持一致）
const CURRENT_VERSION: &str = "1.4.0";

/// GitHub 仓库地址，修改为你的实际仓库
const GITHUB_REPO: &str = "your-username/filewise";

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

/// IPC: 计算磁盘健康评分（基于索引统计 + 磁盘使用率）
#[tauri::command]
pub async fn get_health_score(state: State<'_, AppState>) -> Result<HealthReport, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut score: i32 = 100;
    let mut issues: Vec<String> = Vec::new();
    let mut freeable_bytes: u64 = 0;

    // 1. 磁盘使用率检查（最多扣 30 分）
    let mut disk_ok = true;
    if let Ok(sys_info) = get_disk_info_inner() {
        for disk in &sys_info {
            let pct = disk.used_space as f64 / disk.total_space as f64 * 100.0;
            if pct > 95.0 {
                score -= 30; issues.push(format!("{} 磁盘使用率 {:.0}%，严重不足", disk.mount_point, pct));
                disk_ok = false;
            } else if pct > 85.0 {
                score -= 15; issues.push(format!("{} 磁盘使用率 {:.0}%，建议清理", disk.mount_point, pct));
                disk_ok = false;
            } else if pct > 75.0 {
                score -= 5;
            }
        }
    }
    if disk_ok { /* no deduction */ }

    // 2. 临时文件估算（查 audit_log 中的 clean 操作）
    if let Ok(temp) = std::env::var("TEMP") {
        let p = std::path::PathBuf::from(&temp);
        if p.exists() {
            let size: u64 = walkdir::WalkDir::new(&p).into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
                .filter_map(|e| e.metadata().ok())
                .map(|m| m.len())
                .sum();
            freeable_bytes += size;
            if size > 1024 * 1024 * 1024 {
                score -= 15; issues.push(format!("临时文件 {} GB，建议清理", size / (1024*1024*1024)));
            } else if size > 200 * 1024 * 1024 {
                score -= 8; issues.push(format!("临时文件 {} MB，建议清理", size / (1024*1024)));
            }
        }
    }

    // 3. 索引是否过期（超过 7 天没重新索引扣分）
    if let Ok(last_indexed) = db.query_row(
        "SELECT MAX(indexed_at) FROM file_index", [], |r| r.get::<_, Option<i64>>(0),
    ) {
        match last_indexed {
            None => { score -= 10; issues.push("尚未建立文件索引，无法提供完整功能".into()); }
            Some(ts) => {
                let days = (chrono::Utc::now().timestamp() - ts) / 86400;
                if days > 14 { score -= 10; issues.push(format!("索引已 {} 天未更新", days)); }
                else if days > 7 { score -= 5; }
            }
        }
    }

    // 4. 重复文件（有记录的）
    let dup_count: i64 = db.query_row(
        "SELECT COUNT(*) FROM file_index WHERE hash IS NOT NULL
         AND hash IN (SELECT hash FROM file_index WHERE hash!='' GROUP BY hash HAVING COUNT(*)>1)",
        [], |r| r.get(0),
    ).unwrap_or(0);
    if dup_count > 1000 {
        score -= 10; issues.push(format!("{} 个重复文件，建议去重", dup_count));
    } else if dup_count > 100 {
        score -= 5; issues.push(format!("{} 个重复文件", dup_count));
    }

    let final_score = score.clamp(0, 100) as u8;
    if issues.is_empty() { issues.push("系统状况良好".into()); }

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
