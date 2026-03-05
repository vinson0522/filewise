use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;
use std::path::Path;

const OLLAMA_BASE: &str = "http://localhost:11434";

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

// ——————————————————————————————————————————————
// 数据结构
// ——————————————————————————————————————————————

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageTag {
    pub id: i64,
    pub path: String,
    pub file_name: String,
    pub tags: String,
    pub description: String,
    pub tagged_at: String,
    pub size: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TagProgress {
    pub total: usize,
    pub completed: usize,
    pub results: Vec<ImageTag>,
    pub errors: Vec<String>,
}

// ——————————————————————————————————————————————
// Ollama Vision API
// ——————————————————————————————————————————————

#[derive(Serialize)]
struct OllamaGenerateRequest {
    model: String,
    prompt: String,
    images: Vec<String>,  // base64 encoded
    stream: bool,
}

#[derive(Deserialize)]
struct OllamaGenerateResponse {
    response: String,
}

/// 调用 Ollama vision 模型分析图片
async fn analyze_image(model: &str, image_base64: &str) -> Result<(String, String), String> {
    let client = http_client();

    let body = OllamaGenerateRequest {
        model: model.to_string(),
        prompt: "请用中文分析这张图片。\n1. 给出5个描述性标签，用逗号分隔（如：风景,山脉,日落,自然,户外）\n2. 用一句话描述图片内容\n\n请严格按以下格式返回：\n标签：标签1,标签2,标签3,标签4,标签5\n描述：一句话描述".to_string(),
        images: vec![image_base64.to_string()],
        stream: false,
    };

    let resp = client
        .post(format!("{}/api/generate", OLLAMA_BASE))
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Ollama 连接失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama 错误 {}: {}", status, text));
    }

    let gen: OllamaGenerateResponse = resp.json().await.map_err(|e| e.to_string())?;
    let text = gen.response.trim().to_string();

    // 解析标签和描述
    let mut tags = String::new();
    let mut description = String::new();

    for line in text.lines() {
        let line = line.trim();
        if line.starts_with("标签") || line.starts_with("Tags") {
            tags = line.splitn(2, ['：', ':']).nth(1).unwrap_or("").trim().to_string();
        } else if line.starts_with("描述") || line.starts_with("Description") {
            description = line.splitn(2, ['：', ':']).nth(1).unwrap_or("").trim().to_string();
        }
    }

    // 如果解析失败，用整段文字作为描述
    if tags.is_empty() && description.is_empty() {
        description = text.chars().take(200).collect();
        // 尝试提取逗号分隔的词作为标签
        if let Some(first_line) = text.lines().next() {
            if first_line.contains(',') || first_line.contains('，') {
                tags = first_line.replace('，', ",").to_string();
            }
        }
    }

    if tags.is_empty() {
        tags = "未分类".to_string();
    }

    Ok((tags, description))
}

// ——————————————————————————————————————————————
// 数据库
// ——————————————————————————————————————————————

fn ensure_image_tags_table(state: &AppState) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS image_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            file_name TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            size INTEGER NOT NULL DEFAULT 0,
            tagged_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );"
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ——————————————————————————————————————————————
// IPC 命令
// ——————————————————————————————————————————————

const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "tif", "heic", "heif"];

