use serde::{Deserialize, Serialize};
use tauri::{State, Emitter};
use crate::state::AppState;
use crate::commands::settings::AppSettings;

const OLLAMA_BASE: &str = "http://localhost:11434";

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

// ——————————————————————————————————————————————
// Ollama API 类型
// ——————————————————————————————————————————————

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
    system: Option<String>,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: String,
}

#[derive(Serialize, Deserialize)]
struct OllamaChatMsg {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaChatMsg>,
    stream: bool,
}

#[derive(Deserialize)]
struct OllamaChatResponse {
    message: OllamaChatMsg,
}

// ——————————————————————————————————————————————
// 内部辅助：读取当前设置的模型名称
// ——————————————————————————————————————————————

fn get_ai_settings(state: &AppState) -> AppSettings {
    if let Ok(db) = state.db.lock() {
        if let Ok(json) = db.query_row(
            "SELECT value FROM settings WHERE key = 'app_settings'",
            [],
            |r| r.get::<_, String>(0),
        ) {
            if let Ok(s) = serde_json::from_str::<AppSettings>(&json) {
                return s;
            }
        }
    }
    AppSettings::default()
}

fn get_model(state: &AppState) -> String {
    get_ai_settings(state).ai_model
}

/// OpenAI-compatible /v1/chat/completions 响应
#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}
#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIMsg,
}
#[derive(Deserialize)]
struct OpenAIMsg {
    content: String,
}

/// 云端 AI 对话（OpenAI 兼容接口：通义千问/DeepSeek/Moonshot/OpenAI 等）
async fn cloud_chat(
    settings: &AppSettings,
    system_prompt: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let base_url = if settings.cloud_ai_base_url.is_empty() {
        match settings.cloud_ai_provider.as_str() {
            "deepseek"  => "https://api.deepseek.com".to_string(),
            "moonshot"  => "https://api.moonshot.cn".to_string(),
            "zhipu"     => "https://open.bigmodel.cn/api/paas".to_string(),
            "openai"    => "https://api.openai.com".to_string(),
            _ => "https://dashscope.aliyuncs.com/compatible-mode".to_string(), // 通义千问
        }
    } else {
        settings.cloud_ai_base_url.clone()
    };

    let model = if settings.cloud_ai_model.is_empty() {
        match settings.cloud_ai_provider.as_str() {
            "deepseek"  => "deepseek-chat",
            "moonshot"  => "moonshot-v1-8k",
            "zhipu"     => "glm-4-flash",
            "openai"    => "gpt-4o-mini",
            _ => "qwen-plus",
        }.to_string()
    } else {
        settings.cloud_ai_model.clone()
    };

    let mut msgs = vec![
        serde_json::json!({"role": "system", "content": system_prompt}),
    ];
    let history = if messages.len() > 10 { &messages[messages.len()-10..] } else { messages };
    for m in history {
        msgs.push(serde_json::json!({"role": m.role, "content": m.content}));
    }

    let body = serde_json::json!({
        "model": model,
        "messages": msgs,
        "stream": false,
    });

    let client = http_client();
    let resp = client
        .post(format!("{}/v1/chat/completions", base_url))
        .header("Authorization", format!("Bearer {}", settings.cloud_ai_api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("云端 AI 连接失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("云端 AI 错误 {}: {}", status, text));
    }

    let data: OpenAIResponse = resp.json().await.map_err(|e| format!("解析响应失败: {}", e))?;
    data.choices.first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| "云端 AI 返回空响应".to_string())
}

// ——————————————————————————————————————————————
// 构建实时上下文（注入 AI system prompt）
// ——————————————————————————————————————————————

fn build_context(state: &AppState) -> String {
    let mut lines: Vec<String> = Vec::new();

    // 磁盘信息
    let disks = sysinfo::Disks::new_with_refreshed_list();
    for d in disks.list() {
        let total = d.total_space();
        let avail = d.available_space();
        let used = total.saturating_sub(avail);
        let pct = if total > 0 { used as f64 / total as f64 * 100.0 } else { 0.0 };
        lines.push(format!(
            "- 磁盘 {}: 总容量 {:.1}GB, 已用 {:.1}GB ({:.0}%), 可用 {:.1}GB",
            d.mount_point().display(),
            total as f64 / 1e9, used as f64 / 1e9, pct, avail as f64 / 1e9
        ));
    }

    // 索引统计
    if let Ok(db) = state.db.lock() {
        if let Ok((cnt, sz)) = db.query_row::<(i64, i64), _, _>(
            "SELECT COUNT(*), COALESCE(SUM(size),0) FROM file_index", [],
            |r| Ok((r.get(0)?, r.get(1)?))
        ) {
            lines.push(format!("- 已索引文件: {} 个, 总大小 {:.1}GB", cnt, sz as f64 / 1e9));
        }

        // 分类统计 top 5
        if let Ok(mut stmt) = db.prepare(
            "SELECT COALESCE(category,'其他'), COUNT(*) FROM file_index GROUP BY category ORDER BY COUNT(*) DESC LIMIT 5"
        ) {
            let cats: Vec<String> = stmt.query_map([], |r| {
                Ok(format!("{}({}个)", r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
            }).ok().map(|rows| rows.filter_map(|r| r.ok()).collect()).unwrap_or_default();
            if !cats.is_empty() {
                lines.push(format!("- 文件分类: {}", cats.join(", ")));
            }
        }

        // 隔离区
        if let Ok(qcnt) = db.query_row::<i64, _, _>(
            "SELECT COUNT(*) FROM quarantine", [], |r| r.get(0)
        ) {
            if qcnt > 0 { lines.push(format!("- 隔离区: {} 个文件", qcnt)); }
        }

        // 快照
        if let Ok(scnt) = db.query_row::<i64, _, _>(
            "SELECT COUNT(*) FROM snapshots WHERE status='active'", [], |r| r.get(0)
        ) {
            if scnt > 0 { lines.push(format!("- 可恢复快照: {} 个", scnt)); }
        }
    }

    lines.join("\n")
}

// ——————————————————————————————————————————————
// IPC: 健康检查 — 检测 Ollama 是否在线
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn check_ollama() -> Result<bool, String> {
    let client = http_client();
    match client
        .get(format!("{}/api/tags", OLLAMA_BASE))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(r) => Ok(r.status().is_success()),
        Err(_) => Ok(false),
    }
}

// ——————————————————————————————————————————————
// IPC: 列出本地已安装的 Ollama 模型
// ——————————————————————————————————————————————

#[derive(Deserialize, Serialize)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
}

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<TagEntry>,
}

#[derive(Deserialize)]
struct TagEntry {
    name: String,
    size: u64,
}

#[tauri::command]
pub async fn list_ollama_models() -> Result<Vec<OllamaModel>, String> {
    let client = http_client();
    let resp = client
        .get(format!("{}/api/tags", OLLAMA_BASE))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("Ollama 未运行: {}", e))?;

    let tags: TagsResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(tags.models.into_iter().map(|m| OllamaModel { name: m.name, size: m.size }).collect())
}

// ——————————————————————————————————————————————
// IPC: AI 对话（带系统提示词 + 文件助手上下文）
// ——————————————————————————————————————————————

const FILE_ASSISTANT_SYSTEM: &str = r#"你是 FileWise AI 智能助手（Agent模式），内嵌在 FileWise 桌面应用中。你可以直接调用工具来帮用户完成文件管理任务。

## 可用工具
当你需要执行操作时，请在回复中包含 ACTION 标记：

```action
{"tool": "工具名", "params": {参数}}
```

### 一、系统监控
1. `health_check` — 执行系统健康检查。params: {}
2. `get_disk_info` — 获取磁盘使用情况。params: {}
3. `get_index_stats` — 获取文件索引统计。params: {}
4. `navigate` — 跳转页面。params: {"page": "dashboard|organize|clean|search|chat|report|settings|help|security|image"}

### 二、文件管理
5. `scan_directory` — 扫描目录文件列表。params: {"path": "目录路径"}
6. `search_files` — 搜索文件。params: {"keyword": "关键词"}
7. `search_files_advanced` — 高级搜索（支持多条件组合）。params: {"keyword":"", "category":"文档|图片|视频|音乐|代码|压缩包", "extensions":[".pdf",".docx"], "size_min":0, "size_max":0, "modified_after":"2026-01-01", "modified_before":"2026-03-01", "path_prefix":"D:\\"}
8. `move_files` — 移动/归档文件。params: {"files": [{"source":"原路径","target":"目标路径"}]}
9. `scan_large_files` — 扫描大文件。params: {"path": "目录路径", "min_size_mb": 100}
10. `scan_duplicates` — 扫描重复文件。params: {"path": "目录路径"}
11. `read_file_preview` — 读取文件前 2KB 预览。params: {"path": "文件路径"}