/// IPC: 扫描目录中的图片并用视觉模型打标签
#[tauri::command]
pub async fn tag_images(
    path: String,
    model: Option<String>,
    state: State<'_, AppState>,
) -> Result<TagProgress, String> {
    ensure_image_tags_table(&state)?;

    let vision_model = model.unwrap_or_else(|| "llava:7b".to_string());

    // 1. 扫描目录中的图片文件
    let dir = Path::new(&path);
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("目录不存在: {}", path));
    }

    let mut image_files: Vec<(String, String, i64)> = Vec::new(); // (path, name, size)
    for entry in walkdir::WalkDir::new(dir).max_depth(5).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() { continue; }
        let ext = entry.path().extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if !IMAGE_EXTS.contains(&ext.as_str()) { continue; }
        // 跳过超过 20MB 的图片
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        if size > 20 * 1024 * 1024 { continue; }
        let file_path = entry.path().to_string_lossy().to_string();
        let file_name = entry.file_name().to_string_lossy().to_string();
        image_files.push((file_path, file_name, size as i64));
    }

    if image_files.is_empty() {
        return Ok(TagProgress { total: 0, completed: 0, results: Vec::new(), errors: Vec::new() });
    }

    // 2. 检查哪些已经打过标签
    let already_tagged: Vec<String> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db.prepare("SELECT path FROM image_tags").map_err(|e| e.to_string())?;
        let rows: Vec<String> = stmt.query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };

    let to_tag: Vec<_> = image_files.iter()
        .filter(|(p, _, _)| !already_tagged.contains(p))
        .collect();

    let total = to_tag.len();
    let mut completed = 0;
    let mut results: Vec<ImageTag> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    // 3. 逐张分析（限制最多 50 张，避免太慢）
    for (file_path, file_name, size) in to_tag.iter().take(50) {
        // 读取并转 base64
        let image_data = match std::fs::read(file_path) {
            Ok(data) => data,
            Err(e) => {
                errors.push(format!("{}: {}", file_name, e));
                continue;
            }
        };

        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&image_data);

        // 调用视觉模型
        match analyze_image(&vision_model, &b64).await {
            Ok((tags, description)) => {
                // 存入数据库
                let db = state.db.lock().map_err(|e| e.to_string())?;
                db.execute(
                    "INSERT OR REPLACE INTO image_tags (path, file_name, tags, description, size)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![file_path, file_name, tags, description, size],
                ).ok();

                results.push(ImageTag {
                    id: 0,
                    path: file_path.clone(),
                    file_name: file_name.clone(),
                    tags: tags.clone(),
                    description,
                    tagged_at: String::new(),
                    size: *size,
                });
                completed += 1;
            }
            Err(e) => {
                errors.push(format!("{}: {}", file_name, e));
            }
        }
    }

    Ok(TagProgress { total, completed, results, errors })
}

/// IPC: 按标签搜索图片
#[tauri::command]
pub async fn search_images_by_tag(
    keyword: String,
    state: State<'_, AppState>,
) -> Result<Vec<ImageTag>, String> {
    ensure_image_tags_table(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let query = format!("%{}%", keyword);
    let mut stmt = db.prepare(
        "SELECT id, path, file_name, tags, description, tagged_at, size FROM image_tags
         WHERE tags LIKE ?1 OR description LIKE ?1 OR file_name LIKE ?1
         ORDER BY tagged_at DESC LIMIT 100"
    ).map_err(|e| e.to_string())?;

    let entries: Vec<ImageTag> = stmt.query_map([&query], |row| {
        Ok(ImageTag {
            id: row.get(0)?,
            path: row.get(1)?,
            file_name: row.get(2)?,
            tags: row.get(3)?,
            description: row.get(4)?,
            tagged_at: row.get(5)?,
            size: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(entries)
}

/// IPC: 列出所有已打标签的图片
#[tauri::command]
pub async fn list_tagged_images(
    state: State<'_, AppState>,
) -> Result<Vec<ImageTag>, String> {
    ensure_image_tags_table(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db.prepare(
        "SELECT id, path, file_name, tags, description, tagged_at, size FROM image_tags
         ORDER BY tagged_at DESC LIMIT 500"
    ).map_err(|e| e.to_string())?;

    let entries: Vec<ImageTag> = stmt.query_map([], |row| {
        Ok(ImageTag {
            id: row.get(0)?,
            path: row.get(1)?,
            file_name: row.get(2)?,
            tags: row.get(3)?,
            description: row.get(4)?,
            tagged_at: row.get(5)?,
            size: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(entries)
}

/// IPC: 删除图片标签记录
#[tauri::command]
pub async fn remove_image_tag(
    id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    ensure_image_tags_table(&state)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM image_tags WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