### 三、清理操作
12. `scan_clean` — 扫描可清理项目。params: {}
13. `execute_clean` — 执行清理（需要先 scan_clean 获取路径列表）。params: {"paths": ["路径1","路径2"]}

### 四、隔离区
14. `quarantine_file` — 隔离文件（安全删除，30天可恢复）。params: {"path": "文件路径"}
15. `list_quarantine` — 查看隔离区文件列表。params: {}
16. `restore_quarantine` — 恢复隔离文件。params: {"id": 数字}

### 五、安全功能
17. `vault_encrypt` — 加密文件到保险箱。params: {"path": "文件路径", "password": "密码"}
18. `vault_decrypt` — 从保险箱解密。params: {"id": 数字, "password": "密码", "target_dir": "输出目录"}
19. `vault_list` — 列出保险箱文件。params: {}
20. `scan_sensitive` — 扫描敏感信息（身份证、银行卡等）。params: {"path": "目录路径"}
21. `check_integrity` — 文件完整性校验。params: {"path": "目录路径"}

### 六、监控与自动化
22. `watch_directory` — 启动目录实时监控。params: {"path": "目录路径"}
23. `stop_watcher` — 停止目录监控。params: {}
24. `create_rule` — 创建自动化规则。params: {"name": "规则名", "trigger_type": "file_created|schedule|disk_threshold", "trigger_config": {}, "action_type": "move|clean|notify", "action_config": {}}

### 七、图片标签
25. `tag_images` — AI 标注图片内容标签。params: {"path": "图片目录", "model": "llava:7b"}
26. `search_images` — 按标签搜索图片。params: {"keyword": "标签关键词"}

### 八、任务规划
27. `plan_tasks` — 生成分步执行计划（用于复合任务）。返回计划列表供用户确认。

## 回答规则
- 当用户请求可以用工具完成的操作时，**直接调用工具执行**，不要只是告诉用户去哪个页面
- 对于复合任务（如"全面体检然后清理并生成报告"），先调用 plan_tasks 生成执行计划，让用户确认后分步执行
- 如果工具执行后系统会返回 [OBSERVATION]，你需要根据结果继续思考和回答
- 回复简洁、专业，使用中文，可用 Markdown 格式
- 工具调用时先简短说明你要做什么，然后给出 action 块
- 如果不需要工具调用（如普通问答），正常回复即可，不要强行插入 action
- 不要推荐第三方工具，FileWise 已内置所有功能
- 当用户描述模糊时（如"收拾一下电脑"），主动分析并调用多个工具完成
- 注意上下文：利用【当前系统状态】里的信息给出个性化建议
- 用户提到文件路径时，可用 read_file_preview 读取预览来了解文件内容"#;

#[derive(Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,   // "user" | "assistant"
    pub content: String,
}

#[tauri::command]
pub async fn ai_chat(
    messages: Vec<ChatMessage>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let settings = get_ai_settings(&state);

    // 收集实时系统状态注入上下文
    let context = build_context(&state);
    let system_prompt = if context.is_empty() {
        FILE_ASSISTANT_SYSTEM.to_string()
    } else {
        format!("{}\n\n【当前系统状态】\n{}", FILE_ASSISTANT_SYSTEM, context)
    };

    // 路由：本地 Ollama 或云端 API
    if !settings.local_ai && !settings.cloud_ai_api_key.is_empty() {
        return cloud_chat(&settings, &system_prompt, &messages).await;
    }

    // 本地 Ollama 对话
    let model = settings.ai_model.clone();
    let client = http_client();

    let mut chat_msgs: Vec<OllamaChatMsg> = vec![
        OllamaChatMsg { role: "system".to_string(), content: system_prompt },
    ];
    let history = if messages.len() > 10 { &messages[messages.len()-10..] } else { &messages[..] };
    for m in history {
        chat_msgs.push(OllamaChatMsg {
            role: m.role.clone(),
            content: m.content.clone(),
        });
    }

    let body = OllamaChatRequest { model, messages: chat_msgs, stream: false };

    let resp = client
        .post(format!("{}/api/chat", OLLAMA_BASE))
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Ollama 连接失败: {}。请确保已安装并运行 Ollama。", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama 错误 {}: {}", status, text));
    }

    let chat_resp: OllamaChatResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(chat_resp.message.content)
}

// ——————————————————————————————————————————————
// IPC: 智能文件分类建议（给定文件名列表，返回分类方案）
// ——————————————————————————————————————————————

#[derive(Serialize, Deserialize)]
pub struct ClassifySuggestion {
    pub file: String,
    pub suggested_category: String,
    pub suggested_folder: String,
    pub reason: String,
}

#[tauri::command]
pub async fn ai_classify_files(
    file_names: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<ClassifySuggestion>, String> {
    if file_names.is_empty() {
        return Ok(vec![]);
    }
    let model = get_model(&state);
    let client = http_client();

    let files_str = file_names.iter().take(30).cloned().collect::<Vec<_>>().join("\n");
    let prompt = format!(
        "请对以下文件名进行分类，返回 JSON 数组，每项包含 file、suggested_category、suggested_folder、reason 字段。\n\
         分类参考：文档/图片/视频/音乐/代码/压缩包/数据/其他。\n\
         文件名列表：\n{}\n\n只返回 JSON，不要其他文字。",
        files_str
    );

    let body = OllamaRequest {
        model,
        prompt,
        stream: false,
        system: Some("你是文件分类专家，只返回 JSON 数组，格式严格。".to_string()),
    };

    let resp = client
        .post(format!("{}/api/generate", OLLAMA_BASE))
        .json(&body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("Ollama 连接失败: {}", e))?;

    let gen: OllamaResponse = resp.json().await.map_err(|e| e.to_string())?;
    let text = gen.response.trim().to_string();

    // 提取 JSON 数组部分（模型可能包含额外文字）
    let json_start = text.find('[').unwrap_or(0);
    let json_end   = text.rfind(']').map(|i| i + 1).unwrap_or(text.len());
    let json_slice = &text[json_start..json_end];

    serde_json::from_str::<Vec<ClassifySuggestion>>(json_slice)
        .map_err(|e| format!("AI 返回格式解析失败: {}\n原始回复: {}", e, &text[..text.len().min(200)]))
}

// ——————————————————————————————————————————————
// IPC: 流式 AI 对话（通过 Tauri event 逐 token 推送）
// ——————————————————————————————————————————————

#[derive(Deserialize)]
struct OllamaStreamChunk {
    message: Option<OllamaStreamMsg>,
    done: Option<bool>,
}

#[derive(Deserialize)]
struct OllamaStreamMsg {
    content: Option<String>,
}

#[tauri::command]
pub async fn ai_chat_stream(
    messages: Vec<ChatMessage>,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let settings = get_ai_settings(&state);
    let context = build_context(&state);
    let system_prompt = if context.is_empty() {
        FILE_ASSISTANT_SYSTEM.to_string()
    } else {
        format!("{}\n\n【当前系统状态】\n{}", FILE_ASSISTANT_SYSTEM, context)
    };

    // 云端暂不支持流式，回退到普通调用
    if !settings.local_ai && !settings.cloud_ai_api_key.is_empty() {
        let result = cloud_chat(&settings, &system_prompt, &messages).await?;
        let _ = app.emit("ai-stream-chunk", &result);
        let _ = app.emit("ai-stream-done", ());
        return Ok(result);
    }

    let model = settings.ai_model.clone();
    let client = http_client();

    let mut chat_msgs: Vec<OllamaChatMsg> = vec![
        OllamaChatMsg { role: "system".to_string(), content: system_prompt },
    ];
    let history = if messages.len() > 20 { &messages[messages.len()-20..] } else { &messages[..] };
    for m in history {
        chat_msgs.push(OllamaChatMsg { role: m.role.clone(), content: m.content.clone() });
    }

    let body = serde_json::json!({
        "model": model,
        "messages": chat_msgs,
        "stream": true,
    });

    let resp = client
        .post(format!("{}/api/chat", OLLAMA_BASE))
        .json(&body)
        .timeout(std::time::Duration::from_secs(180))
        .send()
        .await
        .map_err(|e| format!("Ollama 连接失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama 错误 {}: {}", status, text));
    }

    let mut full_response = String::new();
    let stream = resp;

    // 读取 NDJSON 流
    let bytes = stream.bytes().await.map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&bytes);
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        if let Ok(chunk) = serde_json::from_str::<OllamaStreamChunk>(line) {
            if let Some(msg) = &chunk.message {
                if let Some(content) = &msg.content {
                    full_response.push_str(content);
                    let _ = app.emit("ai-stream-chunk", content);
                }
            }
            if chunk.done.unwrap_or(false) {
                break;
            }
        }
    }

    let _ = app.emit("ai-stream-done", ());
    Ok(full_response)
}

// ——————————————————————————————————————————————
// IPC: 图片视觉对话（多模态）
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn ai_vision_chat(
    image_path: String,
    prompt: String,
    model: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let settings = get_ai_settings(&state);
    let vision_model = model.unwrap_or_else(|| {
        if settings.ai_model.contains("llava") || settings.ai_model.contains("moondream") {
            settings.ai_model.clone()
        } else {
            "llava:7b".to_string()
        }
    });

    // 读取图片为 base64
    let img_bytes = tokio::fs::read(&image_path).await
        .map_err(|e| format!("读取图片失败: {}", e))?;
    use base64::Engine;
    let img_b64 = base64::engine::general_purpose::STANDARD.encode(&img_bytes);

    let client = http_client();
    let body = serde_json::json!({
        "model": vision_model,
        "prompt": prompt,
        "images": [img_b64],
        "stream": false,
    });

    let resp = client
        .post(format!("{}/api/generate", OLLAMA_BASE))
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Ollama 视觉模型连接失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("视觉模型错误 {}: {}", status, text));
    }

    let gen: OllamaResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(gen.response)
}

// ——————————————————————————————————————————————
// IPC: 读取文件前 N 字节预览
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn read_file_preview(
    path: String,
    max_bytes: Option<usize>,
) -> Result<String, String> {
    use tokio::io::AsyncReadExt;
    let limit = max_bytes.unwrap_or(2048);
    let mut f = tokio::fs::File::open(&path).await
        .map_err(|e| format!("无法打开文件: {}", e))?;
    let mut buf = vec![0u8; limit];
    let n = f.read(&mut buf).await.map_err(|e| e.to_string())?;
    buf.truncate(n);

    // 尝试 UTF-8，失败则用 lossy
    let text = String::from_utf8(buf.clone())
        .unwrap_or_else(|_| String::from_utf8_lossy(&buf).to_string());

    let meta = tokio::fs::metadata(&path).await.ok();
    let size_str = meta.as_ref().map(|m| format!("{:.1}KB", m.len() as f64 / 1024.0)).unwrap_or_default();

    Ok(format!("[文件预览: {} ({})] 前{}字节:\n{}", path, size_str, n, text))
}

// ——————————————————————————————————————————————
// IPC: 高级文件搜索（多条件组合）
// ——————————————————————————————————————————————

#[derive(Debug, Serialize, Deserialize)]
pub struct AdvancedQuery {
    pub keyword: Option<String>,
    pub category: Option<String>,
    pub extensions: Option<Vec<String>>,
    pub size_min: Option<i64>,
    pub size_max: Option<i64>,
    pub modified_after: Option<String>,
    pub modified_before: Option<String>,
    pub path_prefix: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AdvancedSearchResult {
    pub path: String,
    pub name: String,
    pub size: i64,
    pub modified_at: Option<i64>,
    pub category: Option<String>,
    pub extension: Option<String>,
}

#[tauri::command]
pub async fn search_files_advanced(
    query: AdvancedQuery,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<AdvancedSearchResult>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let max = limit.unwrap_or(50);

    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(kw) = &query.keyword {
        if !kw.is_empty() {
            conditions.push("name LIKE ?".to_string());
            params.push(Box::new(format!("%{}%", kw)));
        }
    }
    if let Some(cat) = &query.category {
        if !cat.is_empty() {
            conditions.push("category = ?".to_string());
            params.push(Box::new(cat.clone()));
        }
    }
    if let Some(exts) = &query.extensions {
        if !exts.is_empty() {
            let placeholders: Vec<String> = exts.iter().enumerate().map(|_| "?".to_string()).collect();
            conditions.push(format!("extension IN ({})", placeholders.join(",")));
            for ext in exts {
                params.push(Box::new(ext.clone()));
            }
        }
    }
    if let Some(smin) = query.size_min {
        if smin > 0 {
            conditions.push("size >= ?".to_string());
            params.push(Box::new(smin));
        }
    }
    if let Some(smax) = query.size_max {
        if smax > 0 {
            conditions.push("size <= ?".to_string());
            params.push(Box::new(smax));
        }
    }
    if let Some(after) = &query.modified_after {
        if !after.is_empty() {
            if let Ok(dt) = chrono::NaiveDate::parse_from_str(after, "%Y-%m-%d") {
                let ts = dt.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp();
                conditions.push("modified_at >= ?".to_string());
                params.push(Box::new(ts));
            }
        }
    }
    if let Some(before) = &query.modified_before {
        if !before.is_empty() {
            if let Ok(dt) = chrono::NaiveDate::parse_from_str(before, "%Y-%m-%d") {
                let ts = dt.and_hms_opt(23, 59, 59).unwrap().and_utc().timestamp();
                conditions.push("modified_at <= ?".to_string());
                params.push(Box::new(ts));
            }
        }
    }
    if let Some(prefix) = &query.path_prefix {
        if !prefix.is_empty() {
            conditions.push("path LIKE ?".to_string());
            params.push(Box::new(format!("{}%", prefix)));
        }
    }

    let where_clause = if conditions.is_empty() {
        "1=1".to_string()
    } else {
        conditions.join(" AND ")
    };

    let sql = format!(
        "SELECT path, name, size, modified_at, category, extension FROM file_index WHERE {} ORDER BY modified_at DESC LIMIT ?",
        where_clause
    );
    params.push(Box::new(max));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let rows: Vec<AdvancedSearchResult> = stmt.query_map(param_refs.as_slice(), |r| {
        Ok(AdvancedSearchResult {
            path: r.get(0)?,
            name: r.get(1)?,
            size: r.get(2)?,
            modified_at: r.get(3)?,
            category: r.get(4)?,
            extension: r.get(5)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(rows)
}

// ——————————————————————————————————————————————
// IPC: 获取用户行为摘要（注入 AI 上下文）
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn get_user_behavior_summary(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut lines: Vec<String> = Vec::new();

    let now = chrono::Utc::now().timestamp();
    let week_ago = now - 7 * 86400;

    // 最近 7 天操作统计
    if let Ok(mut stmt) = db.prepare(
        "SELECT action, COUNT(*) FROM audit_log WHERE ts > ?1 GROUP BY action ORDER BY COUNT(*) DESC LIMIT 5"
    ) {
        let actions: Vec<String> = stmt.query_map([week_ago], |r| {
            Ok(format!("{}({}次)", r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        }).ok().map(|rows| rows.filter_map(|r| r.ok()).collect()).unwrap_or_default();
        if !actions.is_empty() {
            lines.push(format!("最近7天操作: {}", actions.join(", ")));
        }
    }

    // 高频搜索关键词（从审计日志 detail 提取）
    if let Ok(mut stmt) = db.prepare(
        "SELECT detail, COUNT(*) FROM audit_log WHERE action = 'search' AND ts > ?1 GROUP BY detail ORDER BY COUNT(*) DESC LIMIT 3"
    ) {
        let keywords: Vec<String> = stmt.query_map([week_ago], |r| {
            Ok(r.get::<_, String>(0).unwrap_or_default())
        }).ok().map(|rows| rows.filter_map(|r| r.ok()).filter(|s| !s.is_empty()).collect()).unwrap_or_default();
        if !keywords.is_empty() {
            lines.push(format!("高频搜索: {}", keywords.join(", ")));
        }
    }

    // 最近操作的目录
    if let Ok(mut stmt) = db.prepare(
        "SELECT DISTINCT path FROM audit_log WHERE path IS NOT NULL AND ts > ?1 ORDER BY ts DESC LIMIT 5"
    ) {
        let paths: Vec<String> = stmt.query_map([week_ago], |r| {
            r.get::<_, String>(0)
        }).ok().map(|rows| rows.filter_map(|r| r.ok()).collect()).unwrap_or_default();
        if !paths.is_empty() {
            // 提取目录部分
            let dirs: Vec<String> = paths.iter()
                .filter_map(|p| std::path::Path::new(p).parent().map(|d| d.display().to_string()))
                .collect::<std::collections::HashSet<_>>()
                .into_iter().take(3).collect();
            if !dirs.is_empty() {
                lines.push(format!("活跃目录: {}", dirs.join(", ")));
            }
        }
    }

    Ok(lines.join("\n"))
}
